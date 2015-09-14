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

func (mc *MailCon) RemoveMailFlags(folder, uid string, f *Flags) error {
	return mc.UpdateMailFlags(folder, uid, f, false)
}
func (mc *MailCon) AddMailFlags(folder, uid string, f *Flags) error {
	return mc.UpdateMailFlags(folder, uid, f, true)
}

/**
 *
 * ATTENTION:
 * If the mail for the given UID can't be found in the given folder, no flags will be changed.
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
 * This method moves the mail associated with the given 'UID', from the folder where it currently
 * resides, into the "Trash" folder and sets its "Deleted" flag.
 * After this operation, the following post condition holds, if a mail with the given UID existed
 * in the original folder:
 *  - The mail in the original folder has its "Deleted" flag set
 *  - The folder 'Trash' now contains a new mail with the Header and Content of the original
 *    mail (but with a new UID)
 *
 * ATTENTION:
 * The original mail is NOT deleted from the folder where it resided (only its deleted flag is set).
 * The deletion operation will happen when the IMAP connection is closed, or the EXPUNGE operation
 * is called.
 */
func (mc *MailCon) TrashMail(uid, origFolder string) (uint32, error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	return mc.moveMail(uid, origFolder, "Trash")
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
 * Usually, a new mail update from the server splits into 2 responses: 1 EXIST and 1 RECENT
 * The EXIST command provides the server UID of the new message received and the RECENT command
 * tells the client how many new messages have been recently received.
 */
func (mc *MailCon) CheckNewMails() ([]uint32, error) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()
	var (
//		recentMsg bool = false
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
//						case "RECENT":
//							recentMsg = true
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
//	fmt.Printf("Received info is: %b, %s\n", recentMsg, newMsgUIDs)
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
	return mc.createMailInFolder_internal(h, f, content)
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
		_, err = mc.createMailInFolder_internal(&Header{
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
func (mc *MailCon) createMailInFolder_internal(h *Header, f *Flags,
		content string) (uid uint32, err error) {
	var (
		// Create the msg:
		// Header info + empty line + content + empty line
		msg string = strings.Join([]string{SerializeHeader(h), "", content, ""}, "\r\n")
		lit imap.Literal = imap.NewLiteral([]byte(msg))
		mbox string = fmt.Sprintf("%s%s%s", mc.mailbox, mc.delim, h.Folder)
		cmd *imap.Command
		resp *imap.Response
	)
	// 1) Execute the actual append mail command
	if cmd, err = mc.client.Append(mbox, imap.AsFlagSet(SerializeFlags(f)), &h.Date, lit);
		err != nil {
		return 0, err
	}
	if resp, err = cmd.Result(imap.OK); err != nil {
		return 0,
			fmt.Errorf("[watney] ERROR waiting for result of append command\n\t%s\n", err.Error())
	}
	// 2) Process the server response and extract the message UID of the previously added mail
	// The Response is an 'APPENDUID' with the fields:
	// [0] APPENDUID:string | [1] internaldate:long64 | [2] UID:uint32
	return imap.AsNumber(resp.Fields[2]), err
}

/**
 * This method moves the mail associated with the given 'UID', from the folder where it currently
 * resides, into the "toFolder" folder and sets its "Deleted" flag.
 * After this operation, the following post condition holds, if a mail with the given UID existed
 * in the original folder:
 *  - The mail in the original folder has its "Deleted" flag set
 *  - The folder 'newFolder' now contains a new mail with the Header and Content of the original
 *    mail (but with a new UID)
 *
 * ATTENTION:
 * The original mail is NOT deleted from the folder where it resided (only its deleted flag is set).
 * The deletion operation will happen when the IMAP connection is closed, or the EXPUNGE operation
 * is called.
 *
 * @param uid The UID of the mail to be moved
 * @param folder The folder in which the current mail resides (its source location)
 * @param toFolder The folder the mail should be moved to (the target folder)
 * @return Returns the UID of the newly created mail in the target folder or an error, if something
 *		   went wrong.
 */
func (mc *MailCon) moveMail(uid, folder, toFolder string) (uint32, error) {
	var targetMbox string = fmt.Sprintf("%s%s%s", mc.mailbox, mc.delim, toFolder)
	// 1) First check if we need to select a specific folder in the mailbox or if it is root
	if err := mc.selectFolder(folder, true); err != nil {
		return 0, err
	}
	set, _ := imap.NewSeqSet(uid)
	// 3) Copy finished successfully, set the deleted flag of the mail in the original folder
	cmd, err := mc.client.UIDCopy(set, targetMbox)
	var resp *imap.Response
	if resp, err = cmd.Result(imap.OK); err != nil {
		return 0,
			fmt.Errorf("[watney] ERROR waiting for result of copy command\n\t%s\n", err.Error())
	}
	// 2) Copy the mail internally to the new folder
	if _, err := mc.waitFor(mc.client.UIDStore(set, "+FLAGS",
			SerializeFlags(&Flags{Deleted:true})));
		err != nil {
		return 0, fmt.Errorf("[watney] ERROR waiting for result of update flags command\n\t%s\n",
			err.Error())
	}
	// 4) Check if the copy worked, and if so, return the new UID and no error
	// The Response is an 'COPYUID' with the fields:
	//  [0] COPYUID:string | [1] internaldate:long64 | [2] Orig-UID:uint32 | [3] New-UID:uint32
	//  The Orig-UID resambles the given UID for the original mail
	//  The New-UID is the UID of the new mail stored in the 'toFolder'
	if len(resp.Fields) == 4 {
		return imap.AsNumber(resp.Fields[3]), nil
	} else {
		return 0, errors.New("[watney] WARNING: Copy completed without doing anyting\n")
	}
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
