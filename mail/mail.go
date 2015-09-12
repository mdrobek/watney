package mail

import (
	"crypto/tls"
	"errors"
	"fmt"
	"github.com/mxk/go-imap/imap"
	"io"
	"log"
	"mdrobek/watney/conf"
	"os"
	"strings"
	"time"
	"github.com/scorredoira/email"
	"net/smtp"
	"sync"
	"strconv"
	"net/textproto"
	"bytes"
	"bufio"
	"mime"
	"mime/multipart"
	"io/ioutil"
)

type MailCon struct {
	io.Closer
	// imap server connection client
	client *imap.Client
	// current active mailbox (this does not contain one of the sub folders, e.g., Sent, Trash, ..)
	mailbox string
	// delimiter for the current imap server
	delim string
	// configuration to be used to connect to the imap mail server
	conf *conf.MailConf
	// the logger to be used for the mail and imap package
	Logger *log.Logger
	// logging flags (taken from imap package)
	LogMask imap.LogMask
	// Quit channel to end keep alive method
	QuitChan chan struct{}
	// Mutex to synchronize IMAP access
	mutex *sync.Mutex
}

type Mail struct {
	// the unique ID of this mail as retrieved from the server
	UID uint32
	// the header information of the email
	Header *Header
	// all flags of the mail
	Flags *Flags
	// the content parts of the mail: Content-Type -> Part
	// "text/plain" -> Part
	Content Content
}

type MailInformation string
const (
	OVERVIEW string = "overview"	// UID, Header, Flags
	FULL string = "full"			// UID, Header, Flags, Content
)

type Header struct {
	// size of the mail
	Size uint32
	// the folder this email is stored in, in the mailbox ("/" = root)
	Folder string
	//	---------------- All following are parsed from the Header ----------------
	// time email was received
	Date time.Time
	// the subject of the mail (Subject:)
	Subject string
	// sender of the mail (From:)
	Sender string
	// receiver address of this mail (To:)
	// TODO: Receiver can be multiple mail addresses!
	Receiver string
	// The parsed MIMEHeader
	MimeHeader PMIMEHeader
}

// This type reflects a parsed textproto.MIMEHeader
type PMIMEHeader struct {
	// Used version of the MIME protocol
	MimeVersion float32
	// The media-type of the MIME protocol (stored in the flag: Content-Type)
	ContentType string
	// The encoding used for the Header subject (stored in Content-Transfer-Encoding)
	Encoding string
	// Boundary used in case of a multipart Content-Type
	MultipartBoundary string
}

// the content parts of the mail: Content-Type -> Part
// "text/plain" -> Part
type Content map[string]ContentPart

// The parsed content of one multipart of the mail (e.g., text/plain, text/html, ...)
type ContentPart struct {
	// The charset used to encode the body (default is UTF-8)
	Charset string
	// Encoding of the body part, e.g., quoted-printable, base64
	Encoding string
	// The body of that part
	Body string
}

// Holds the following information of a mail: Seen, Deleted, Answered
type Flags struct {
	// Whether the mail has been read already
	Seen bool			`flag: "\\Seen"`
	// Message is "deleted" for removal by later EXPUNGE
	Deleted bool		`flag: "\\Deleted"`
	// Whether the mail was answered
	Answered bool		`flag: "\\Answered"`
	// Message is "flagged" for urgent/special attention
	Flagged bool		`flag: "\\Flagged"`
	// Message has not completed composition (marked as a draft).
	Draft bool			`flag: "\\Draft"`
	// Message is "recently" arrived in this mailbox.
	Recent bool			`flag: "\\Recent"`
}

// Used to switch between the IMAP fetch used to retrieve mails
type FetchFunc func(seq *imap.SeqSet, items ...string) (cmd *imap.Command, err error)

// Used to enable sorting methods
type MailSlice []Mail

func (p MailSlice) Len() int           { return len(p) }
func (p MailSlice) Less(i, j int) bool { return p[i].Header.Date.After(p[j].Header.Date) }
func (p MailSlice) Swap(i, j int)      { p[i], p[j] = p[j], p[i] }

type HeaderSlice []Header

func (p HeaderSlice) Len() int           { return len(p) }
func (p HeaderSlice) Less(i, j int) bool { return p[i].Date.After(p[j].Date) }
func (p HeaderSlice) Swap(i, j int)      { p[i], p[j] = p[j], p[i] }

const (
	DFLT_MAILBOX_NAME  string = "INBOX"
	DFLT_MAILBOX_DELIM string = "."
)

////////////////////////////////////////////////////////////////////////////////////////////////////
///										Public Methods											 ///
////////////////////////////////////////////////////////////////////////////////////////////////////

