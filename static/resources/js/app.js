/**
 * Created by mdrobek on 02/07/15.
 */
goog.provide('wat.app');

goog.require('wat.mail');
goog.require('wat.mail.MailHandler');
goog.require('wat.mail.MailboxFolder');
goog.require('goog.events');
goog.require('goog.array');
goog.require("goog.net.XhrIo");
goog.require("goog.Uri.QueryData");

wat.app.LOAD_USER_URI_ = "/userInfo";

// Global accessible objects
/**
 * @type {wat.mail.MailHandler}
 */
wat.app.mailHandler = null;
/**
 * @type {JSON object}
 */
wat.app.userMail = null;

wat.app.start = function() {
    // 1) Load user details
    wat.app.loadUser();
    // 2) Add all events to the mailbox buttons on the left nav bar
    wat.app.addMailboxEvents();
    // 3) Start loading mails
    wat.app.mailHandler = new wat.mail.MailHandler();
    wat.app.mailHandler.switchMailboxFolder(wat.mail.MailboxFolder.INBOX);
};

wat.app.addMailboxEvents = function() {
    var self = this,
        btns = [{
                domName: "Inbox_Btn",
                mailboxFolder: wat.mail.MailboxFolder.INBOX
            }, {
                domName: "Sent_Btn",
                mailboxFolder: wat.mail.MailboxFolder.SENT
            }, {
                domName: "Trash_Btn",
                mailboxFolder: wat.mail.MailboxFolder.TRASH
            }];
    goog.array.forEach(btns, function(curBtn) {
        var d_newClickedBtn = goog.dom.getElement(curBtn.domName);
        goog.events.listen(d_newClickedBtn, goog.events.EventType.CLICK, function() {
            if (wat.app.mailHandler.SelectedMailbox === curBtn.mailboxFolder) return;
            // 1) Remove highlight of other buttons
            goog.array.forEach(btns, function(curBtn) {
                var d_curBtn = goog.dom.getElement(curBtn.domName);
                if (goog.dom.classes.has(d_curBtn, "active")) {
                    goog.dom.classes.remove(d_curBtn, "active");
                }
            });
            // 2) Add highlight for new button
            goog.dom.classes.add(d_newClickedBtn, "active");
            // 3) Switch to the new mailbox
            wat.app.mailHandler.switchMailboxFolder(curBtn.mailboxFolder);
        }, false, self);
    });
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