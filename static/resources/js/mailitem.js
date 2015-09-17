/**
 *
 * Created by mdrobek on 30/06/15.
 */
goog.provide('wat.mail.MailItem');

goog.require('wat');
goog.require('wat.mail');
goog.require('wat.mail.ReceivedMail');
goog.require('wat.soy.mail');
goog.require('goog.object');
goog.require('goog.events');
goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.date');
goog.require('goog.i18n.DateTimeFormat');
goog.require('goog.soy');
goog.require('goog.string');
goog.require('goog.date.Date');

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Public methods                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * A MailItem reflects the UI element of a received mail that is shown in the overview and main
 * mail page.
 * @param {wat.mail.ReceivedMail} jsonData
 * @param {string} folder
 * @constructor
 */
wat.mail.MailItem = function(jsonData, folder) {
    var self = this;
    self.Mail = new wat.mail.ReceivedMail(jsonData);
    self.DomID = "mailItem_" + self.Mail.UID;
    self.Folder = folder;
    self.Previous_Folder = folder;
    self.Date = goog.date.fromIsoString(self.Mail.Header.Date);
    self.DateString = (new goog.i18n.DateTimeFormat("dd/MM/yyyy")).format(self.Date);
    self.TimeString = (new goog.i18n.DateTimeFormat("HH:mm")).format(self.Date);
    self.ShortFrom = wat.mail.MailHandler.shrinkField(self.Mail.Header.Sender, 45, true);
    self.ShortSubject = wat.mail.MailHandler.shrinkField(self.Mail.Header.Subject, 33, true);
    // Is the given date of the mail today?
    self.IsFromToday = goog.date.isSameDay(self.Date);
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                 Member declaration                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @type {wat.mail.ReceivedMail}
 */
wat.mail.MailItem.prototype.Mail = null;
wat.mail.MailItem.prototype.DomID = "";
// The folder in which the mail currently resides
wat.mail.MailItem.prototype.Folder = "";
// The folder, the mail was located before it has been moved
wat.mail.MailItem.prototype.Previous_Folder = "";
/**
 * @type {goog.date.Date}
 */
wat.mail.MailItem.prototype.Date = null;
wat.mail.MailItem.prototype.DateString = "";
wat.mail.MailItem.prototype.TimeString = "";

wat.mail.MailItem.prototype.ShortFrom = "";
wat.mail.MailItem.prototype.ShortSubject = "";
wat.mail.MailItem.prototype.HasContentBeenLoaded = false;
wat.mail.MailItem.prototype.IsFromToday = false;

/**
 *
 * @param {function} activateClickEventCb Function to be called, if the mail item overview element
 * is clicked (thus activated). The method will be called with the current MailItem as its
 * first parameters.
 * @param {boolean} [opt_prepend] If omitted, the default behaviour is to append this rendered
 * mail item to the end of the mail overview DOM.
 * If True - Inserts this mail item at the beginning of the mail overview DOM.
 * @public
 */
wat.mail.MailItem.prototype.renderMail = function(activateClickEventCb, opt_prepend) {
    var self = this,
        mailTableElem = goog.dom.getElement("mailItems"),
        d_mailItem = goog.soy.renderAsElement(wat.soy.mail.mailOverviewItem, this);
    // 1) Add click event callback for the newly rendered item
    goog.events.listen(d_mailItem, goog.events.EventType.CLICK, function() {
        if (goog.isDefAndNotNull(activateClickEventCb)) activateClickEventCb(self);
    }, false);
    // 2) Check, whether to append or prepend this item to the mail overview DOM
    if (goog.isDefAndNotNull(opt_prepend) && opt_prepend) {
        goog.dom.insertChildAt(mailTableElem, d_mailItem, 0);
    } else {
        goog.dom.append(mailTableElem, d_mailItem);
    }
};

/**
 * @public
 */
wat.mail.MailItem.prototype.loadContent = function(successLoadCb) {
    var self = this,
        //req = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("uid", self.Mail.UID);
    data.add("folder", self.Folder);
    //goog.events.listen(req, goog.net.EventType.COMPLETE, function(event) {
    //    // request complete
    //    var request = event.currentTarget,
    //        jsonResponse = {};
    //    if (request.isSuccess()) {
    //        jsonResponse = request.getResponseJson();
    //        goog.array.forEach(goog.object.getKeys(jsonResponse), function(curType) {
    //            self.Mail.Content.set(curType, new wat.mail.ContentPart(
    //                goog.object.get(jsonResponse, curType)));
    //        });
    //        self.HasContentBeenLoaded = true;
    //        if (goog.isDefAndNotNull(successLoadCb)) successLoadCb(self);
    //    } else {
    //        // error
    //        console.log("something went wrong loading content for mail: " + request.getLastError());
    //        console.log("^^^ " + request.getLastErrorCode());
    //    }
    //}, false, self);
    wat.xhr.send(wat.mail.LOAD_MAILCONTENT_URI, function(event) {
        // request complete
        var request = event.currentTarget,
            jsonResponse = {};
        if (request.isSuccess()) {
            jsonResponse = request.getResponseJson();
            goog.array.forEach(goog.object.getKeys(jsonResponse), function(curType) {
                self.Mail.Content.set(curType, new wat.mail.ContentPart(
                    goog.object.get(jsonResponse, curType)));
            });
            self.HasContentBeenLoaded = true;
            if (goog.isDefAndNotNull(successLoadCb)) successLoadCb(self);
        } else {
            // error
            console.log("something went wrong loading content for mail: " + request.getLastError());
            console.log("^^^ " + request.getLastErrorCode());
        }
    }, 'POST', data.toString());
};

/**
 *
 * @param {boolean} active  True - Will be highlighted
 *                          False - Otherwise
 * @public
 */
wat.mail.MailItem.prototype.highlightOverviewItem = function(active) {
    var self = this,
        d_mailOverview = goog.dom.getElement(self.DomID),
        d_mailOverviewEntry = goog.dom.getElementByClass("entry", d_mailOverview);
    if (active) {
        // The highlight effect has to be activated
        if (!goog.dom.classes.has(d_mailOverviewEntry, "active")) {
            goog.dom.classes.add(d_mailOverviewEntry, "active");
        }
    } else {
        // The highlight effect has to be deactivated
        if (goog.dom.classes.has(d_mailOverviewEntry, "active")) {
            goog.dom.classes.remove(d_mailOverviewEntry, "active");
        }
    }
};

/**
 * Moves the mail from its current folder into the "Trash" folder. The current mail will be flagged
 * as 'Deleted'.
 */
wat.mail.MailItem.prototype.trash = function() {
    var self = this,
        origMailFolder = self.Folder;
    // 2) CLIENT-SIDE: Remove mail from current folder and add it to trash (changes the items
    //                 Folder and Previous_Folder values!)
    wat.app.mailHandler.moveMail(self, wat.mail.MailboxFolder.TRASH);
    // 3) SERVER-SIDE: Now send information to server
    self.trashRequest_(origMailFolder, function(trashedUID) {
            // The mail has a new UID now
            self.Mail.UID = trashedUID;
        }, function(req) {
            wat.app.mailHandler.moveMail(self, self.Previous_Folder);
    });
};

/**
 * Change the Seen flag of the mail to the given new state.
 * @param {boolean} newSeenState
 *      True  -> If the mail hasn't been seen yet, it will be tagged on the client and server as
 *               seen (the \Seen flag will be added)
 *      False -> Same as True, but the opposite
 */
wat.mail.MailItem.prototype.setSeen = function(newSeenState) {
    // 1) Check if the flag has to be changed
    if (this.Mail.Flags.Seen === newSeenState) { /* nothing to do here */ return; }
    // 2) First apply all client-side effects -> better user experience
    var self = this,
        d_seenMailItem = goog.dom.getElement(self.DomID+"_Seen");
    self.Mail.Flags.Seen = newSeenState;
    if (newSeenState) {
        if (goog.dom.classes.has(d_seenMailItem, "newMail")) {
            goog.dom.classes.remove(d_seenMailItem, "newMail");
        }
    } else {
        if (!goog.dom.classes.has(d_seenMailItem, "newMail")) {
            goog.dom.classes.add(d_seenMailItem, "newMail");
        }
    }
    // 3) Notify the user that this mail is now seen
    wat.app.mailHandler.notifyAboutMails(false, 1);
    // 4) Now send information to server
    self.updateFlagsRequest_(self.Folder, self.Mail.UID, wat.mail.SEEN_FLAG, newSeenState,
        function(request) {
            // TODO: Revert changes in client state of Seen flag
    });
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Private methods                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * @param {string} folder The folder in which the mail resides, whose flags should be updates.
 * @param {string} uid The IMAP server unique ID of the mail.
 * @param {wat.mail.MailFlags} flag
 * @param {boolean} addFlags True - The given flags will be added to the mail mail
 *                           False - The given flags will be removed from the mail
 * @param {function} errorCb
 * @private
 */
wat.mail.MailItem.prototype.updateFlagsRequest_ = function(folder, uid, flag, addFlags, errorCb) {
    var self = this,
        request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("folder", folder);
    data.add("uid", uid);
    // True -> flags will be added | False -> Flags will be removed
    data.add("add", addFlags);
    data.add("flags", goog.json.serialize(flag));
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
        if (!request.isSuccess()) {
            // error
            console.log("something went wrong loading content for mail: " + request.getLastError());
            console.log("^^^ " + request.getLastErrorCode());
            if (goog.isDefAndNotNull(errorCb)) errorCb(request);
        }
    }, false, self);
    request.send(wat.mail.UPDATE_FLAGS_URI, 'POST', data.toString());
};

