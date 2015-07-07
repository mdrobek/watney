/**
 * Created by lion on 22/06/15.
 */
goog.provide('wat.mail.MailHandler');

goog.require('wat');
goog.require('wat.mail');
goog.require('wat.mail.Mail');
goog.require("goog.net.XhrIo");
goog.require("goog.Uri.QueryData");
goog.require('goog.json');
goog.require('goog.array');

wat.mail.MailHandler = function() {
};

wat.mail.LOAD_MAILS_URI_ = "/headers";

/**
 * Loads all Memories for the given Day and populates the given Day object with these loaded
 * memories.
 * @param {cake.mem.Day} day
 * @param {function} localCallback
 * @private
 */
wat.mail.MailHandler.prototype.loadMails = function(localCallback) {
    var request = new goog.net.XhrIo();
    //    data = new goog.Uri.QueryData();
    //data.add("did", day.getID());
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
            //memoriesJSON;
        if (request.isSuccess()) {
            var headersJSON = request.getResponseJson();
            console.log("FINISHED LOADING HEADERS: " + headersJSON);
            // Populate the Day object with all loaded memories from cake backend
            var mails = goog.array.map(headersJSON, function(curHeader) {
                var curMail = new wat.mail.Mail(curHeader);
                curMail.renderMail();
                return curMail;
            });
            if (null != localCallback) { localCallback(mails); }
        } else {
            //error
            console.log("something went wrong when loading a day: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    });
    //request.send(wat.mail.LOAD_MAILS_URI_, 'POST', data.toString());
    request.send(wat.mail.LOAD_MAILS_URI_, 'POST');
};