func NewMailCon(conf *conf.MailConf) (newMC *MailCon, err error) {
	newMC = new(MailCon)
	newMC.conf = conf
	newMC.mailbox = DFLT_MAILBOX_NAME
	newMC.mutex = &sync.Mutex{}
	// Check if the given configuration is valid
	if confOK, err := newMC.checkConf(); !confOK {
		return newMC, err
	}
	// Set the logger dependent on the config input
	if newMC.conf.ImapLog {
		newMC.Logger = log.New(os.Stdout, "", 0)
		newMC.LogMask = imap.LogAll
	} else {
		newMC.LogMask = imap.LogNone
	}
	// Start establishing a connection to the imap server
	if newMC.client, err = newMC.dial(); err != nil {
		defer newMC.Close()
		return newMC, err
	}
	// Set the log mask for the newly created client
	newMC.client.SetLogMask(newMC.LogMask)
	// Set the client in the NO_OP state to continuously receive updates from the server
	if _, err = newMC.waitFor(newMC.client.Noop()); err != nil {
		defer newMC.Close()
		return newMC, err
	}
	// Schedule a NOOP keep-alive request every 30 seconds to keep the IMAP connection alive
	newMC.keepAlive(10)
	// Return the new established connection
	return newMC, nil
}

/**
 * ATTENTION: Does not close connection on authentication fail, e.g., due to wrong credentials.
 */
func (mc *MailCon) Authenticate(username, password string) (*MailCon, error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	var (
		err error
		cmd *imap.Command
	)
	// Login the current user
	if _, err = mc.waitFor(mc.client.Login(username, password)); err != nil {
		return mc, err
	}
	// Retrieve the current servers delimiter symbol
	if cmd, err = mc.waitFor(mc.client.List("", "")); err != nil {
		// ... we couldn't retrieve it, let's assume for now, its our default delimiter
		mc.delim = DFLT_MAILBOX_DELIM
	} else {
		mc.delim = cmd.Data[0].MailboxInfo().Delim
	}
	// Clean the data queue
	mc.client.Data = nil
	// Set the client in the NO_OP state to continuously receive updates from the server
	if _, err = mc.waitFor(mc.client.Noop()); err != nil {
		return mc, err
	}
	return mc, nil
}

func (mc *MailCon) IsAuthenticated() bool {
	if nil != mc.client && (mc.client.State() == imap.Auth || mc.client.State() == imap.Selected) {
		return true
	}
	return false
}


/**
@see interface io.Closer
*/
func (mc *MailCon) Close() error {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	var err error
	if nil != mc.client {
		fmt.Printf("[watney] Shutting down IMAP connection\n")
		close(mc.QuitChan)
		_, err = mc.waitFor(mc.client.Logout(30 * time.Second))
	}
	return err
}

////////////////////////////////////////////////////////////////////////////////////////////////////
///									Public Mail Methods											 ///
////////////////////////////////////////////////////////////////////////////////////////////////////

func (mc *MailCon) LoadAllMailsFromInbox() ([]Mail, error) {
	return mc.LoadNMailsFromFolder("/", -1, true)
}

func (mc *MailCon) LoadNMailsFromInbox(n int) ([]Mail, error) {
	return mc.LoadNMailsFromFolder("/", n, true)
}

func (mc *MailCon) LoadAllMailsFromFolder(folder string) ([]Mail, error) {
	return mc.LoadNMailsFromFolder(folder, -1, true)
}

/**
 * @return All returned mails without their content (UID, Header and Flags are set).
 */
func (mc *MailCon) LoadAllMailOverviewsFromFolder(folder string) ([]Mail, error) {
	// Check if there is no given folder and assume root in this case (= INBOX)
	if 0 == len(folder) { folder = "/" }
	return mc.LoadNMailsFromFolder(folder, -1, false)
}

/**
@param folder The folder to retrieve mails from
@param	n > 0 The number of mails to retrieve from the folder in the mailbox
		n <= 0 All mails that are saved within the folder
@param withContent	True - Also loads the content of all mails
					False - Only loads the headers of all mails
*/
func (mc *MailCon) LoadNMailsFromFolder(folder string, n int, withContent bool) ([]Mail, error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	// 1) Define the number of mails that should be loaded
	var nbrMailsExp string
	if n > 0 {
		nbrMailsExp = fmt.Sprintf("1:%d", n)
	} else {
		nbrMailsExp = "1:*"
	}
	set, _ := imap.NewSeqSet(nbrMailsExp)
	return mc.loadMails(set, folder, withContent, mc.client.Fetch)
}

/**
 * Loads the header and the content of the mail for the given UIDs.
 */
func (mc *MailCon) LoadNMailsFromFolderWithUIDs(folder string, uids []uint32) ([]Mail, error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	// TODO: Check if UIDs are below 1 and react accordingly
	var uidStrings []string = make([]string, len(uids))
	for index, uid := range uids {
		uidStrings[index] = strconv.Itoa(int(uid))
	}
	set, _ := imap.NewSeqSet(strings.Join(uidStrings, ","))
	return mc.loadMails(set, folder, true, mc.client.UIDFetch)
}

