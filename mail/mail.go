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
)

type MailCon struct {
	io.Closer
	// imap server connection client
	client *imap.Client
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
}

type Mail struct {
	// the unique ID of this mail as retrieved from the server
	UID uint32
	// the header information of the email
	Header *Header
	// all flags of the mail
	Flags *Flags
	// the content of the mail
	Content string
}

type MailInformation string
const (
	OVERVIEW string = "overview"	// UID, Header, Flags
	FULL string = "full"			// UID, Header, Flags, Content
)

type Header struct {
	// size of the mail
	Size uint32
	// time email was received
	Date time.Time
	// the subject of the mail (Subject:)
	Subject string
	// sender of the mail (From:)
	Sender string
	// receiver address of this mail (To:)
	Receiver string
	// the folder this email is stored in in the mailbox ("/" = root)
	Folder string
	// TODO: Flags - Unread, Read, ...
}

// Holds the following information of a mail: Seen, Deleted, Answered
type Flags struct {
	// Whether the mail has been read already
	Seen bool
	// Whether the mail has been deleted
	Deleted bool
	// Whether the mail was answered
	Answered bool
}

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
	// Check if the given configuration is valid
	if confOK, err := newMC.checkConf(); !confOK {
		return newMC, err
	}
	// Set the logger dependent on the config input
	if newMC.conf.Verbose {
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
	// Set the client in the NO_OP state to continuously receive updates from the server
	if _, err = newMC.waitFor(newMC.client.Noop()); err != nil {
		defer newMC.Close()
		return newMC, err
	}
	// Schedule a NOOP keep-alive request every 30 seconds to keep the IMAP connection alive
	newMC.keepAlive(30)
	// Return the new established connection
	return newMC, nil
}

/**
 * ATTENTION: Does not close connection on authentication fail, e.g., due to wrong credentials.
 */
