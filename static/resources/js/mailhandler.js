/**
 * Created by lion on 22/06/15.
 */
goog.provide('wat.mail.MailHandler');

goog.require('wat');
goog.require('wat.mail');
goog.require('wat.mail.MailItem');
goog.require("goog.net.XhrIo");
goog.require("goog.Uri.QueryData");
goog.require('goog.json');
goog.require('goog.array');

wat.mail.MailHandler = function() {
};

wat.mail.LOAD_MAILS_URI_ = "/mails";

/**
 * @param {function} localCallback
 * @private
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
            var mails = goog.array.map(mailsJSON, function(curMailJSON) {
                var curMail = new wat.mail.MailItem(curMailJSON);
                curMail.renderMail();
                return curMail;
            });
            if (null != localCallback) { localCallback(mails); }
        } else {
            //error
            console.log("something went wrong: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    });
    request.send(wat.mail.LOAD_MAILS_URI_, 'POST', data.toString());
};

