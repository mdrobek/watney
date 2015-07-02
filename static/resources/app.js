/**
 * Created by lion on 02/07/15.
 */

goog.require('wat.mail');


function start() {
    var mailHandler = new wat.mail.MailHandler();
    mailHandler.loadMails();
}