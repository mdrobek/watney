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
}

type Mail struct {
	// the header information of the email
	Header *Header
	// the content of the mail
	Content string
}

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
	// Login the current user
	if _, err = newMC.login(); err != nil {
		defer newMC.Close()
		return newMC, err
	}
	// Set the client in the NO_OP state to continuously receive updates from the server
	if _, err = newMC.waitFor(newMC.client.Noop()); err != nil {
		defer newMC.Close()
		return newMC, err
	}
	// Retrieve the current servers delimiter symbol
	if cmd, err := newMC.waitFor(newMC.client.List("", "")); err != nil {
		// ... we couldn't retrieve it, let's assume for now, its our default delimiter
		newMC.delim = DFLT_MAILBOX_DELIM
	} else {
		newMC.delim = cmd.Data[0].MailboxInfo().Delim
	}
	// Return the new established connection
	return newMC, nil
}

func (mc *MailCon) LoadMails() ([]Mail, error) {
	return mc.LoadNMailsFromFolder("/", -1, true)
}

func (mc *MailCon) LoadMailsFromFolder(folder string) ([]Mail, error) {
	return mc.LoadNMailsFromFolder(folder, -1, true)
}

func (mc *MailCon) LoadNMails(n int) ([]Mail, error) {
	return mc.LoadNMailsFromFolder("/", n, true)
}

func (mc *MailCon) LoadMailHeaders() ([]Header, error) {
	mails, err := mc.LoadNMailsFromFolder("/", -1, false)
	var headers []Header = []Header{}
	for _, curMail := range mails {
		headers = append(headers, *curMail.Header)
	}
	return headers, err
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
	var itemsToFetch []string = []string{"FLAGS", "INTERNALDATE", "RFC822.SIZE", "RFC822.HEADER"}
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
			mailHeader, err := parseHeader(resp.MessageInfo())
			if nil != err {
				mc.Logger.Printf("Couldn't parse header of mail\n"+
					"Original error: %s", err.Error())
			}
			mailHeader.Size = resp.MessageInfo().Size
			mailHeader.Date = resp.MessageInfo().InternalDate
			mailHeader.Folder = mailboxFolder
			var mailContent string
			if withContent {
				mailContent = imap.AsString(resp.MessageInfo().Attrs["RFC822.TEXT"])
			}
			mails = append(mails, Mail{
				Header:  mailHeader,
				Content: mailContent,
			})
		}
		return mails, nil
	}
}

/**
@see interface io.Closer
*/
func (mc *MailCon) Close() error {
	var err error
	if nil != mc.client {
		_, err = mc.waitFor(mc.client.Logout(30 * time.Second))
	}
	return err
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

func (mc *MailCon) login() (*imap.Command, error) {
	defer mc.client.SetLogMask(mc.LogMask)
	return mc.waitFor(mc.client.Login(mc.conf.Username, mc.conf.Passwd))
}

func (mc *MailCon) waitFor(cmd *imap.Command, err error) (*imap.Command, error) {
	var (
		//		rsp   *imap.Response
		wferr error
	)
	// 1) Check if we're missing a command and if so, return with an error
	if cmd == nil {
		wferr = errors.New("WaitFor: Missing command")
		mc.logMC(wferr.Error(), imap.LogAll)
		return nil, wferr
	} else if err == nil {
		// Start waiting for the result of the given command
		_, err = cmd.Result(imap.OK)
	}
	// 2) Check if the result of command has errors, and if so, return those
	if err != nil {
		wferr = errors.New(fmt.Sprintf("WaitFor: Command %s didn't finish correctly\n"+
			"Original error: %s", cmd.Name(true), err.Error()))
		mc.logMC(wferr.Error(), imap.LogAll)
		return cmd, err
	}
	return cmd, nil

}

func (mc *MailCon) logMC(msg string, level imap.LogMask) {
	if mc.LogMask >= level && nil != mc.Logger {
		mc.Logger.Fatalf("error level %d: "+msg, level)
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
	if 0 == len(mc.conf.Hostname) || mc.conf.Port < 1 || 0 == len(mc.conf.Username) ||
		0 == len(mc.conf.Passwd) {
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
		return parseHeaderStr(imap.AsString(mailHeader))
	}
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
