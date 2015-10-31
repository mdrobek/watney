/**
 * Created by mdrobek on 02/08/15.
 */
goog.provide('wat.mail');
goog.provide('wat.mail.MailHeader');
goog.provide('wat.mail.MailFlags');
goog.provide('wat.mail.ContentPart');
goog.provide('wat.mail.BaseMail');
goog.provide('wat.mail.ReceivedMail');

goog.require('wat');
goog.require('goog.structs.Map');

wat.mail.LOAD_MAILS_URI = "/mails";
wat.mail.LOAD_MAILCONTENT_URI = "/mailContent";
wat.mail.TRASH_MAIL_URI = "/trashMail";
wat.mail.MOVE_MAIL_URI = "/moveMail";
wat.mail.UPDATE_FLAGS_URI = "/updateFlags";
wat.mail.CHECK_MAILS_URI = "/poll";

wat.mail.MailFlags = function(opt_Seen, opt_Deleted, opt_Answered, opt_Flagged, opt_Draft,
                              opt_Recent) {
    this.Seen = opt_Seen;
    this.Deleted = opt_Deleted;
    this.Answered = opt_Answered;
    this.Flagged = opt_Flagged;
    this.Draft = opt_Draft;
    this.Recent = opt_Recent;
};
// Whether the mail has been read already
wat.mail.MailFlags.prototype.Seen = false;
// Message is "deleted" for removal by later EXPUNGE
wat.mail.MailFlags.prototype.Deleted = false;
// Whether the mail was answered
wat.mail.MailFlags.prototype.Answered = false;
// Message is "flagged" for urgent/special attention
wat.mail.MailFlags.prototype.Flagged = false;
// Message has not completed composition (marked as a draft).
wat.mail.MailFlags.prototype.Draft = false;
// Message is "recently" arrived in this mailbox.
wat.mail.MailFlags.prototype.Recent = false;
// Common used flags
wat.mail.MailFlags.SEEN = new wat.mail.MailFlags(true, false, false, false, false, false);
wat.mail.MailFlags.DELETED = new wat.mail.MailFlags(false, true, false, false, false, false);
wat.mail.MailFlags.RECENT = new wat.mail.MailFlags(false, false, false, false, false, true);

wat.mail.MailHeader = function(sender, receiver, subject) {
    this.Sender = sender;
    this.Receiver = receiver;
    this.Subject = subject;
};
// IsoString of Date
wat.mail.MailHeader.prototype.Date = null;
// Folder the mail is located on the IMAP server side
wat.mail.MailHeader.prototype.Folder = null;
wat.mail.MailHeader.prototype.Receiver = null;
wat.mail.MailHeader.prototype.Sender = null;
wat.mail.MailHeader.prototype.Size = null;
// Whether the mail has been classified as spam and if so, with what degree
// -1 - not been analysed | 0 - no spam | >0 - classified as spam (number tells the tool used)
wat.mail.MailHeader.prototype.SpamIndicator = -1;
wat.mail.MailHeader.prototype.Subject = null;
// The MIME information of this Mails header
wat.mail.MailHeader.prototype.MimeHeader = {
    // Used version of the MIME protocol
    MimeVersion: 0,
    // The media-type of the MIME protocol (stored in the flag: Content-Type)
    ContentType: "",
    // The encoding used for the Header subject (stored in Content-Transfer-Encoding)
    Encoding: "",
    // Boundary used in case of a multipart Content-Type
    MultipartBoundary: ""
};

/**
 * ContentPart reflects the body of the message. Dependent on the Content-Type of the mail, this
 * could be the plain text of the mail, or a multipart piece of the body (e.g., the message as
 * HTML or an attachement as base64 encoded string).
 * @param jsonData
 * @constructor
 */
wat.mail.ContentPart = function(jsonData) {
    this.Charset = jsonData.Charset;
    this.Encoding = jsonData.Encoding;
    this.Body = jsonData.Body;
};
// E.g., UTF-8
wat.mail.ContentPart.prototype.Charset = "";
// Type used to encode the Body, e.g., quoted-printable, base64
wat.mail.ContentPart.prototype.Encoding = "";
// The text of this content part (could be plain, html, base64 encoded string)
wat.mail.ContentPart.prototype.Body = "";

wat.mail.BaseMail = function(sender, receiver, subject, content) {
    this.Header = new wat.mail.MailHeader(sender, receiver, subject);
    this.Content = new goog.structs.Map(content);
};
// IMAP Mail server ID
wat.mail.BaseMail.prototype.UID = null;
/**
 * @type {wat.mail.MailHeader}
 */
wat.mail.BaseMail.prototype.Header = null;
/**
 * Content-Type {string} -> wat.mail.ContentPart
 * @type {goog.structs.Map} The server-side parsed content of the mail
 */
wat.mail.BaseMail.prototype.Content = null;

/**
 * PRE-CONDITION:
 * A mail needs to have a body, even if it is the empty string. It is thus always assumed, that the
 * Content map has at least 1 entry.
 *
 * Two cases might appear:
 * Case 1: The Mail contains a body for the given Content-Type.
 *      In this case, the body associated with this type is returned.
 * Case 2: The Mail DOES not contain a body for the given Content-Type.
 *      In this case, the method tries to return the body associated with the Content-Type
 *      "text/plain". If this type does not exist as well, any remaining existing body will be
 *      returned.
 * @param {string} forContentType One of: "text/plain", "text/html"
 * @return {string} The respective body string message for the given Content-Type
 * @public
 */
wat.mail.BaseMail.prototype.getContent = function(forContentType) {
    var self = this;
    // 1) Check if it contains the Content-Type, and if so, return it
    if (self.Content.containsKey(forContentType)) {
        return self.Content.get(forContentType).Body;
    }
    // 2) The Body for the given Content-Type doesn't exist => check if a body for "text/plain"
    //    exists, and if so, return it
    if (self.Content.containsKey("text/plain")) {
        return self.Content.get("text/plain").Body;
    }
    // 3) Worst case scenario: Neither a Body for the given Content-Type, nor for the fallback
    //    "text/plain" exists => return anything available
    //var fallbackKey = contentMap.getKeys()[0];
    //return contentMap.get(fallbackKey).Body;
    return "!!!         Sorry, no 'text/plain' available        !!!"
};

/**
 * @return {[string]}
 */
wat.mail.BaseMail.prototype.getContentTypes = function() {
    return this.Content.getKeys();
};

wat.mail.ReceivedMail = function(jsonData) {
    goog.base(this, jsonData.Header.Sender, jsonData.Header.Receiver, jsonData.Header.Subject,
        jsonData.Content);
    this.UID = jsonData.UID;
    this.Header.Date = jsonData.Header.Date;
    this.Header.Folder = jsonData.Header.Folder;
    this.Header.Size = jsonData.Header.Size;
    this.Header.SpamIndicator = jsonData.Header.SpamIndicator;
    this.Header.MimeHeader = jsonData.Header.MimeHeader;
    this.Flags = new wat.mail.MailFlags(jsonData.Flags.Seen, jsonData.Flags.Deleted,
        jsonData.Flags.Answered, jsonData.Flags.Flagged, jsonData.Flags.Draft,
        jsonData.Flags.Recent);
};
goog.inherits(wat.mail.ReceivedMail, wat.mail.BaseMail);
/**
 * @type {wat.mail.MailFlags}
 */
wat.mail.ReceivedMail.prototype.Flags = null;
/**
 * Whether images of HTML content of this mail should be loaded by default or not.
 * @type {boolean}
 */
wat.mail.ReceivedMail.prototype.LoadContentImages = false;