/**
 * Loads the header and the content of the mail for the given UID.
 */
func (mc *MailCon) LoadMailFromFolderWithUID(folder string, uid uint32) (Mail, error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	if uid < 1 {
		return Mail{},
			errors.New(fmt.Sprintf("Couldn't retrieve mail, because mail UID (%d) needs to " +
			"be greater than 0", uid));
	}
	var (
		mails MailSlice
		err error
	)
	set, _ := imap.NewSeqSet(fmt.Sprintf("%d", uid))
	if mails, err = mc.loadMails(set, folder, true, mc.client.UIDFetch); err != nil {
		return Mail{},
			errors.New(fmt.Sprintf("No mail could be retrieved for the given ID: %d; due to " +
				"the error:\n%s\n", uid, err.Error()))
	}
	if len(mails) == 0 {
		return Mail{},
			errors.New(fmt.Sprintf("No mail found for the given ID: %d\n", uid))
	}
	return mails[0], err
}

/**
 * Only loads the content of the mail for the given UID.
 */
//func (mc *MailCon) LoadContentForMailFromFolder(folder string, uid uint32) (Content, error) {
//	mc.mutex.Lock()
//	defer mc.mutex.Unlock()
//	println("Loading mail content for UID: ", uid)
//	if uid < 1 {
//		return "", errors.New(fmt.Sprintf("Couldn't retrieve mail content, because mail " +
//			"UID (%d) needs to be greater than 0", uid));
//	}
//	if err := mc.selectFolder(folder, false); err != nil {
//		return "", err
//	}
//	set, _ := imap.NewSeqSet(fmt.Sprintf("%d", uid))
//	// Add the content flag to retrieve the content from the server
//	var (
//		itemsToFetch []string = []string{"UID", "FLAGS", "RFC822.TEXT"}
//		cmd *imap.Command
//		mailContent string
//		err error
//	)
//	if cmd, err = mc.waitFor(mc.client.UIDFetch(set, itemsToFetch...)); err != nil {
//		return "", errors.New(fmt.Sprintf("Couldn't retrieve content for mail with UID: %d" +
//		"\n Orig error: %s", uid, err.Error()))
//	}
//	for _, resp := range cmd.Data {
//		mailContent = imap.AsString(resp.MessageInfo().Attrs["RFC822.TEXT"])
//	}
//	// 5) Clean the data queue
//	mc.client.Data = nil
//	return mailContent, nil
//}


func (mc *MailCon) RemoveMailFlags(folder, uid string, f *Flags) error {
	return mc.UpdateMailFlags(folder, uid, f, false)
}
func (mc *MailCon) AddMailFlags(folder, uid string, f *Flags) error {
	return mc.UpdateMailFlags(folder, uid, f, true)
}

/**
 *
 * ATTENTION:
 * If the mail for the given UID is can't be found in the given folder, no flags will be changed.
 *
 * @param folder The folder, this mail resides in, e.g., "/", "Sent", ...
 * @param uid The unique server ID of this message
 * @param add True  - Sets the flag(s) as activated
 *			  False - Removes the flag(s) (sets them as deactivated)
 */
func (mc *MailCon) UpdateMailFlags(folder, uid string, f *Flags, add bool) error {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	var task string
	// 1) Select the folder in which the mail resides whose flags should be updated
	if err := mc.selectFolder(folder, false); err != nil {
		return err
	}
	// 2) Prepare parameters for update request and perform the request
	if add { task = "+" } else { task = "-" }
	set, _ := imap.NewSeqSet(uid)
	_, err := mc.waitFor(mc.client.UIDStore(set, strings.Replace("*FLAGS", "*", task, 1),
		SerializeFlags(f)))
	return err
}

/**
 * Response: * 25 EXISTS | 2 | 25
 * new Data update: * 25 EXISTS
 * This is all the fields we get: %!s(uint32=25)
 * This is all the fields we get: EXISTS
 * Response: * 1 RECENT | 2 | 1
 * new Data update: * 1 RECENT
 * This is all the fields we get: %!s(uint32=1)
 * This is all the fields we get: RECENT
 *
 *
 * Usually, a new mail update from the server splits into 2 responses: 1 EXIST and 1 RECENT
 * The EXIST command provides the server UID of the new message received and the RECENT command
 * tells the client how many new messages have been recently received.
 */
