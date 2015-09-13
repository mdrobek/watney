package mail

import (
	"github.com/mxk/go-imap/imap"
	"errors"
	"net/textproto"
	"bufio"
	"bytes"
	"io"
	"mime"
	"strings"
	"fmt"
	"strconv"
	"time"
	"mime/multipart"
	"io/ioutil"
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
