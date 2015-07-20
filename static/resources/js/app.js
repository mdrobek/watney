/**
 * Created by mdrobek on 02/07/15.
 */
goog.provide('wat.app');

goog.require('wat.mail.MailHandler');

wat.app.start = function() {
    var mailHandler = new wat.mail.MailHandler();
    mailHandler.loadMails(function(mails) {
        console.log("Setting first item");
        if (null != mails && mails.length > 0) {
            mails[1].showContent();
        }
    });
};