func (mc *MailCon) Authenticate(username, password string) (*MailCon, error) {
	var err error
	// Login the current user
	mc.client.SetLogMask(mc.LogMask)
	if _, err = mc.waitFor(mc.client.Login(username, password)); err != nil {
		return mc, err
	}
	// Retrieve the current servers delimiter symbol
	if cmd, err := mc.waitFor(mc.client.List("", "")); err != nil {
		// ... we couldn't retrieve it, let's assume for now, its our default delimiter
		mc.delim = DFLT_MAILBOX_DELIM
	} else {
		mc.delim = cmd.Data[0].MailboxInfo().Delim
	}
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

func (mc *MailCon) LoadMails() ([]Mail, error) {
	return mc.LoadNMailsFromFolder("/", -1, true)
}

func (mc *MailCon) LoadMailsFromFolder(folder string) ([]Mail, error) {
	return mc.LoadNMailsFromFolder(folder, -1, true)
}

func (mc *MailCon) LoadNMails(n int) ([]Mail, error) {
	return mc.LoadNMailsFromFolder("/", n, true)
}

/**
 * @return All returned mails without their content (UID, Header and Flags are set).
 */
func (mc *MailCon) LoadMailOverview(folder string) ([]Mail, error) {
	// Check if there is no given folder and assume root in this case (= INBOX)
	if 0 == len(folder) { folder = "/" }
	return mc.LoadNMailsFromFolder(folder, -1, false)
}

//func (mc *MailCon) LoadMailHeaders() ([]Header, error) {
//	mails, err := mc.LoadNMailsFromFolder("/", -1, false)
//	var headers []Header = []Header{}
//	for _, curMail := range mails {
//		headers = append(headers, *curMail.Header)
//	}
//	return headers, err
//}

func (mc *MailCon) LoadContentForMail(folder string, uid uint32) (string, error) {
	println("Loading mail content for UID: ", uid)
	if uid < 1 {
		return "", errors.New(fmt.Sprintf("Couldn't retrieve mail content, because mail " +
			"UID (%d) needs to be greater than 0"));
	}
	var mailboxFolder string = mc.conf.Mailbox
	if len(folder) > 0 && folder != "/" {
		mailboxFolder = mc.conf.Mailbox + mc.delim + folder
	}
	if _, err := mc.waitFor(mc.client.Select(mailboxFolder, true)); err != nil {
		return "", err
	}
	set, _ := imap.NewSeqSet(fmt.Sprintf("%d", uid))
	// Add the content flag to retrieve the content from the server
	var (
		itemsToFetch []string = []string{"UID", "FLAGS", "RFC822.TEXT"}
		cmd *imap.Command
		mailContent string
		err error
	)
	if cmd, err = mc.waitFor(mc.client.UIDFetch(set, itemsToFetch...)); err != nil {
		return "", errors.New(fmt.Sprintf("Couldn't retrieve content for mail with UID: %d" +
		"\n Orig error: %s", uid, err.Error()))
	}
	for _, resp := range cmd.Data {
		mailContent = imap.AsString(resp.MessageInfo().Attrs["RFC822.TEXT"])
	}
	return mailContent, nil
}

/**
@param folder The folder to retrieve mails from
@param	n > 0 The number of mails to retrieve from the folder in the mailbox
		n <= 0 All mails that are saved within the folder
@param withContent	True - Also loads the content of all mails
					False - Only loads the headers of all mails
*/
func (mc *MailCon) LoadNMailsFromFolder(folder string, n int, withContent bool) ([]Mail, error) {
	// 1) First check if we need to select a specific folder in the mailbox or if it is root
	var mailboxFolder string = mc.conf.Mailbox
	if len(folder) > 0 && folder != "/" {
		mailboxFolder = mc.conf.Mailbox + mc.delim + folder
	}
	if _, err := mc.waitFor(mc.client.Select(mailboxFolder, true)); err != nil {
		return []Mail{}, err
	}
	// 2) Define the number of mails that should be loaded
	var nbrMailsExp string
	if n > 0 {
		nbrMailsExp = fmt.Sprintf("1:%d", n)
	} else {
		nbrMailsExp = "1:*"
	}
	set, _ := imap.NewSeqSet(nbrMailsExp)
	// 3) Fetch a number of mails from the given mailbox folder
	var itemsToFetch []string = []string{"UID", "FLAGS", "INTERNALDATE", "RFC822.SIZE",
		"RFC822.HEADER"}
	if withContent {
		itemsToFetch = append(itemsToFetch, "RFC822.TEXT")
	}
	cmd, err := mc.waitFor(mc.client.Fetch(set, itemsToFetch...))
	if err != nil {
		return []Mail{}, err
	} else {
		// 4) Transform the retrieved messages into mails with headers
		var mails []Mail = []Mail{}
		for _, resp := range cmd.Data {
			// a) Parse the Header
			mailHeader, err := parseHeader(resp.MessageInfo())
			if nil != err {
				mc.Logger.Printf("Couldn't parse header of mail\n"+
					"Original error: %s", err.Error())
			}
			mailHeader.Folder = mailboxFolder
			// b) Read the flags
			flags := readFlags(resp.MessageInfo())
			// c) Read the content if requested
			var mailContent string
			if withContent {
				mailContent = imap.AsString(resp.MessageInfo().Attrs["RFC822.TEXT"])
			}
			// d) Build the mail object
			mails = append(mails, Mail{
				UID : resp.MessageInfo().UID,
				Header:  mailHeader,
				Flags: flags,
				Content: mailContent,
			})
		}
		return mails, nil
	}
}

////////////////////////////////////////////////////////////////////////////////////////////////////
///										Private Methods											 ///
////////////////////////////////////////////////////////////////////////////////////////////////////

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

func (mc *MailCon) login(username, passwd string) (*imap.Command, error) {
	defer mc.client.SetLogMask(mc.LogMask)
	fmt.Printf("####### Starting logging and wait for\n")
	return mc.waitFor(mc.client.Login(username, passwd))
}

func (mc *MailCon) waitFor(cmd *imap.Command, origErr error) (*imap.Command, error) {
	var (
		//		rsp   *imap.Response
		wferr error
	)
	// 1) Check if we're missing a command and if so, return with an error
	if cmd == nil {
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
Checks, whether the given config object is correctly initialized. Returns (true, nil), if so,
and otherwise the error message what is missing.
@return (bool, error) False, err - if the given config object is not correctly initialized and
								the error code
True, nil - otherwise.
*/
func (mc *MailCon) checkConf() (bool, error) {
	if nil == mc.conf {
		return false, errors.New("Can't create MailConnection without config")
	}
	if 0 == len(mc.conf.Hostname) || mc.conf.Port < 1 {
		return false, errors.New("Missing server address or username or password")
	}
	if 0 == len(mc.conf.Mailbox) {
		mc.conf.Mailbox = DFLT_MAILBOX_NAME
	}
	// Set a default logger to hell, if none has been given
	//	if nil == conf.logger {
	//		conf.logger = log.New(os.DevNull, "", 0)
	//	}
	return true, nil
}

func parseHeader(mi *imap.MessageInfo) (*Header, error) {
	if nil == mi {
		return nil,
			errors.New("Couldn't parse Mail Header, because the given MessageInfo object is nil")
	} else if mailHeader := mi.Attrs["RFC822.HEADER"]; nil == mailHeader {
		return nil, errors.New("Couldn't parse Mail Header, because no header was provided " +
			"in the given MessageInfo object")
	} else {
		curHeader, err := parseHeaderStr(imap.AsString(mailHeader))
		curHeader.Size = mi.Size
		curHeader.Date = mi.InternalDate
		return curHeader, err
	}
}

func (mc *MailCon) keepAlive(every int) {
	ticker := time.NewTicker(time.Duration(every) * time.Second)
	mc.QuitChan = make(chan struct{})
	go func() {
		for {
			select {
			case <- ticker.C:
				// Send Noop to keep connection alive
				mc.waitFor(mc.client.Noop())
			case <- mc.QuitChan:
				ticker.Stop()
				return
			}
		}
	}()
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
	Date: Sat, 16 Mar 2013 02:05:26 +0100 (CET)
	From: root@localhost.localdomain (root)
which translates to a more generic form of:
	Key : Blank Value \newline
*/
func parseHeaderStr(header string) (*Header, error) {
	if 0 == len(header) {
		return nil, errors.New("Header string is empty")
	}
	lines := strings.Split(header, "\n")
	var contentMap map[string]string = map[string]string{}
	for _, curLine := range lines {
		keyValue := strings.SplitAfterN(curLine, ":", 2)
		// If we found an entry that is not composed of a key and value, skip it for now
		if len(keyValue) != 2 {
			continue
		}
		// Remove colon from key value and make it lower case
		cleanedKey := strings.ToLower(strings.TrimSuffix(keyValue[0], ":"))
		// Remove newline from value
		cleanedValue := strings.TrimSpace(keyValue[1])
		contentMap[cleanedKey] = cleanedValue
	}
	return parseHeaderContent(contentMap)
}

func parseHeaderContent(headerContentMap map[string]string) (h *Header, err error) {
	if nil == headerContentMap || 0 == len(headerContentMap) {
		return nil, errors.New("Header doesn't contain entries")
	}
	h = &Header{
		Subject:  strings.TrimPrefix(headerContentMap["subject"], " "),
		Sender:   strings.TrimPrefix(headerContentMap["from"], " "),
		Receiver: strings.TrimPrefix(headerContentMap["to"], " "),
	}
	return h, nil
}

func readFlags(mi *imap.MessageInfo) (f *Flags) {
	f = &Flags{
		Seen     : mi.Flags["\\Seen"],
		Answered : mi.Flags["\\Answered"],
		Deleted  : mi.Flags["\\Deleted"],
	}
	return f;
}

