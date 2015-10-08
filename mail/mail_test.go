package mail

import (
	"fmt"
	"reflect"
	"testing"
	"time"
)

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

var missingToHeader string = `Mail Header: Return-Path: <root@localhost.localdomain>
Subject: Test Message
Message-Id: <20080316102426.024A790110703@aVM-withIP.dedicated.domain.org>
Date: Sat, 06 Mar 2013 02:05:26 +0100
From: root@localhost.localdomain (root)`

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

func TestMissingToHeader(t *testing.T) {
	if header, err := parseHeaderStr(missingToHeader); err != nil {
		t.Fatalf("Error parsing header: %s", err.Error())
	} else if header.Receiver != "" {
		t.Fatalf("Receiver (To field in header) should have been empty, but was %s\nOrig Error: %s",
			header.Receiver, err.Error())
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