/**
 *
 * @param successCb
 * @param errorCb
 * @private
 */
wat.mail.MailItem.prototype.trashRequest_ = function(origMailFolder, successCb, errorCb) {
    var self = this,
        request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("uid", self.Mail.UID);
    data.add("folder", origMailFolder);
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var req = event.currentTarget,
            trashedUID;
        if (req.isSuccess()) {
            trashedUID = req.getResponseJson().trashedUID;
            if (goog.isDefAndNotNull(successCb)) successCb(trashedUID);
        } else {
            // error
            console.log("something went wrong loading content for mail: " + req.getLastError());
            console.log("^^^ " + req.getLastErrorCode());
            if (goog.isDefAndNotNull(errorCb)) errorCb(req);
        }
    }, false, self);
    request.send(wat.mail.TRASH_MAIL_URI, 'POST', data.toString());
};

/**
 * @param {wat.mail.MailItem} mail1
 * @param {wat.mail.MailItem} mail2
 * @returns {number} 0 - If both mails are of the same date.<br>
 * >0 - mail1 is earlier than mail2.
 * <0 - mail1 is later than mail2.
 */
wat.mail.MailItem.comparator = function (mail1, mail2) {
    return goog.date.Date.compare(mail1.Date, mail2.Date)*-1;
};