func (mc *MailCon) CheckNewMails() ([]uint32, error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	var (
		recentMsg bool = false
		newMsgUIDs []uint32 = make([]uint32, 0)
		err error = nil
	)
	if mc.client.Data != nil && len(mc.client.Data) > 0 {
		for _, resp := range mc.client.Data {
			fmt.Printf("Response: %s | %d | %d\n", resp.String(), resp.Type, resp.Value())
			if resp.Type == imap.Data {
				fmt.Printf("new Data update: %s | Label: %s\n", resp.String(), resp.Label)
				f := resp.Fields
				if len(f) > 1 {
					// The response is either an EXIST or a RECENT
					// We expect Fields[0] to be the message ID/nbr of new messages and Fields[1]
					// to be the information (EXIST/RECENT)
					switch n := imap.AsNumber(f[0]); strings.ToUpper(imap.AsAtom(f[1])) {
						case "RECENT":
							recentMsg = true
						case "EXISTS":
							newMsgUIDs = append(newMsgUIDs, n)
					}
				} else {
					err = errors.New(fmt.Sprintf("Got a data update message with less than 2 " +
						"fields: %s", resp.Fields))
					fmt.Printf("[watney]: ERROR: %s\n", err.Error())
				}
			} else {
				err = errors.New(fmt.Sprintf("Unhandled response in message queue, while " +
					"checking for new mails: \n\t%s", resp.String()))
			}
		}
	}
	fmt.Printf("Received info is: %b, %s\n", recentMsg, newMsgUIDs)
	// Empty the response message queue
	mc.client.Data = nil
	return newMsgUIDs, err
}

/**
 * Creates a new mail on the IMAP server with the given header information, flags and content
 * (body).
 * TODO: Not yet mirrored as a Web-Handler
 */
func (mc *MailCon) AddMailToFolder(h *Header, f *Flags, content string) (uint32, error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	return mc.addMailToFolder_internal(h, f, content)
}

func (mc *MailCon) SendMail(a smtp.Auth, from string, to []string, subject string,
		body string) (err error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	// 1) Create new SMTP message and send it
	m := email.NewMessage(subject, body)
	m.From = from
	m.To = to
	if mc.conf.SkipCertificateVerification {
		err = mc.sendMailSkipCert(a, from, m.Tolist(), m.Bytes())
	} else {
		err = email.Send(fmt.Sprintf("%s:%d", mc.conf.SMTPAddress, mc.conf.SMTPPort), a, m)
	}
	// 2) If that worked well, add this mail to the 'Sent' folder of the users inbox
	if nil == err {
		// Todo: Think about having this in its own go-routine -> how to handle a possible error?
		_, err = mc.addMailToFolder_internal(&Header{
			Date: time.Now(),
			Subject: subject,
			Sender: from,
			Receiver: strings.Join(to, ", "),
			Folder: "Sent",
		}, &Flags{Seen:true}, body)
	}
	return err
}


////////////////////////////////////////////////////////////////////////////////////////////////////
///										Private Methods											 ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * ATTENTION: DOES NOT LOCK THE IMAP CONNECTION! => Has to be wrapped into a mutex lock method
 */
func (mc *MailCon) loadMails(set *imap.SeqSet, folder string, withContent bool,
		curFetchFunc FetchFunc) ([]Mail, error) {
	// 1) First check if we need to select a specific folder in the mailbox or if it is root
	if err := mc.selectFolder(folder, true); err != nil {
		return []Mail{}, err
	}
	var (
		cmd *imap.Command
		itemsToFetch []string = []string{"UID", "FLAGS", "INTERNALDATE", "RFC822.SIZE",
			"RFC822.HEADER"}
		mails []Mail = []Mail{}
		mailContent Content
		err error
	)
	if withContent {
		itemsToFetch = append(itemsToFetch, "RFC822.TEXT")
	}
	// 2) Fetch a number of mails from the given mailbox folder
	if cmd, err = mc.waitFor(curFetchFunc(set, itemsToFetch...)); err != nil {
		return []Mail{}, err
	} else {
		// 3) Transform the retrieved messages into mails with headers
		for _, resp := range cmd.Data {
			// a) Parse the Header
			mailHeader, err := parseHeader(resp.MessageInfo())
			if nil != err {
				mc.Logger.Printf("Couldn't parse header of mail\n Original error: %s", err.Error())
			}
			mailHeader.Folder = folder
			// b) Read the flags
			flags := readFlags(resp.MessageInfo())
			// c) Read the content if requested
			if withContent {
				mailContent, err = parseContent(resp.MessageInfo(), mailHeader.MimeHeader)
			}
			// d) Build the mail object
			mails = append(mails, Mail{
				UID : resp.MessageInfo().UID,
				Header:  mailHeader,
				Flags: flags,
				Content: mailContent,
			})
		}
		// 4) Clean the data queue
		mc.client.Data = nil
		return mails, err
	}
}

/**
 * Creates a new mail on the IMAP server with the given header information, flags and content
 * (body).
 * ATTENTION: DOES NOT LOCK THE IMAP CONNECTION! => Has to be wrapped into a mutex lock method
 */
