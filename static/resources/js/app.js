/**
 * Created by mdrobek on 02/07/15.
 */
goog.provide('wat.app');

goog.require('wat.mail');
goog.require('wat.mail.MailHandler');
goog.require('wat.mail.Mailbox');
goog.require('goog.events');
goog.require("goog.net.XhrIo");
goog.require("goog.Uri.QueryData");

wat.app.LOAD_USER_URI_ = "/userInfo";

// Global accessible objects
wat.app.mailHandler = null;
wat.app.userMail = null;

wat.app.start = function() {
    // 1) Load user details
    wat.app.loadUser();
    // 2) Add all events to the mailbox buttons on the left nav bar
    wat.app.addMailboxEvents();
    // 3) Start loading mails
    wat.app.mailHandler = new wat.mail.MailHandler();
    wat.app.mailHandler.switchMailbox(wat.mail.Mailbox.INBOX);
};

wat.app.addMailboxEvents = function() {
    var d_inbox = goog.dom.getElement("Inbox_Btn"),
        d_sent = goog.dom.getElement("Sent_Btn"),
        d_trash = goog.dom.getElement("Trash_Btn");
    goog.events.listen(d_inbox, goog.events.EventType.CLICK, function() {
        wat.app.mailHandler.switchMailbox(wat.mail.Mailbox.INBOX);
    }, false, self);
    goog.events.listen(d_sent, goog.events.EventType.CLICK, function() {
        // TODO: Not yet implemented!
    }, false, self);
    goog.events.listen(d_trash, goog.events.EventType.CLICK, function() {
        wat.app.mailHandler.switchMailbox(wat.mail.Mailbox.TRASH);
    }, false, self);
};

/**
 * TODO: Outsource later on to a user model
 */
wat.app.loadUser = function() {
    var request = new goog.net.XhrIo();
    // We don't need to add the folder data entry, since it defaults to INBOX
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
        if (request.isSuccess()) {
            var userInfoJSON = request.getResponseJson();
            wat.app.userMail = userInfoJSON.email;
        } else {
            //error
            console.log("something went wrong: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    });
    request.send(wat.app.LOAD_USER_URI_, 'POST', null);

};