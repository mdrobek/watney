package mail

import (
	"testing"
	"mdrobek/watney/conf"
	"reflect"
	"fmt"
	"strings"
)

const TEST_CONFIG_FILE = "../conf/unionwork.ini"

var lines []string = []string{
	"Mail Header: Return-Path: <root@localhost.localdomain>",
	"X-Original-To: johnsmith@domain.org",
	"Delivered-To: johnsmith@domain.org",
	"Received: by aVM-withIP.dedicated.domain.org (Postfix, from userid 0)",
	"id 024A790110703; Sat, 16 Mar 2013 02:05:26 +0100",
	"To: johnsmith@domain.org, root@localhost.localdomain,",
	"Subject: Test Message",
	"Message-Id: <20080316102426.024A790110703@aVM-withIP.dedicated.domain.org>",
	"Date: Sat, 16 Mar 2013 02:05:26 +0100",
	"From: root@localhost.localdomain (root)"}
var mailHeader_Example string = strings.Join(lines, "\r\n")

func TestParseHeader(t *testing.T) {
	mailHeader, err := parseHeaderStr(mailHeader_Example)
	if nil != err {
		t.Error("Error parsing mail sample header: %s", err.Error())
	}
	// 1) Expect mail header not to be nil for example header
	if nil == mailHeader {
		t.Error("Parsed Mail Header is null: %s", err.Error())
	}
	// 2) Check for parsed fields
	if 0 == len(mailHeader.Subject) {
		t.Error("Parsed Mail Subject is not set: %s", err.Error())
	}
	if 0 == len(mailHeader.Sender) {
		t.Error("Parsed Mail sender is not set: %s", err.Error())
	}
	if 0 == len(mailHeader.Receiver) {
		t.Error("Parsed Mail receiver is not set: %s", err.Error())
	}
}

func TestSerializeHeader(t *testing.T) {
	mailOrigHeader, err := parseHeaderStr(mailHeader_Example)
	if nil != err {
		t.Error("Couldn't parse header for later serialization: %s", err.Error())
	}
	serializedHeader :=	SerializeHeader(mailOrigHeader)
	mailParsedHeader, err := parseHeaderStr(serializedHeader)
	if nil != err {
		t.Error("Couldn't parse serialized header: %s", err.Error())
	}
	if !reflect.DeepEqual(mailOrigHeader, mailParsedHeader) {
		fmt.Printf("Original Header\n%s\n", mailOrigHeader)
		fmt.Printf("Serialized Header\n%s\n", mailParsedHeader)
		t.Error("Orig header and header from serialized string don't equal: %s", err.Error())
	}
}

//func TestAddMailToFolder(t *testing.T) {
//	// 1) Expect connection error for malformed config
//	conf := loadConfig(TEST_CONFIG_FILE, t)
//	mailCon, err := NewMailCon(&conf.Mail)
//	if nil == err {
//		t.Errorf("Connection should have failed because of empty server address.")
//	}
//	// TODO: Authentication needed!
////	err = mailCon.AddMailToFolder(&Header{
////		Date: time.Now(),
////		Subject: "Hello World",
////		Sender: "markwatney@mars.com",
////		Receiver: strings.Join([]string{"henderik@nasa.com", "sat@nasa.com"}, ", "),
////		Folder: "Sent",
////	}, &Flags{Seen:true}, "This is some text from mars")
//}

func TestCreateMailConnection(t *testing.T) {
	// 1) Expect connection error for malformed config
	malformedConf1 := loadConfig(TEST_CONFIG_FILE, t)
	malformedConf1.Mail.Hostname = ""
	mailCon, err := NewMailCon(&malformedConf1.Mail)
	if nil == err {
		t.Errorf("Connection should have failed because of empty server address.")
	}
	// 2) Expect successful connection
	fineTestMailConf := loadConfig(TEST_CONFIG_FILE, t)
	mailCon, err = NewMailCon(&fineTestMailConf.Mail)
	defer mailCon.Close()
	if nil != err {
		t.Errorf("Couldn't connect and login to mailserver: %s:%d", fineTestMailConf.Mail.Hostname,
			fineTestMailConf.Mail.Port)
	}
}

// TODO: Tests can't be run before we have a mock server with a mock account + a testing config

func TestAuthenticationProcess(t *testing.T) {
	mailConf := loadConfig(TEST_CONFIG_FILE, t).Mail
	mc, err := NewMailCon(&mailConf)
	defer mc.Close()
	if err != nil {
		t.Errorf(err.Error())
	}
	// 1) Try an invalid authentication and expect to fail
	if _, err := mc.Authenticate("foo@domain.com", "bar"); err == nil {
		t.Errorf("Expected an authentication error due to invalid credentials")
	}

	// 2) Now authenticate with the correct credentials and expect no error
//	if _, err := mc.Authenticate(mailConf.Username, mailConf.Passwd); err != nil {
//		t.Errorf(err.Error())
//	}
}

//func TestLoadMails(t *testing.T) {
//	mailConf := loadConfig(TEST_CONFIG_FILE, t).Mail
//	mc, err := NewMailCon(&mailConf)
//	defer mc.Close()
//	if err != nil {
//		t.Errorf(err.Error())
//	}
//
//	// 1) Authenticate the given user
//	if _, err := mc.Authenticate(mailConf.Username, mailConf.Passwd); err != nil {
//		t.Fatalf(err.Error())
//	}
//
//	// 2) Test that at least 3 mails have been downloaded from root folder
//	mails, err := mc.LoadNMails(3)
//	if err != nil {
//		t.Errorf(err.Error())
//	}
//	if 3 != len(mails) {
//		t.Errorf("Expected at least 3 mails to be loaded from root folder")
//	}
//	for _, mail := range mails {
//		if 0 == mail.UID { t.Errorf("Loaded mails have a UID that is 0"); }
//	}
//	// 3) Test that at least 3 mails have been downloaded
//	mails, err = mc.LoadNMailsFromFolder("Sent", 2, false)
//	if err != nil {
//		t.Errorf(err.Error())
//	}
//	if 2 != len(mails) {
//		t.Errorf("Expected at least 3 mails from folder 'Sent'")
//	}
//}
//
//func TestLoadMailContent(t *testing.T) {
//	mailConf := loadConfig(TEST_CONFIG_FILE, t).Mail
//	mc, err := NewMailCon(&mailConf)
//	defer mc.Close()
//	if err != nil {
//		t.Errorf(err.Error())
//	}
//	// 1) Authenticate the given user
//	if _, err := mc.Authenticate(mailConf.Username, mailConf.Passwd); err != nil {
//		t.Fatalf(err.Error())
//	}
//	var uid uint32= 4336
//	if _, err := mc.LoadContentForMail("/", uid); nil != err {
//		t.Errorf(err.Error())
//	}
////	if 0 == len(content) {
////		t.Errorf("Loaded content was empty but shouldn't have been!")
////	}
//}

func loadConfig(filename string, t *testing.T) *conf.WatneyConf {
	conf, err := conf.ReadConfig(filename)
	if nil != err { t.Error(err) }
	return conf
}