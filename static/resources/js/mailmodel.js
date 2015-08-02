/**
 * Created by mdrobek on 02/08/15.
 */
goog.provide('wat.mail');
goog.provide('wat.mail.MailHeader');
goog.provide('wat.mail.MailFlags');
goog.provide('wat.mail.BaseMail');
goog.provide('wat.mail.ReceivedMail');

goog.require('wat');

wat.mail.MailFlags = function() {};
wat.mail.MailFlags.prototype.Seen = false;
wat.mail.MailFlags.prototype.Answered = false;
wat.mail.MailFlags.prototype.Deleted = false;




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
