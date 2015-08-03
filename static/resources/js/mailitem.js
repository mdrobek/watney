/**
 *
 * Created by mdrobek on 30/06/15.
 */
goog.provide('wat.mail.MailItem');

goog.require('wat');
goog.require('wat.mail');
goog.require('wat.mail.ReceivedMail');
goog.require('wat.soy.mail');
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
 * @constructor
 */
wat.mail.MailItem = function(jsonData) {
    var self = this;
    self.Mail = jsonData;
    self.DomID = "mailItem_" + self.Mail.UID;
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
wat.mail.MailItem.prototype.DomID = null;
/**
 * @type {goog.date.Date}
 */
wat.mail.MailItem.prototype.Date = null;
wat.mail.MailItem.prototype.DateString = null;
wat.mail.MailItem.prototype.TimeString = null;

wat.mail.MailItem.prototype.ShortFrom = null;
wat.mail.MailItem.prototype.ShortSubject = null;
wat.mail.MailItem.prototype.HasContentBeenLoaded = false;

wat.mail.MailItem.prototype.IsFromToday = false;

/**
 *
 */
wat.mail.MailItem.prototype.renderMail = function() {
    var self = this,
        mailTableElem = goog.dom.getElement("mailItems"),
        d_mailItem = goog.soy.renderAsElement(wat.soy.mail.mailOverviewItem, this);
    goog.events.listen(d_mailItem, goog.events.EventType.CLICK, self.showContent, false, self);
    goog.dom.append(mailTableElem, d_mailItem);
};

wat.mail.MailItem.prototype.showContent = function() {
    var self = this;
    if (!self.HasContentBeenLoaded) {
        self.loadContent_();
    } else {
        self.changeSeenStatus_(true);
        wat.mail.MailHandler.hideActiveNewMail(null);
        self.deactivateLastOverviewItem_();
        self.highlightOverviewItem_();
        self.fillMailPage_();
        self.adjustCtrlBtns_();
    }
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Private methods                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * @private
 */
wat.mail.MailItem.prototype.loadContent_ = function() {
    var self = this,
        request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("uid", self.Mail.UID);
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
        if (request.isSuccess()) {
            self.Mail.Content = request.getResponseJson();
            self.HasContentBeenLoaded = true;
            self.showContent();
        } else {
            // error
            console.log("something went wrong loading content for mail: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    }, false, self);
    request.send(wat.mail.LOAD_MAILCONTENT_URI, 'POST', data.toString());
};


wat.mail.MailItem.prototype.deactivateLastOverviewItem_ = function() {
    if ("" != wat.mail.LAST_ACTIVE_OVERVIEW_ITEM_ID) {
        var d_mailOverview = goog.dom.getElement(wat.mail.LAST_ACTIVE_OVERVIEW_ITEM_ID),
            d_mailOverviewEntry = goog.dom.getElementByClass("entry", d_mailOverview);
        if (goog.dom.classes.has(d_mailOverviewEntry, "active")) {
            wat.mail.LAST_ACTIVE_OVERVIEW_ITEM_ID = "";
            goog.dom.classes.remove(d_mailOverviewEntry, "active");
        }
    }
};

wat.mail.MailItem.prototype.highlightOverviewItem_ = function() {
    var self = this,
        d_mailOverview = goog.dom.getElement(self.DomID),
        d_mailOverviewEntry = goog.dom.getElementByClass("entry", d_mailOverview);
    if (!goog.dom.classes.has(d_mailOverviewEntry, "active")) {
        wat.mail.LAST_ACTIVE_OVERVIEW_ITEM_ID = self.DomID;
        goog.dom.classes.add(d_mailOverviewEntry, "active");
    }
};

wat.mail.MailItem.prototype.fillMailPage_ = function() {
    var self = this,
        d_mailDetailsFrom = goog.dom.getElement("mailDetails_From"),
        d_mailDetailsSubject = goog.dom.getElement("mailDetails_Subject"),
        d_mailDetailsTo = goog.dom.getElement("mailDetails_To"),
        d_mailDetailsContent = goog.dom.getElement("mailDetails_Content"),
        htmlContent = goog.string.newLineToBr(goog.string.canonicalizeNewlines(self.Mail.Content));
    goog.dom.setTextContent(d_mailDetailsFrom, self.Mail.Header.Sender);
    goog.dom.setTextContent(d_mailDetailsSubject, self.Mail.Header.Subject);
    goog.dom.setTextContent(d_mailDetailsTo, self.Mail.Header.Receiver);

    goog.dom.removeChildren(d_mailDetailsContent);
    goog.dom.appendChild(d_mailDetailsContent, goog.dom.htmlToDocumentFragment(htmlContent));
};

/**
 * Resets all control button events for the current mail (e.g., reply, forward and delete button).
 * @private
 */
wat.mail.MailItem.prototype.adjustCtrlBtns_ = function() {
    var self = this,
        d_replyBtn = goog.dom.getElement("mailReplyBtn"),
        d_deleteBtn = goog.dom.getElement("mailDeleteBtn");
    goog.events.removeAll(d_replyBtn);
    goog.events.removeAll(d_deleteBtn);
    goog.events.listen(d_replyBtn, goog.events.EventType.CLICK, self.createReply_,
        false, self);
    goog.events.listen(d_deleteBtn, goog.events.EventType.CLICK, function() {
        self.changeDeletionStatus_(true);
    }, false, self);
};


wat.mail.MailItem.prototype.createReply_ = function() {
    var self = this,
        from = goog.isDefAndNotNull(wat.app.userMail) ? wat.app.userMail
            : self.Mail.Header.Receiver;
    wat.app.mailHandler.createReply(from, self.Mail.Header.Sender, self.Mail.Header.Subject,
        self.Mail.Content);
};

/**
 * Change the Deleted flag of the mail to the given new state.
 * @param {boolean} newDeletedState
 *      True  -> If the mail hasn't been deleted yet, it will be tagged on the client and server as
 *               deleted (the \Deleted flag will be added)
 *      False -> Same as True, but the opposite
 */
wat.mail.MailItem.prototype.changeDeletionStatus_ = function(newDeletedState) {
    // 1) Check if the flag has to be changed
    if (this.Mail.Flags.Deleted === newDeletedState) { /* nothing to do here */ return; }
    var self = this,
        nextItem = wat.app.mailHandler.getNextItem(self);
    // 1) First apply all client-side effects -> better user experience
    self.Mail.Flags.Deleted = newDeletedState;
    // 2) Highlight the next item (if there is one)
    if (null != nextItem) nextItem.showContent();
    else {
        // 2a) TODO: Clean the mail page:
        //      * reset from, to, subject
        //      * deactivate control btns (reply, delete)
        //      * reset content area
    }
    // 3) Remove the deleted item from the overview list
    goog.dom.removeNode(goog.dom.getElement(self.DomID));
    // 4) Now send information to server
    self.updateFlagsRequest_(wat.mail.DELETE_FLAG, newDeletedState, function(request) {
        // TODO: Revert changes in client state of Deleted flag
    });
};


/**
 * Change the Seen flag of the mail to the given new state.
 * @param {boolean} newSeenState
 *      True  -> If the mail hasn't been seen yet, it will be tagged on the client and server as
 *               seen (the \Seen flag will be added)
 *      False -> Same as True, but the opposite
 */
wat.mail.MailItem.prototype.changeSeenStatus_ = function(newSeenState) {
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
    // 3) Now send information to server
    self.updateFlagsRequest_(wat.mail.SEEN_FLAG, newSeenState, function(request) {
        // TODO: Revert changes in client state of Seen flag
    });
};

/**
 *
 * @param {wat.mail.MailFlags} flag
 * @param {boolean} addFlags True - The given flags will be added to the mail mail
 *                           False - The given flags will be removed from the mail
 * @param {function} errorCb
 * @private
 */
wat.mail.MailItem.prototype.updateFlagsRequest_ = function(flag, addFlags, errorCb) {
    var self = this,
        request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("uid", self.Mail.UID);
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

wat.mail.MailItem.prototype.removeOverviewItem_ = function() {
    goog.dom.removeNode(goog.dom.getElement(this.DomID));
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
