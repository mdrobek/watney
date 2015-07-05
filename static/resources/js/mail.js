/**
 *
 * Created by lion on 30/06/15.
 */
goog.provide('wat.mail');
goog.require('wat');
goog.require('wat.soy.mail');
goog.require('goog.dom');
goog.require('goog.soy');

wat.mail.Mail = function(jsonData) {
    this.Date = jsonData.Date;
    this.Folder = jsonData.Folder;
    this.Receiver = jsonData.Receiver;
    this.From = jsonData.Sender;
    this.Size = jsonData.Size;
    this.Subject = jsonData.Subject;
};

wat.mail.Mail.prototype.Time = "09:12";
wat.mail.Mail.prototype.Date = null;
wat.mail.Mail.prototype.Folder = null;
wat.mail.Mail.prototype.Receiver = null;
wat.mail.Mail.prototype.From = null;
wat.mail.Mail.prototype.Size = null;
wat.mail.Mail.prototype.Subject = null;


wat.mail.Mail.prototype.renderMail = function() {
    var mailTableElem = goog.dom.getElement("mailOverview"),
        mailElem = goog.soy.renderAsElement(wat.soy.mail.mailOverview,
            {Time:this.Time, Date:this.Date});
    goog.dom.append(mailTableElem, mailElem);
};
