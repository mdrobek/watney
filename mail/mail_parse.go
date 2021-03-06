package mail

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"github.com/mxk/go-imap/imap"
	"io"
	"io/ioutil"
	"math"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/textproto"
	"strconv"
	"strings"
	"time"
)

func parseHeader(mi *imap.MessageInfo) (*Header, error) {
	// 1) If no MessageInfo was passed => return and error
	if nil == mi {
		return nil,
			errors.New("Couldn't parse Mail Header, because the given MessageInfo object is nil")
	}
	// 2) If the given MessageInfo doesn't contain a header string => return and error
	var (
		mailHeader imap.Field
		curHeader  *Header
		err        error
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
		reader  *textproto.Reader = textproto.NewReader(bufio.NewReader(bytes.NewBufferString(header)))
		mHeader textproto.MIMEHeader
		err     error
	)
	if mHeader, err = reader.ReadMIMEHeader(); err != nil && err != io.EOF {
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
		MimeHeader:    mHeader,
		Subject:       parseAndDecodeHeader(headerContentMap, "Subject", mHeader),
		Date:          parseIMAPHeaderDate(headerContentMap),
		Sender:        parseAndDecodeHeader(headerContentMap, "From", mHeader),
		Receiver:      parseAndDecodeHeader(headerContentMap, "To", mHeader),
		SpamIndicator: parseSpamIndicator(headerContentMap),
	}
	return h, nil
}

/**
 * This method takes a MIMEHeader map and converts it into a modularized version.
 */
func parseMIMEHeader(mimeHeader textproto.MIMEHeader) PMIMEHeader {
	var (
		params    map[string]string //e.g., "[multipart/mixed; boundary="----=_Part_414413_206767080.1441196149087"]"
		mediatype string            //e.g., "multipart/mixed"
		boundary  string            //e.g., "----=_Part_414413_206767080.1441196149087"
		// Special case "quoted-printable": The go multipart code, hides this field by default and
		// simply directly decodes the body content accordingly -> make it a default here
		encoding       string = "quoted-printable" //e.g., "quoted-printable", "base64"
		mimeversionStr string
		mimeversion    float64 = .0 //e.g., 1.0
		err            error
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
	// TODO: Mime versions as follows need to be parseable as well:
	// Mime-Version: [1.0 (1.0)]
	if contentArrayStr, ok := mimeHeader["Mime-Version"]; ok {
		mimeversionStr = strings.TrimSpace(contentArrayStr[0])
		if mimeversion, err = strconv.ParseFloat(mimeversionStr, 32); err != nil {
			fmt.Printf("[watney] WARNING: failed to parse the mime version of mail with "+
				"%s\n \t%v\n \t%s\n \t%s\n", mimeHeader["Subject"], contentArrayStr,
				mimeversionStr, err.Error())
			mimeversion = .0
		}
	}
	return PMIMEHeader{
		MimeVersion:       float32(mimeversion),
		ContentType:       mediatype,
		Encoding:          encoding,
		MultipartBoundary: boundary,
	}
}

func parseAndDecodeHeader(rawMimeHeader textproto.MIMEHeader, target string,
	mHeader PMIMEHeader) string {
	if targetArray, ok := rawMimeHeader[target]; !ok && len(targetArray) == 0 {
		return ""
	} else {
		var (
			encodedValue string = strings.TrimPrefix(targetArray[0], " ")
			decoded      string
			dec          *mime.WordDecoder = new(mime.WordDecoder)
			err          error
		)
		if decoded, err = dec.DecodeHeader(encodedValue); err != nil {
			fmt.Printf("[watney] WARNING: Couldn't decode string: \n\t%s\n\t%s\n", encodedValue,
				err.Error())
			return encodedValue
		}
		return decoded
	}
}

/**
 * The Date information in the IMAP Header is either of type time.RFC1123Z or an extended version
 * which also contains '(MST)' (where MST is the time zone).
 */
func parseIMAPHeaderDate(rawMimeHeader textproto.MIMEHeader) time.Time {
	if dateArray, ok := rawMimeHeader["Date"]; !ok && len(dateArray) == 0 {
		return time.Unix(0, 0)
	} else {
		var (
			date     time.Time
			err      error
			patterns []string = []string{
				"Mon, _2 Jan 2006 15:04:05 -0700",
				"Mon, _2 Jan 2006 15:04:05 -0700 (MST)",
				fmt.Sprintf("%s (MST)", time.RFC1123Z),
				"_2 Jan 2006 15:04:05 -0700",
				"_2 Jan 06 15:04 MST",
				time.RFC1123,
			}
		)
		// Try to parse the date in a bunch of different date formats
		for _, pattern := range patterns {
			if date, err = time.Parse(pattern, dateArray[0]); err == nil {
				return date
			}
		}
		fmt.Printf("[watney] Error during parsing of date header: %s\n", err.Error())
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
		content string  = imap.AsString(mi.Attrs["RFC822.TEXT"])
		parts   Content = make(Content, 1)
	)
	// 2) Simple Case: We have no MIME protocol, simply assume the content is plain text
	if 0 == mimeHeader.MimeVersion {
		parts["text/plain"] = ContentPart{
			Encoding: "quoted-printable",
			Charset:  "UTF-8",
			Body:     content,
		}
		return parts, nil
	}
	// 3) Otherwise, we have to check the Content-Type: If its NOT a multipart, just add it as is
	if !strings.Contains(mimeHeader.ContentType, "multipart") {
		parts[mimeHeader.ContentType] = ContentPart{
			Encoding: mimeHeader.Encoding,
			Charset:  "UTF-8",
			Body:     content,
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
		part       *multipart.Part
		mailParts  Content = make(Content, 1)
		partHeader PMIMEHeader
		err        error
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
						Charset:  "UTF-8",
						Body:     string(readBytes),
					}
				}
			} else {
				// 4b) This part has no MIME information -> assume text/plain
				// ATTENTION: We're overwriting previously parsed text/plain parts
				mailParts["text/plain"] = ContentPart{
					Encoding: "quoted-printable",
					Charset:  "UTF-8",
					Body:     string(readBytes),
				}
			}
		}
	}
	return mailParts, nil
}

