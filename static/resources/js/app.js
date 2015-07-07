/**
 * Created by lion on 02/07/15.
 */
goog.provide('wat.app');

goog.require('wat.mail.MailHandler');

wat.app.start = function() {
    var mailHandler = new wat.mail.MailHandler();
    mailHandler.loadMails();
};