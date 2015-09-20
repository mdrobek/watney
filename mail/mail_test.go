package mail

import (
	"fmt"
	"mdrobek/watney/conf"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

const TEST_CONFIG_FILE = "../conf/test.ini"

var multipartMailHeader1 string = `Mail Header: Return-Path: <root@localhost.localdomain>
X-Original-To: johnsmith@domain.org
Delivered-To: johnsmith@domain.org
Received: by aVM-withIP.dedicated.domain.org (Postfix, from userid 0)
id 024A790110703; Sat, 6 Mar 2013 02:05:26 +0100
To: johnsmith@domain.org, root@localhost.localdomain,
Subject: Test Message
Message-Id: <20080316102426.024A790110703@aVM-withIP.dedicated.domain.org>
Date: Sat, 06 Mar 2013 02:05:26 +0100
From: root@localhost.localdomain (root)
MIME-Version: 1.0
Content-Type: multipart/mixed;
	boundary="----=_Part_414413_206767080.1441196149087"
X-GMX-Antispam: 6 (nemesis text pattern profiler); Detail=V3;
X-GMX-Antivirus: 0 (no virus found)`

var multipartMailBody1 string = `------=_Part_414413_206767080.1441196149087
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

Some test text!
------=_Part_414413_206767080.1441196149087
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

<b>Some test text!</b>
<br>
------=_Part_414413_206767080.1441196149087--`

var base64Body string = `----==_mimepart_55e5934148e33_35c43fd168003a1018622b
Content-Type: text/plain;
 charset=UTF-8
Content-Transfer-Encoding: base64

T3VyIG5ldyBLaWNrc3RhcnRlciBpcyBMSVZFISAKClRoZSBLaWNrc3RhcnR=
----==_mimepart_55e5934148e33_35c43fd168003a1018622b--`

func TestParseHeader(t *testing.T) {
	mailHeader, err := parseHeaderStr(multipartMailHeader1)
	if nil != err {
		t.Fatalf("Error parsing mail sample header: %s", err.Error())
	}
	// 1) Expect mail header not to be nil for example header
	if nil == mailHeader {
		t.Fatalf("Parsed Mail Header is null: %s", err.Error())
	}
	// 2) Check MIME fields of Header
	checkMimeHeader(mailHeader.MimeHeader, PMIMEHeader{
		MimeVersion:       1.0,
		ContentType:       "multipart/mixed",
		MultipartBoundary: "----=_Part_414413_206767080.1441196149087",
		Encoding:          "quoted-printable",
	}, t)
	// 3) Check for main fields of Header
	if 0 == len(mailHeader.Subject) && mailHeader.Subject != "Test Message" {
		t.Fatalf("Parsed Mail Subject is not set: %s", err.Error())
	}
	if 0 == len(mailHeader.Sender) && mailHeader.Sender != "root@localhost.localdomain (root)" {
		t.Fatalf("Parsed Mail sender is not set: %s", err.Error())
	}
	if 0 == len(mailHeader.Receiver) &&
		mailHeader.Receiver != "johnsmith@domain.org, root@localhost.localdomain," {
		t.Fatalf("Parsed Mail receiver is not set: %s", err.Error())
	}
	expectedDate, err := time.Parse(time.RFC1123Z, "Sat, 06 Mar 2013 02:05:26 +0100")
	if !mailHeader.Date.Equal(expectedDate) {
		t.Fatalf("Parsed Date didn't match expected date: %v | %v", mailHeader.Date, expectedDate)
	}
}

func TestSerializeHeader(t *testing.T) {
	mailOrigHeader, err := parseHeaderStr(multipartMailHeader1)
	if nil != err {
		t.Fatalf("Couldn't parse header for later serialization: %s", err.Error())
	}
	serializedHeader := SerializeHeader(mailOrigHeader)
	mailParsedHeader, err := parseHeaderStr(serializedHeader)
	if nil != err {
		t.Fatalf("Couldn't parse serialized header: %s", err.Error())
	}
	if !reflect.DeepEqual(mailOrigHeader, mailParsedHeader) {
		fmt.Printf("Original Header\n%v\n", mailOrigHeader)
		fmt.Printf("Serialized Header\n%v\n", mailParsedHeader)
		t.Error("Orig header and header from serialized string don't equal")
	}
}

func TestBase64Parsing(t *testing.T) {
	var (
		mailParts Content
		err       error
	)
	if mailParts, err = parseMultipartContent(base64Body,
		"--==_mimepart_55e5934148e33_35c43fd168003a1018622b"); err != nil {
		t.Fatal(err)
	}
	// 1) Expect exactly one entry
	if 1 != len(mailParts) {
		t.Fatalf("Expected 2 entry to be parsed, but got: %d", len(mailParts))
	}
	// 2) Check text/plain MIME Header fields
	if value, ok := mailParts["text/plain"]; !ok {
		t.Fatal("Didn't find expected Content-Type 'text/plain'")
	} else {
		expected := ContentPart{
			Charset:  "UTF-8",
			Encoding: "base64",
			Body:     "T3VyIG5ldyBLaWNrc3RhcnRlciBpcyBMSVZFISAKClRoZSBLaWNrc3RhcnR=",
		}
		if !reflect.DeepEqual(value, expected) {
			t.Fatalf("Parsed 'text/plain' part didn't match expected part: %v | %v\n",
				value, expected)
		}
	}
}

func TestMultipartParsing(t *testing.T) {
	if header, err := parseHeaderStr(multipartMailHeader1); err != nil {
		t.Fatalf("Error parsing header: %s", err.Error())
	} else {
		//		t.Logf("$$$$$$$$$ Header is: %s", header)
		var mailParts Content
		if mailParts, err = parseMultipartContent(multipartMailBody1,
			header.MimeHeader.MultipartBoundary); err != nil {
			t.Fatalf("Failed parsing multipart content: %s\n", err.Error())
		}
		// 1) Expect exactly two entries
		if 2 != len(mailParts) {
			t.Fatalf("Expected 2 entry to be parsed, but got: %d", len(mailParts))
		}
		// 2) Check text/plain MIME Header fields
		if value, ok := mailParts["text/plain"]; !ok {
			t.Fatalf("Didn't find expected Content-Type 'text/plain'")
		} else {
			expected := ContentPart{
				Charset:  "UTF-8",
				Encoding: "quoted-printable",
				Body:     "Some test text!",
			}
			if !reflect.DeepEqual(value, expected) {
				t.Fatalf("Parsed 'text/plain' part didn't match expected part: %v | %v\n",
					value, expected)
			}
		}
		// 3) Check text/plain MIME Header fields
		if value, ok := mailParts["text/html"]; !ok {
			t.Fatalf("Didn't find expected Content-Type 'text/html'")
		} else {
			expected := ContentPart{
				Charset:  "UTF-8",
				Encoding: "quoted-printable",
				Body:     "<b>Some test text!</b>\n<br>",
			}
			if !reflect.DeepEqual(value, expected) {
				t.Fatalf("Parsed 'text/html' part didn't match expected part: %v | %v\n",
					value, expected)
			}
		}
	}
}

func TestCreateMailConnection(t *testing.T) {
	// 1) Expect connection error for malformed config
	malformedConf1 := loadTestConfig(TEST_CONFIG_FILE, t)
	malformedConf1.Mail.Hostname = ""
	mailCon, err := NewMailCon(&malformedConf1.Mail)
	defer mailCon.Close()
	if nil == err {
		t.Fatal("Connection should have failed because of empty server address.")
	}
	// 2) Expect successful connection
	fineTestMailConf := loadTestConfig(TEST_CONFIG_FILE, t)
	mailCon, err = NewMailCon(&fineTestMailConf.Mail)
	defer mailCon.Close()
	if nil != err {
		t.Errorf("Couldn't connect and login to mailserver: %s:%d", fineTestMailConf.Mail.Hostname,
			fineTestMailConf.Mail.Port)
	}
}

func TestAuthenticationProcess(t *testing.T) {
	testConf := loadTestConfig(TEST_CONFIG_FILE, t)
	mc, err := NewMailCon(&testConf.Mail)
	defer mc.Close()
	if err != nil {
		t.Fatal(err)
	}
	// 1) Try an invalid authentication and expect to fail
	if _, err := mc.Authenticate("foo@domain.com", "bar"); err == nil {
		t.Fatal("Expected an authentication error due to invalid credentials")
	}

	// 2) Now authenticate with the correct credentials and expect no error
	if _, err := mc.Authenticate(testConf.TestUser.Username, testConf.TestUser.Password); err != nil {
		t.Fatal(err)
	}
}

func TestAddMailToFolder(t *testing.T) {
	conf := loadTestConfig(TEST_CONFIG_FILE, t)
	mc, err := NewMailCon(&conf.Mail)
	defer mc.Close()
	if err != nil {
		t.Fatal(err)
	}
	// 1) Now authenticate with the correct credentials and expect no error
	if _, err := mc.Authenticate(conf.TestUser.Username, conf.TestUser.Password); err != nil {
		t.Fatal(err)
	}
	var folder string = "Sent"
	// 2) Now add a new Mail to the Sent folder and check, whether that worked well
	msgUID, err := mc.AddMailToFolder(&Header{
		Date:     time.Now(),
		Subject:  "WATNEY: TEST",
		Sender:   "markwatney@mars.com",
		Receiver: strings.Join([]string{"henderik@nasa.com", "sat@nasa.com"}, ", "),
		Folder:   folder,
	}, &Flags{Seen: true}, "This is some text from mars")
	if nil != err {
		t.Fatal(err)
	}
	// 3) Now delete this new 'Sent' mail, by tagging it as 'DELETED'
	if trashedUID, err := mc.TrashMail(strconv.Itoa(int(msgUID)), folder); err != nil {
		t.Fatal(err)
	} else if trashedUID <= 0 {
		t.Fatalf("Trashed UID mail is not valid: %d", trashedUID)
	}
}

func TestSelectFolder(t *testing.T) {
	conf := loadTestConfig(TEST_CONFIG_FILE, t)
	mc, _ := NewMailCon(&conf.Mail)
	defer mc.Close()
	// 1) Now authenticate with the correct credentials and expect no error
	if _, err := mc.Authenticate(conf.TestUser.Username, conf.TestUser.Password); err != nil {
		t.Errorf(err.Error())
	}
	var (
		folder1 string = "Sent"
		folder2 string = "/"
	)
	// 3) Now delete this new 'Sent' mail, by tagging it as 'DELETED'
	if err := mc.selectFolder(folder1, true); err != nil {
		t.Fatal(err)
	}
	if err := mc.selectFolder(folder2, true); err != nil {
		t.Fatal(err)
	}
	if err := mc.selectFolder(folder2, true); err != nil {
		t.Fatal(err)
	}
}

/**
 * Assumes at least 57 mails in the test mailbox
 */
func TestLoadMailsForSeqNbrs(t *testing.T) {
	conf := loadTestConfig(TEST_CONFIG_FILE, t)
	mc, _ := NewMailCon(&conf.Mail)
	defer mc.Close()
	// 1) Now authenticate with the correct credentials and expect no error
	if _, err := mc.Authenticate(conf.TestUser.Username, conf.TestUser.Password); err != nil {
		t.Fatal(err)
	}

	var (
		mails       []Mail
		mailSeqNbrs []uint32 = []uint32{57, 56, 51}
		err         error
	)
	if mails, err = mc.LoadNMailsFromFolderWithSeqNbrs("/", mailSeqNbrs); err != nil {
		t.Fatal(err)
	} else if len(mails) != 3 {
		t.Fatal("Expected 3 mails to be loaded, but got: %d", len(mails))
	}
}

func TestParseSpamHeader(t *testing.T) {
	if header, err := parseHeaderStr(multipartMailHeader1); err != nil {
		t.Fatal(err)
	} else if header.SpamIndicator != 6 {
		t.Fatalf("Spam indicator should have been 6, but was %d", header.SpamIndicator)
	}
}

/*
 * [0 (Mail was not recognized as spam); Detail=V3;]
 * [6 (nemesis text pattern profiler); Detail=V3;]
 */
func TestParseGmxSpamHeader(t *testing.T) {
	var (
		testHeader1 []string = []string{"0", "(Mail was not recognized as spam);", "Detail=V3;"}
		testHeader2 []string = []string{"6", "(nemesis text pattern profiler);", "Detail=V3;"}
	)
	if spamIndicator := parseGMXSpamIndicator(testHeader1); spamIndicator != 0 {
		t.Fatalf("Spam indicator should have been 0, but was %d", spamIndicator)
	}
	if spamIndicator := parseGMXSpamIndicator(testHeader2); spamIndicator != 6 {
		t.Fatalf("Spam indicator should have been 6, but was %d", spamIndicator)
	}
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

func checkMimeHeader(parsed, expected PMIMEHeader, t *testing.T) {
	// 2) Check MIME fields
	if parsed.MimeVersion != expected.MimeVersion {
		t.Errorf("Parsed wrong MIME field 'MimeVersion': %d | %d",
			parsed.MimeVersion, expected.MimeVersion)
	}
	if parsed.ContentType != expected.ContentType {
		t.Errorf("Parsed wrong MIME field 'Content-Type': %s | %s",
			parsed.ContentType, expected.ContentType)
	}
	if parsed.MultipartBoundary != expected.MultipartBoundary {
		t.Errorf("Parsed wrong MIME field 'Multipart boundary': %s | %s",
			parsed.MultipartBoundary, expected.MultipartBoundary)
	}
	if parsed.Encoding != expected.Encoding {
		t.Errorf("Parsed wrong MIME field 'Encoding': %s | %s",
			parsed.Encoding, expected.Encoding)
	}
}

func loadTestConfig(filename string, t *testing.T) *conf.WatneyTestConf {
	conf, err := conf.ReadTestConfig(filename)
	if nil != err {
		t.Error(err)
	}
	return conf
}
