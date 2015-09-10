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
wat.mail.SEEN_FLAG = new wat.mail.MailFlags(true, false, false, false, false, false);
wat.mail.DELETE_FLAG = new wat.mail.MailFlags(false, true, false, false, false, false);

wat.mail.MailHeader = function(sender, receiver, subject) {
    this.Sender = sender;
    this.Receiver = receiver;
    this.Subject = subject;
};
// IsoString of Date
wat.mail.MailHeader.prototype.Date = null;
// Folder the mail is located in
wat.mail.MailHeader.prototype.Folder = null;
wat.mail.MailHeader.prototype.Receiver = null;
wat.mail.MailHeader.prototype.Sender = null;
wat.mail.MailHeader.prototype.Size = null;
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



wat.mail.ReceivedMail = function() {
    this.Flags = new wat.mail.MailFlags();
};
goog.inherits(wat.mail.ReceivedMail, wat.mail.BaseMail);
/**
 * @type {wat.mail.MailFlags}
 */
wat.mail.ReceivedMail.prototype.Flags = null;
