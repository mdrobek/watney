/**
 * Created by mdrobek on 22/06/15.
 */
goog.provide('wat.mail.MailHandler');

goog.require('wat');
goog.require('wat.mail');
goog.require('wat.mail.MailItem');
goog.require('wat.mail.NewMail');
goog.require("goog.net.XhrIo");
goog.require("goog.Uri.QueryData");
goog.require('goog.json');
goog.require('goog.array');

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Constructor                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler = function() {};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     GLOBAL VARS                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @type wat.mail.NewMail
 */
wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM;
wat.mail.LAST_ACTIVE_OVERVIEW_ITEM_ID = "";
wat.mail.LOAD_MAILS_URI_ = "/mails";

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private members                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler.prototype.mails = [];

/**
 * @param {function} localCallback
 * @public
 */
wat.mail.MailHandler.prototype.loadMails = function(localCallback) {
    var request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("mailInformation", "overview");
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
            //memoriesJSON;
        if (request.isSuccess()) {
            var mailsJSON = request.getResponseJson();
            // Populate the Mail overview with all retrieved mails
            wat.mail.MailHandler.mails = goog.array.map(mailsJSON, function(curMailJSON) {
                var curMail = new wat.mail.MailItem(curMailJSON);
                curMail.renderMail();
                return curMail;
            });
            if (null != localCallback) { localCallback(wat.mail.MailHandler.mails); }
        } else {
            //error
            console.log("something went wrong: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    });
    request.send(wat.mail.LOAD_MAILS_URI_, 'POST', data.toString());
};

wat.mail.MailHandler.prototype.createReply = function() {
    var self = this,
        newMail = new wat.mail.NewMail("foo@bar.com");
    wat.mail.MailHandler.hideActiveNewMail();
    // Here's still a bug, because the hover listeners are not registered at this point
    // => hovering over this element won't work
    newMail.addNewMail();
    wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = newMail;
};


/**
 * Check if another new mail item is currently active and hide it, if so
 * @static
 */
wat.mail.MailHandler.hideActiveNewMail = function() {
    if (goog.isDefAndNotNull(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM)) {
        wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM.hideAndHoverEvents();
    }
};

