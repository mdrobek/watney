/**
 * Created by mdrobek on 22/06/15.
 */
goog.provide('wat.mail.MailHandler');

goog.require('wat');
goog.require('wat.mail');
goog.require('wat.mail.MailItem');
goog.require('wat.mail.NewMail');
goog.require('goog.events');
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
    // We don't need to add the folder data entry, since it defaults to INBOX
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
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
    request.send(wat.mail.LOAD_MAILS_URI, 'POST', data.toString());
};

wat.mail.MailHandler.prototype.createReply = function(from, to, subject, origText) {
    var newMail = new wat.mail.NewMail(from, to, "Re: "+subject, "\n\n\n\n"+origText);
    wat.mail.MailHandler.hideActiveNewMail(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM);
    newMail.addNewMail();
    wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = newMail;
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    STATIC Methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Check if another new mail item is currently active and hide it, if so
 * @param {wat.mail.NewMail} curNewMail
 * @static
 */
wat.mail.MailHandler.hideActiveNewMail = function(curNewMail) {
    if (goog.isDefAndNotNull(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM)
        && curNewMail != wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM) {
        wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM.hideAndHoverEvents();
    }
};

/**
 *
 * @param {String} subject
 * @param {Number} maxLength
 * @param {Boolean} appendDots Whether to append 3 dots ' ...' at the end of the shortened subject
 * @static
 */
wat.mail.MailHandler.shrinkField = function(subject, maxLength, appendDots) {
    // 1) If we're smaller than the given length, just return
    if (subject.length <= maxLength) return subject;
    // 2) Otherwise, check if we need to append dots ...
    var shortenedLength = appendDots ? maxLength - 4 : maxLength,
        shortenedSubject = subject.substr(0, shortenedLength);
    return appendDots ? (shortenedSubject + " ...") : shortenedSubject;
};


