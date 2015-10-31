package mail

import (
	"mdrobek/watney/conf"
	"testing"
)

/**
 * This file provides integration tests with an IMAP server that require a test.ini file with a
 * test mail account.
 * TODO:
 * To write proper tests, a couple of methods are missing, e.g., create/delete mailbox
 */

const TEST_CONFIG_FILE = "../conf/test.ini"

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

//func TestAddMailToFolder(t *testing.T) {
//	conf := loadTestConfig(TEST_CONFIG_FILE, t)
//	mc, err := NewMailCon(&conf.Mail)
//	defer mc.Close()
//	if err != nil {
//		t.Fatal(err)
//	}
//	// 1) Now authenticate with the correct credentials and expect no error
//	if _, err := mc.Authenticate(conf.TestUser.Username, conf.TestUser.Password); err != nil {
//		t.Fatal(err)
//	}
//	var folder string = "Sent"
//	// 2) Now add a new Mail to the Sent folder and check, whether that worked well
//	msgUID, err := mc.AddMailToFolder(&Header{
//		Date:     time.Now(),
//		Subject:  "WATNEY: TEST",
//		Sender:   "markwatney@mars.com",
//		Receiver: strings.Join([]string{"henderik@nasa.com", "sat@nasa.com"}, ", "),
//		Folder:   folder,
//	}, &Flags{Seen: true}, "This is some text from mars")
//	if nil != err {
//		t.Fatal(err)
//	}
//	// 3) Now delete this new 'Sent' mail, by tagging it as 'DELETED'
//	if trashedUID, err := mc.TrashMail(strconv.Itoa(int(msgUID)), folder); err != nil {
//		t.Fatal(err)
//	} else if trashedUID <= 0 {
//		t.Fatalf("Trashed UID mail is not valid: %d", trashedUID)
//	}
//}

// TODO: Implement createMailbox/deleteMailbox to write a proper test here
func TestSelectFolder(t *testing.T) {
	conf := loadTestConfig(TEST_CONFIG_FILE, t)
	mc, _ := NewMailCon(&conf.Mail)
	defer mc.Close()
	// 1) Now authenticate with the correct credentials and expect no error
	if _, err := mc.Authenticate(conf.TestUser.Username, conf.TestUser.Password); err != nil {
		t.Errorf(err.Error())
	}
	var (
		//		folder1 string = "Trash"
		folder2 string = "/"
	)
	// 3) Now delete this new 'Sent' mail, by tagging it as 'DELETED'
	//	if err := mc.selectFolder(folder1, true); err != nil {
	//		t.Fatal(err)
	//	}
	if err := mc.selectFolder(folder2, true); err != nil {
		t.Fatal(err)
	}
	if err := mc.selectFolder(folder2, true); err != nil {
		t.Fatal(err)
	}
}

/**
 * TODO: Test need to be rewritten without any assumptions (empty test user account)
 * Assumes at least 57 mails in the test mailbox
 */
//func TestLoadMailsForSeqNbrs(t *testing.T) {
//	conf := loadTestConfig(TEST_CONFIG_FILE, t)
//	mc, _ := NewMailCon(&conf.Mail)
//	defer mc.Close()
//	// 1) Now authenticate with the correct credentials and expect no error
//	if _, err := mc.Authenticate(conf.TestUser.Username, conf.TestUser.Password); err != nil {
//		t.Fatal(err)
//	}
//
//	var (
//		mails       []Mail
//		mailSeqNbrs []uint32 = []uint32{57, 56, 51}
//		err         error
//	)
//	if mails, err = mc.LoadNMailsFromFolderWithSeqNbrs("/", mailSeqNbrs); err != nil {
//		t.Fatal(err)
//	} else if len(mails) != 3 {
//		t.Fatal("Expected 3 mails to be loaded, but got: %d", len(mails))
//	}
//}

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
//	testMailConf := loadTestConfig(TEST_CONFIG_FILE, t)
//	mc, err := NewMailCon(&testMailConf.WatneyConf.Mail)
//	defer mc.Close()
//	if err != nil {
//		t.Errorf(err.Error())
//	}
//	// 1) Authenticate the given user
//	if _, err := mc.Authenticate(testMailConf.TestUser.Username,
//		testMailConf.TestUser.Password); err != nil {
//		t.Fatalf(err.Error())
//	}
//	var uid uint32 = 5411
//	if mail, err := mc.LoadMailFromFolderWithUID("/", uid); nil != err {
//		t.Errorf(err.Error())
//	} else {
//		fmt.Printf("text/plain: %s\n", mail.Content["text/plain"])
//		fmt.Printf("##############\n\n\n")
//		//		var buf bytes.Buffer
//		//		_, err := io.Copy(&buf, quotedprintable.NewReader(
//		//			strings.NewReader(mail.Content["text/html"].Body)))
//		//		if err != nil {
//		//			t.Errorf(err.Error())
//		//		}
//		//		fmt.Print(buf.String())
//		fmt.Printf("text/html: %s\n", mail.Content["text/html"])
//	}
//
//	//	if 0 == len(content) {
//	//		t.Errorf("Loaded content was empty but shouldn't have been!")
//	//	}
//}

func loadTestConfig(filename string, t *testing.T) *conf.WatneyTestConf {
	conf, err := conf.ReadTestConfig(filename)
	if nil != err {
		t.Error(err)
	}
	return conf
}
