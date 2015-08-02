/**
 * Created by mdrobek on 02/08/15.
 */
goog.provide('wat.mail');
goog.provide('wat.mail.MailHeader');
goog.provide('wat.mail.MailFlags');
goog.provide('wat.mail.BaseMail');
goog.provide('wat.mail.ReceivedMail');

goog.require('wat');

wat.mail.LOAD_MAILS_URI = "/mails";
wat.mail.LOAD_MAILCONTENT_URI = "/mailContent";
wat.mail.UPDATE_FLAGS_URI = "/updateFlags";


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




wat.mail.BaseMail = function(sender, receiver, subject, content) {
    this.Header = new wat.mail.MailHeader(sender, receiver, subject);
    this.Content = content;
};
// IMAP Mail server ID
wat.mail.BaseMail.prototype.UID = null;
/**
 * @type {wat.mail.MailHeader}
 */
wat.mail.BaseMail.prototype.Header = null;
// The content of the mail (aka: The Text)
wat.mail.BaseMail.prototype.Content = null;




wat.mail.ReceivedMail = function() {
    this.Flags = new wat.mail.MailFlags();
};
goog.inherits(wat.mail.ReceivedMail, wat.mail.BaseMail);
/**
 * @type {wat.mail.MailFlags}
 */
wat.mail.ReceivedMail.prototype.Flags = null;
