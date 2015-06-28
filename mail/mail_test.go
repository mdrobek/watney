package mail

import (
	"testing"
	"mdrobek/watney/conf"
)

const TEST_CONFIG_FILE = "../conf/unionwork.ini"

var mailHeader_Example string = `Mail Header: Return-Path: <root@localhost.localdomain>\n
X-Original-To: johnsmith@domain.org\n
Delivered-To: johnsmith@domain.org\n
Received: by aVM-withIP.dedicated.domain.org (Postfix, from userid 0)\n
id 024A790110703; Sat, 16 Mar 2013 02:05:26 +0100 (CET)\n
To: johnsmith@domain.org, root@localhost.localdomain,\n
Subject: Test Message\n
Message-Id: <20080316102426.024A790110703@aVM-withIP.dedicated.domain.org>\n
Date: Sat, 16 Mar 2013 02:05:26 +0100 (CET)\n
From: root@localhost.localdomain (root)\n`

func TestCreateMailConnection(t *testing.T) {
	// 1) Expect connection error for malformed config
	malformedConf1 := loadConfig(TEST_CONFIG_FILE, t)
	malformedConf1.Mail.Hostname = ""
	mailCon, err := NewMailCon(&malformedConf1.Mail)
	if nil == err {
		t.Errorf("Connection should have failed because of empty server address.")
	}
	// 2) Expect connection error for malformed config
	malformedConf2 := loadConfig(TEST_CONFIG_FILE, t)
	malformedConf2.Mail.Username = ""
	mailCon, err = NewMailCon(&malformedConf2.Mail)
	if nil == err {
		t.Errorf("Connection should have failed because of empty username.")
	}
	// 3) Expect connection error for malformed config
	malformedConf3 := loadConfig(TEST_CONFIG_FILE, t)
	malformedConf3.Mail.Passwd = ""
	mailCon, err = NewMailCon(&malformedConf3.Mail)
	if nil == err {
		t.Errorf("Connection should have failed because of empty passwd.")
	}
	// 4) Expect successful connection
	fineTestMailConf := loadConfig(TEST_CONFIG_FILE, t)
	mailCon, err = NewMailCon(&fineTestMailConf.Mail)
	defer mailCon.Close()
	if nil != err {
		t.Errorf("Couldn't connect and login to mailserver: %s:%d", fineTestMailConf.Mail.Hostname,
			fineTestMailConf.Mail.Port)
	}
}

func TestLoadMails(t *testing.T) {
	mc, err := NewMailCon(&loadConfig(TEST_CONFIG_FILE, t).Mail)
	defer mc.Close()
	if err != nil {
		t.Errorf(err.Error())
	}

	// 1) Test that at least 3 mails have been downloaded from root folder
	mails, err := mc.LoadNMails(3)
	if err != nil {
		t.Errorf(err.Error())
	}
	if 3 != len(mails) {
		t.Errorf("Expected at least 3 mails to be loaded from root folder")
	}
	// 2) Test that at least 3 mails have been downloaded
	mails, err = mc.LoadNMailsFromFolder("Sent", 2, false)
	if err != nil {
		t.Errorf(err.Error())
	}
	if 2 != len(mails) {
		t.Errorf("Expected at least 3 mails from folder 'Sent'")
	}
}

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

func loadConfig(filename string, t *testing.T) *conf.WatneyConf {
	conf, err := conf.ReadConfig(filename)
	if nil != err { t.Error(err) }
	return conf
}