/**
 * Created by mdrobek on 02/07/15.
 */
goog.provide('wat.app');

goog.require('wat.mail');
goog.require('wat.mail.MailHandler');
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

    // 2) Start loading mails
    wat.app.mailHandler = new wat.mail.MailHandler();
    wat.app.mailHandler.loadMails(function(mails) {
        if (null != mails && mails.length > 0) {
            mails[0].showContent();
        }
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