func (mc *MailCon) addMailToFolder_internal(h *Header, f *Flags,
		content string) (uid uint32, err error) {
	var (
		// Create the msg:
		// Header info + empty line + content + empty line
		msg string = strings.Join([]string{SerializeHeader(h), "", content, ""}, "\r\n")
		lit imap.Literal = imap.NewLiteral([]byte(msg))
		mbox string = fmt.Sprintf("%s%s%s", mc.mailbox, mc.delim, h.Folder)
		cmd *imap.Command
		newMsgUID uint32
	)
	// 1) Execute the actual append mail command
	cmd, err = mc.client.Append(mbox, imap.AsFlagSet(SerializeFlags(f)), &h.Date, lit)
	if resp, err := cmd.Result(imap.OK); err == nil {
		// Give it a moment to receive the server response containing the newly created message UID
//		mc.client.Recv(1*time.Second)
		// The Response is an 'APPENDUID' with the fields:
		// [0] APPENDUID:string | [1] internaldate:long64 | [2] UID:uint32
		newMsgUID = imap.AsNumber(resp.Fields[2])
	} else {
		fmt.Printf("[watney] ERROR waiting for result of append command\n\t%s\n", err.Error())
	}
	// 2) Process the server response and extract the message UID of the previously added mail
	return newMsgUID, err
}

func (mc *MailCon) dial() (c *imap.Client, err error) {
	// Decide what method to use for dialing into the server
	var serverAddr string = fmt.Sprintf("%s:%d", mc.conf.Hostname, mc.conf.Port)
	if 993 == mc.conf.Port {
		c, err = imap.DialTLS(serverAddr, nil)
	} else {
		c, err = imap.Dial(serverAddr)
	}
	// If dialing went wrong, return the error
	if err != nil {
		return nil, err
	}
	// Check for STARTTLS and use appropriate method and config object if need be
	if c.Caps["STARTTLS"] {
		_, err = mc.waitFor(c.StartTLS(&tls.Config{
			InsecureSkipVerify: mc.conf.SkipCertificateVerification,
		}))
	}
	// Identify this client at the IMAP server
	if c.Caps["ID"] {
		_, err = mc.waitFor(c.ID("name", "watney"))
	}
	return c, err
}

func (mc *MailCon) selectFolder(folder string, readonly bool) error {
	var mailboxFolder string = mc.mailbox
	if len(folder) > 0 && folder != "/" {
		mailboxFolder = fmt.Sprintf("%s%s%s", mc.mailbox, mc.delim, folder)
	}
	if _, err := mc.waitFor(mc.client.Select(mailboxFolder, false)); err != nil {
		return err
	}
	// Clean client response queue
	mc.client.Data = nil
	return nil
}

func (mc *MailCon) waitFor(cmd *imap.Command, origErr error) (*imap.Command, error) {
	var (
		//	rsp   *imap.Response
		wferr error
	)
	// 1) Check if we're missing a command and if so, return with an error
	if cmd == nil {
		// Todo: origErr could be nil here as well
		wferr = errors.New(fmt.Sprintf("WaitFor: Missing command, because: %s", origErr.Error()))
		mc.logMC(wferr.Error(), imap.LogAll)
		return nil, wferr
	} else if origErr == nil {
		// The original command executed without an error -> start waiting for the result of the
		// given command (which is done by waiting for the OK response)
		if _, okErr := cmd.Result(imap.OK); okErr != nil {
			// 2) If the result is not OK, build an WaitFor error that contains the imap.OK error
			wferr = errors.New(fmt.Sprintf("WaitFor: Command %s finished, but failed to wait \n"+
				"for the result with error: %s", cmd.Name(true), okErr.Error()))
			mc.logMC(wferr.Error(), imap.LogAll)
			return cmd, wferr
		}
	} else if origErr != nil {
		// There is an error for the original executed command
		return cmd, origErr
	}
	// All good, no errors
	return cmd, nil

}

func (mc *MailCon) logMC(msg string, level imap.LogMask) {
	if mc.LogMask >= level && nil != mc.Logger {
		mc.Logger.Printf("error level %s: %s", level, msg)
	}
}

/**
 * Checks, whether the given config object is correctly initialized. Returns (true, nil), if so,
 * and otherwise the error message what is missing.
 * @return (bool, error) False, err - if the given config object is not correctly initialized and
 *								the error code
 *						 True, nil - otherwise.
 */
func (mc *MailCon) checkConf() (bool, error) {
	if nil == mc.conf {
		return false, errors.New("Can't create MailConnection without config")
	}
	if 0 == len(mc.conf.Hostname) || mc.conf.Port < 1 {
		return false, errors.New("Missing server address or username or password")
	}
	// Set a default logger to hell, if none has been given
	//	if nil == conf.logger {
	//		conf.logger = log.New(os.DevNull, "", 0)
	//	}
	return true, nil
}