func decodeContent(content Content) {
	for contentType, curPart := range content {
		switch curPart.Encoding {
		case "quoted-printable":
			{
				var buf bytes.Buffer
				_, err := io.Copy(&buf, quotedprintable.NewReader(strings.NewReader(curPart.Body)))
				if err != nil {
					fmt.Printf("[watney] ERROR while trying to decode content of type " +
						"'quoted-printable'\n")
					continue
				}
				content[contentType] = ContentPart{
					Encoding: curPart.Encoding,
					Charset:  curPart.Charset,
					Body:     buf.String(),
				}
			}
		}
	}
}

func parseSpamIndicator(headerContentMap textproto.MIMEHeader) int {
	// 0 means: NO spam
	var gmxSpamValue, watneySpamValue int = 0, 0
	if spamIndicator, ok := headerContentMap["X-Gmx-Antispam"]; ok {
		gmxSpamValue = parseGMXSpamIndicator(spamIndicator)
	}
	if _, ok := headerContentMap["X-Watney-Antispam"]; ok {
		// TODO: Not yet implemented
	}
	// By default, a mail that is not tagged with any spam indicating header information is
	// not a SPAM mail
	return int(math.Max(float64(gmxSpamValue), float64(watneySpamValue)))
}

/**
 * expected Header content:
 * [0 (Mail was not recognized as spam); Detail=V3;]
 * [6 (nemesis text pattern profiler); Detail=V3;]
 * Has to be split
 * [0] spam indicator value	| [1] description text or tool used | [2] probably analyzing details
 *
 * @param spamIndicators Is an array with 1 entry, as shown above
 */
func parseGMXSpamIndicator(spamIndicators []string) int {
	if len(spamIndicators) > 0 {
		var spamParts []string = strings.Split(spamIndicators[0], " ")
		if spamValue, err := strconv.Atoi(spamParts[0]); err == nil {
			return spamValue
		} else {
			fmt.Errorf("%s", err.Error())
		}
	}
	return 0
}

func SerializeHeader(h *Header) string {
	if nil == h {
		return ""
	}
	var header string
	// 1) First deal with MIME information of header
	if h.MimeHeader.MimeVersion > 0 {
		header = strings.Join([]string{
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
		fmt.Sprintf("%s: %s", "Subject", h.Subject),
		// TODO: We need to retain the information about the name of the SPAM field
		fmt.Sprintf("%s: %d", "X-GMX-Antispam", h.SpamIndicator)},
		"\r\n"))
	return header
}

func readFlags(mi *imap.MessageInfo) (f *Flags) {
	f = &Flags{
		Seen:     mi.Flags["\\Seen"],
		Answered: mi.Flags["\\Answered"],
		Deleted:  mi.Flags["\\Deleted"],
		Flagged:  mi.Flags["\\Flagged"],
		Draft:    mi.Flags["\\Draft"],
		Recent:   mi.Flags["\\Recent"],
	}
	return f
}

func SerializeFlags(flags *Flags) imap.Field {
	var fieldFlags []imap.Field = make([]imap.Field, 0)
	if flags.Seen {
		fieldFlags = append(fieldFlags, "\\Seen")
	}
	if flags.Answered {
		fieldFlags = append(fieldFlags, "\\Answered")
	}
	if flags.Deleted {
		fieldFlags = append(fieldFlags, "\\Deleted")
	}
	if flags.Flagged {
		fieldFlags = append(fieldFlags, "\\Flagged")
	}
	if flags.Draft {
		fieldFlags = append(fieldFlags, "\\Draft")
	}
	if flags.Recent {
		fieldFlags = append(fieldFlags, "\\Recent")
	}
	return fieldFlags
}