func (mc *MailCon) keepAlive(every int) {
	ticker := time.NewTicker(time.Duration(every) * time.Second)
	mc.QuitChan = make(chan struct{})
	go func() {
		for {
			select {
			case <- ticker.C:
				// Send Noop to keep connection alive and receive new updates from the server
				mc.mutex.Lock()
				if _, err := mc.waitFor(mc.client.Noop()); err != nil {
					mc.logMC(err.Error(), imap.LogAll)
				}
				mc.mutex.Unlock()
			case <- mc.QuitChan:
				ticker.Stop()
				return
			}
		}
	}()
}

/**
 * ATTENTION: Override method for smtp.SendMail. Needed to be written, since the tls.Config object
 * can't be handed over to the original method, which needs to be modified, in case the server
 * certificate is self-signed.
 */
func (mc *MailCon) sendMailSkipCert(a smtp.Auth, from string, to []string, msg []byte) error {
	c, err := smtp.Dial(fmt.Sprintf("%s:%d", mc.conf.SMTPAddress, mc.conf.SMTPPort))
	if err != nil {
		return err
	}
	defer c.Close()
	if err = c.Hello("localhost"); err != nil {
		return err
	}
	if ok, _ := c.Extension("STARTTLS"); ok {
		config := &tls.Config{
			ServerName: mc.conf.SMTPAddress,
			InsecureSkipVerify: mc.conf.SkipCertificateVerification,
		}
		if err = c.StartTLS(config); err != nil {
			return err
		}
	}
	if a != nil {
		if err = c.Auth(a); err != nil {
			return err
		}
	}
	if err = c.Mail(from); err != nil {
		return err
	}
	for _, addr := range to {
		if err = c.Rcpt(addr); err != nil {
			return err
		}
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	_, err = w.Write(msg)
	if err != nil {
		return err
	}
	err = w.Close()
	if err != nil {
		return err
	}
	return c.Quit()
}

func parseHeader(mi *imap.MessageInfo) (*Header, error) {
	// 1) If no MessageInfo was passed => return and error
	if nil == mi {
		return nil,
			errors.New("Couldn't parse Mail Header, because the given MessageInfo object is nil")
	}
	// 2) If the given MessageInfo doesn't contain a header string => return and error
	var (
		mailHeader imap.Field
		curHeader *Header
		err error
	)
	if mailHeader = mi.Attrs["RFC822.HEADER"]; nil == mailHeader {
		return nil, errors.New("Couldn't parse Mail Header, because no header was provided " +
			"in the given MessageInfo object")
	}
	if curHeader, err = parseHeaderStr(imap.AsString(mailHeader)); err == nil {
		curHeader.Size = mi.Size
	}
	return curHeader, err
}

/**
The Email Header is expected to follow this spec:
	Mail Header: Return-Path: <root@localhost.localdomain>
	X-Original-To: name@domain.de
	Delivered-To: name@domain.de
	Received: by domain.de (Postfix, from userid 0)
	id 034C710090703; Sat, 16 Mar 2013 02:05:26 +0100 (CET)
	To: name@domain.de, root@localhost.localdomain, [...]
	Subject: Test Message
	Message-Id: <20130316010526.034C710090703@domain.de>
	Date: Sat, _6 Mar 2013 02:05:26 +0100 (CET)
	From: root@localhost.localdomain (root)
which translates to a more generic form of:
	Key : Blank Value \newline
*/
func parseHeaderStr(header string) (*Header, error) {
	if 0 == len(header) {
		return nil, errors.New("Header string is empty")
	}
	var (
		reader *textproto.Reader = textproto.NewReader(bufio.NewReader(bytes.NewBufferString(header)))
		mHeader textproto.MIMEHeader
		err error
	)
	if mHeader, err = reader.ReadMIMEHeader(); (err != nil && err != io.EOF) {
		return nil, err
	}
//		for key, val := range mHeader {
//			fmt.Printf("&&&& %s -> %s\n", key, val)
//		}
	return parseMainHeaderContent(mHeader)
}

func parseMainHeaderContent(headerContentMap textproto.MIMEHeader) (h *Header, err error) {
	if nil == headerContentMap || 0 == len(headerContentMap) {
		return nil, errors.New("Header doesn't contain entries")
	}
	// Todo: Several of the below used Header members could be missing in the Header string
	var mHeader PMIMEHeader = parseMIMEHeader(headerContentMap)
	h = &Header{
		MimeHeader: mHeader,
		Subject:  parseAndDecodeHeader(headerContentMap["Subject"][0], mHeader),
		Date:  	  parseIMAPHeaderDate(headerContentMap["Date"][0]),
		Sender:   parseAndDecodeHeader(headerContentMap["From"][0], mHeader),
		Receiver: parseAndDecodeHeader(headerContentMap["To"][0], mHeader),
	}
	return h, nil
}

/**
 * This method takes a MIMEHeader map and converts it into a modularized version.
 */
func parseMIMEHeader(mimeHeader textproto.MIMEHeader) PMIMEHeader {
	var (
		params map[string]string	//e.g., "[multipart/mixed; boundary="----=_Part_414413_206767080.1441196149087"]"
		mediatype string			//e.g., "multipart/mixed"
		boundary string				//e.g., "----=_Part_414413_206767080.1441196149087"
		// Special case "quoted-printable": The go multipart code, hides this field by default and
		// simply directly decodes the body content accordingly -> make it a default here
		encoding string	= "quoted-printable"	//e.g., "quoted-printable", "base64"
		mimeversionStr string
		mimeversion float64	= .0	//e.g., 1.0
		err error
	)
	if contentArrayStr, ok := mimeHeader["Content-Type"]; ok {
		if mediatype, params, err = mime.ParseMediaType(contentArrayStr[0]); err == nil {
			boundary = params["boundary"]
		} else {
			fmt.Printf("[watney] WARNING: failed to parse the media type of mail: %s\n",
				err.Error())
		}
	}
	if contentArrayStr, ok := mimeHeader["Content-Transfer-Encoding"]; ok {
		encoding = strings.TrimSpace(contentArrayStr[0])
	}
	if contentArrayStr, ok := mimeHeader["Mime-Version"]; ok {
		mimeversionStr = strings.TrimSpace(contentArrayStr[0])
		if mimeversion, err = strconv.ParseFloat(mimeversionStr, 32); err != nil {
			fmt.Printf("[watney] WARNING: failed to parse the mime version of mail: %s\n",
				err.Error())
			mimeversion = .0
		}
	}
	return PMIMEHeader{
		MimeVersion: float32(mimeversion),
		ContentType: mediatype,
		Encoding: encoding,
		MultipartBoundary: boundary,
	}
}

func parseAndDecodeHeader(encoded string, mHeader PMIMEHeader) string {
	var (
		encodedValue string = strings.TrimPrefix(encoded, " ")
		decoded string
		dec *mime.WordDecoder = new(mime.WordDecoder)
		err error
	)
	if decoded, err = dec.DecodeHeader(encodedValue); err != nil {
		fmt.Printf("[watney] WARNING: Couldn't decode string: \n\t%s\n\t%s\n", encodedValue,
			err.Error())
		return encodedValue
	}
	return decoded
}

/**
 * The Date information in the IMAP Header is either of type time.RFC1123Z or an extended version
 * which also contains '(MST)' (where MST is the time zone).
 */
func parseIMAPHeaderDate(dateString string) time.Time {
	var (
		date time.Time
		err error
		extRFCString string = fmt.Sprintf("%s (MST)", time.RFC1123Z)
		generic1 string = "Mon, _2 Jan 2006 15:04:05 -0700"
		generic2 string = fmt.Sprintf("%s (MST)", generic1)
	)
	// Try to parse the date in a bunch of different date formats
	if date, err = time.Parse(imap.DATETIME, dateString); err == nil {
		// 1) Parsing as imap.DATETIME was successful
		return date
	} else if date, err = time.Parse(time.RFC1123Z, dateString); err == nil {
		// 2) Parsing as time.RFC1123Z was successful
		return date
	} else if date, err = time.Parse(extRFCString, dateString); err == nil {
		// 3) Parsing as 'time.RFC1123Z (MST)' was successful
		return date
	} else if date, err = time.Parse(generic1, dateString); err == nil {
		// 4) Parsing as generic1 was successful
		return date
	} else if date, err = time.Parse(generic2, dateString); err == nil {
		// 5) Parsing as generic2 was successful
		return date
	} else {
		fmt.Printf("[watney] Error during parsing of date header: %s\n",
			err.Error())
		// Fallback: If no date string was found in the header map or, an error occurred during
		// parsing => set the date to 1/1/1970
		return time.Unix(0, 0)
	}
}

/**
 *
 */
func parseContent(mi *imap.MessageInfo, mimeHeader PMIMEHeader) (Content, error) {
	// 1) If no content is given, error and return
	if nil == mi {
		return nil, errors.New("[watney] ERROR: Couldn't parse mail content due to missing content.")
	}
	var (
		content string = imap.AsString(mi.Attrs["RFC822.TEXT"])
		parts Content = make(Content, 1)
	)
	// 2) Simple Case: We have no MIME protocol, simply assume the content is plain text
	if 0 == mimeHeader.MimeVersion {
		parts["text/plain"] = ContentPart{
			Encoding: "quoted-printable",
			Charset: "UTF-8",
			Body: content,
		}
		return parts, nil
	}
	// 3) Otherwise, we have to check the Content-Type: If its NOT a multipart, just add it as is
	if !strings.Contains(mimeHeader.ContentType, "multipart") {
		parts[mimeHeader.ContentType] = ContentPart{
			Encoding: mimeHeader.Encoding,
			Charset: "UTF-8",
			Body: content,
		}
		return parts, nil
	}
	// 4) Otherwise, in case we have a multipart Content-Type, parse all parts
	return parseMultipartContent(content, mimeHeader.MultipartBoundary)
}

func parseMultipartContent(content, boundary string) (Content, error) {
	var (
		reader *multipart.Reader = multipart.NewReader(strings.NewReader(content),
			boundary)
		part *multipart.Part
		mailParts Content = make(Content, 1)
		partHeader PMIMEHeader
		err error
	)
	for {
		if part, err = reader.NextPart(); err == io.EOF {
			// 1) EOF error means, we're finished reading the multiparts
			break
		} else if err != nil {
			// 2) other errors are real => print a warning for that part and continue with the next
			fmt.Printf("[watney] WARNING: Couldn't parse multipart 'Part' Header & Content: %s\n",
				err.Error())
			continue
		}
		// 3) Try to read the content of this multipart body ...
		if readBytes, err := ioutil.ReadAll(part); err != nil {
			fmt.Printf("[watney] WARNING: Couldn't read multipart body content: %s\n", err.Error())
			continue
		} else {
			// 4) The body of this part has been successfully parsed => extract content
			if partHeader = parseMIMEHeader(part.Header); len(partHeader.ContentType) > 0 {
				// 5) We got a Content-Type, check if that one is multipart again
				if strings.Contains(partHeader.ContentType, "multipart") {
					// 5a) It is multipart => recursively add its parts
					if innerParts, err := parseMultipartContent(string(readBytes),
							partHeader.MultipartBoundary); err != nil {
						fmt.Printf("[watney] WARNING: Couldn't parse inner multipart body: %s\n",
							err.Error())
						continue
					} else {
						for key, value := range innerParts {
							mailParts[key] = value
						}
					}
				} else {
					// 5b) We have a content type other than multipart, just add it
					mailParts[partHeader.ContentType] = ContentPart{
						Encoding: partHeader.Encoding,
						Charset: "UTF-8",
						Body: string(readBytes),
					}
				}
			} else {
				// 4b) This part has no MIME information -> assume text/plain
				// ATTENTION: We're overwriting previously parsed text/plain parts
				mailParts["text/plain"] = ContentPart{
					Encoding: "quoted-printable",
					Charset: "UTF-8",
					Body: string(readBytes),
				}
			}
		}
	}
	return mailParts, nil
}


func SerializeHeader(h *Header) string {
	if nil == h { return "" }
	var header string
	// 1) First deal with MIME information of header
	if h.MimeHeader.MimeVersion > 0 {
		header = strings.Join([]string {
			fmt.Sprintf("%s: %.1f", "MIME-Version", h.MimeHeader.MimeVersion),
			fmt.Sprintf("%s: %s;",
				"Content-Type", h.MimeHeader.ContentType)},
		"\r\n")

		if strings.Contains(h.MimeHeader.ContentType, "multipart") {
			// Only attach boundary in case of multipart content
			header = fmt.Sprintf("%s\r\n\t%s=\"%s\"", header,
				"boundary", h.MimeHeader.MultipartBoundary)
		} else if h.MimeHeader.ContentType == "text/plain" {
			// Only attach charset in case of text/plain content
			header = fmt.Sprintf("%s charset=\"%s\"", header, h.MimeHeader.Encoding)
		}
	}
	// 2) Now populate the serialized header with the main content
	header = strings.TrimSpace(strings.Join([]string{
			header,
			fmt.Sprintf("%s: %s", "Date", h.Date.Format(time.RFC1123Z)),
			fmt.Sprintf("%s: %s", "To", h.Receiver),
			fmt.Sprintf("%s: %s", "From", h.Sender),
			fmt.Sprintf("%s: %s", "Subject", h.Subject)},
		"\r\n"))
	return header
}

func readFlags(mi *imap.MessageInfo) (f *Flags) {
	f = &Flags{
		Seen     : mi.Flags["\\Seen"],
		Answered : mi.Flags["\\Answered"],
		Deleted  : mi.Flags["\\Deleted"],
		Flagged  : mi.Flags["\\Flagged"],
		Draft    : mi.Flags["\\Draft"],
		Recent   : mi.Flags["\\Recent"],
	}
	return f;
}

func SerializeFlags(flags *Flags) imap.Field {
	var fieldFlags []imap.Field = make([]imap.Field, 0)
	if flags.Seen 	  { fieldFlags = append(fieldFlags, "\\Seen")	    }
	if flags.Answered { fieldFlags = append(fieldFlags, "\\Answered")	}
	if flags.Deleted  { fieldFlags = append(fieldFlags, "\\Deleted")	}
	if flags.Flagged  { fieldFlags = append(fieldFlags, "\\Flagged")	}
	if flags.Draft    { fieldFlags = append(fieldFlags, "\\Draft")		}
	if flags.Recent   { fieldFlags = append(fieldFlags, "\\Recent")	    }
	return fieldFlags
}

