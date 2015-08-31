/**
 *
 * Created by mdrobek on 16/08/15.
 */
goog.provide('wat.mail.MailboxFolder');
goog.provide('wat.mail.Inbox');
goog.provide('wat.mail.Sent');
goog.provide('wat.mail.Trash');

goog.require('wat.mail');
goog.require('goog.array');
goog.require('goog.events');
goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.json');
goog.require('goog.structs.AvlTree');


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Constructor                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.MailboxFolder = function() {};

// Static folder names
wat.mail.MailboxFolder.INBOX = "/";
wat.mail.MailboxFolder.SENT = "Sent";
wat.mail.MailboxFolder.TRASH = "Trash";

/**
 * The name of the mailbox folder (one of the static names defined above).
 * @type {string}
 */
wat.mail.MailboxFolder.prototype.Name = "";
/**
 * ATTENTION: Has to be assigned in each implementation constructor (Inbox, Sent, Trash)
 * @type {goog.structs.AvlTree}
 * @protected
 */
wat.mail.MailboxFolder.prototype.mails_ = null;
/**
 * Whether the mails for this folder have already been loaded or not
 * @type {boolean}
 * @private
 */
wat.mail.MailboxFolder.prototype.retrieved_ = false;
/**
 *
 * @type {wat.mail.MailItem}
 * @private
 */
wat.mail.MailboxFolder.prototype.lastActiveMailItem_ = null;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  Abstract methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @public
 */
wat.mail.MailboxFolder.prototype.renderCtrlbar = goog.abstractMethod;

/**
 * @param {wat.mail.MailItem} forMail
 * @public
 */
wat.mail.MailboxFolder.prototype.updateCtrlBtns_ = goog.abstractMethod;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  Public methods                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @param {wat.mail.MailItem} mailItem
 */
wat.mail.MailboxFolder.prototype.contains = function(mailItem) {
    return this.mails_.contains(mailItem);
};

/**
 * Removes the given mail item from the internal data structure.
 * @param {wat.mail.MailItem} mail
 */
wat.mail.MailboxFolder.prototype.remove = function(mail) {
    this.mails_.remove(mail);
};

/**
 * Adds the given mail item from the internal data structure.
 * @param {wat.mail.MailItem} mail
 */
wat.mail.MailboxFolder.prototype.add = function(mail) {
    this.mails_.add(mail);
};

/**
 * Only adds the mail to the internal data structure. Does not render any content.
 * @param {wat.mail.MailItem[]} mails
 */
wat.mail.MailboxFolder.prototype.addMailsToFolder = function(mails) {
    var self = this;
    goog.array.forEach(mails, function(curMail) { self.mails_.add(curMail); })
};

/**
 * Executes all following actions:
 *  - remove the active mail from the internal data structure and move it to the Trash folder
 *  - remove the active mail item DOM structures
 *  - highlight the next mail item in the view
 *
 *  ATTENTION:
 *  Please see specific implementation for the Trash folder for further information.
 */
wat.mail.MailboxFolder.prototype.deleteActiveMail = function() {
    var self = this,
        tempLastItem = self.lastActiveMailItem_;
    if (!goog.isDefAndNotNull(tempLastItem)) return;

    self.switchToNextItem(tempLastItem);
    tempLastItem.setDeleted(true);
};

wat.mail.MailboxFolder.prototype.loadMails = function() {
    var self = this,
        request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("mailInformation", "overview");
    data.add("mailbox", self.Name);
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        var request = event.currentTarget;
        if (request.isSuccess()) {
            var mailsJSON = request.getResponseJson(),
                mails = goog.array.map(mailsJSON, function(curMailJSON) {
                    return new wat.mail.MailItem(curMailJSON, self.Name);
                });
            self.addMailsToFolder(mails);
            self.renderMailboxContent_();
            self.retrieved_ = true;
        } else {
            //error
            console.log("something went wrong: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    }, false, self);
    request.send(wat.mail.LOAD_MAILS_URI, 'POST', data.toString());
};

/**
 * Switches to the next item in the mail overview list and displays its details in the mail details
 * part.
 * ATTENTION: Changes the state of 'lastActiveMailItem_'.
 * @param {wat.mail.MailItem} curMailItem
 */
wat.mail.MailboxFolder.prototype.switchToNextItem = function(curMailItem) {
    var self = this,
        nextItem = self.getNextItem(curMailItem);
    // 1) Highlight the next item (if there is one)
    if (null != nextItem) {
        self.showMail(nextItem);
    } else {
        // 1a) There's no other mail that could be shown in the current folder
        console.log("MailItem.setDeleted : NOT YET IMPLEMENTED");
        // 1a) TODO: Clean the mail page:
        //      * reset from, to, subject
        //      * deactivate control btns (reply, delete)
        //      * reset content area
    }
    // 2) Remove the deleted item from the overview list
    goog.dom.removeNode(goog.dom.getElement(curMailItem.DomID));
};

/**
 * This method selects the next mail item in the overview list that is timely before the given item
 * (further away from 'now'). In case the given item is the oldest mail item in the mail box, the
 * method selects the next mail item that is timely after this item (closer to 'now'). If, for
 * whatever reason, the given mail item was the only item in the box, null is returned.
 * @param {wat.mail.MailItem} curMailItem
 * @return {wat.mail.MailItem}
 */
wat.mail.MailboxFolder.prototype.getNextItem = function(curMailItem) {
    // 1) If it is not part of this mailbox folder, simply return null
    if (!this.contains(curMailItem)) return null;

    var self = this,
        nextItem = null;
    // 1) If there's less than or 1 mail in the mailbox, no 'next' item exists
    if (self.mails_.getCount() <= 1) return null;
    // 2) First try to find item that is timely before the given item
    self.mails_.inOrderTraverse(function(curItem) {
        if (curItem !== curMailItem) {
            nextItem = curItem;
            return true;
        }
    }, curMailItem);
    // 2a) If we found the next item, return it
    if (null != nextItem) return nextItem;
    // 3) If not, traverse in the opposite direction to find the item timely after the given one
    self.mails_.reverseOrderTraverse(function(curItem) {
        if (curItem !== curMailItem) {
            nextItem = curItem;
            return true;
        }
    }, curMailItem);
    // 3a) There needs to be a result here, otherwise case 1) or 2) would've been true
    return nextItem;
};

/**
 * @public
 */
//wat.mail.MailboxFolder.prototype.haveBeenLoaded = function() {
//    return this.retrieved_;
//};

wat.mail.MailboxFolder.prototype.activate = function() {
    var self = this;
    // 1) Change the control buttons for the specific mail folder
    self.renderCtrlbar();
    // 2) Clean mail overview list
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
    // 3) Check, whether we need to retrieve the Mails for the given mailbox ...
    if (!self.retrieved_) {
        // 3a) ... and if so, do it
        self.loadMails();
    } else {
        // 3b) ... otherwise just render the mails
        self.renderMailboxContent_();
    }
};

wat.mail.MailboxFolder.prototype.deactivate = function() {
   // TODO
};

/**
 * ATTENTION: Changes the state of 'lastActiveMailItem_'.
 * @param {wat.mail.MailItem} activatedMail
 * @public
 */
wat.mail.MailboxFolder.prototype.showMail = function(activatedMail) {
    var self = this;
    if (!goog.isDefAndNotNull(activatedMail)) {
        console.log("MailboxFolder.ShowMail failed for 'null' mail");
        return;
    }
    if (!activatedMail.HasContentBeenLoaded) {
        activatedMail.loadContent(function(loadedMail) {
            self.showMail(loadedMail);
        });
    } else {
        // 1) Set the status of the newly activated mail item to 'Seen'
        activatedMail.setSeen(true);
        // 2) Hide a 'New Mail' window, if open
        wat.mail.MailHandler.hideActiveNewMail(null);
        // 3) If there is a previously highlighted item, remove highlighting of it
        if (goog.isDefAndNotNull(self.lastActiveMailItem_))
            self.lastActiveMailItem_.highlightOverviewItem(false);
        // 4) Highlight newly activated mail item in mail list
        activatedMail.highlightOverviewItem(true);
        // 5) Copy over the mail information into the mail details form

        // TODO: Go on here: Self/this is the window instead of the MailboxFolder ....
        //       probably coming from the loadContent event listener

        self.fillMailPage_(activatedMail);
        // 6) Adjust control buttons for newly activated mail item
        self.updateCtrlBtns_(activatedMail);
    }
    self.lastActiveMailItem_ = activatedMail;
};


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                 Private methods                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 *
 * @private
 */
wat.mail.MailboxFolder.prototype.renderMailboxContent_ = function() {
    var self = this;
    // 1) Render all mails in the mailbox
    self.mails_.inOrderTraverse(function(curMail) {
        curMail.renderMail(function(mail) {
            // 1) Unhighlight currently active mail
            self.lastActiveMailItem_.highlightOverviewItem(false);
            // 2) Activate the clicked mail
            self.showMail(mail);
        });
    });
    // 2) Highlight the most up-to-date mail in the mailbox
    if (self.mails_.getCount() > 0) {
        self.showMail(self.mails_.getKthValue(0));
    }
};

/**
 *
 * @param {wat.mail.MailItem} withMailItem
 * @private
 */
wat.mail.MailboxFolder.prototype.fillMailPage_ = function(withMailItem) {
    var mail = withMailItem.Mail,
        d_mailDetailsFrom = goog.dom.getElement("mailDetails_From"),
        d_mailDetailsSubject = goog.dom.getElement("mailDetails_Subject"),
        d_mailDetailsTo = goog.dom.getElement("mailDetails_To"),
        d_mailDetailsContent = goog.dom.getElement("mailDetails_Content"),
        htmlContent = goog.string.newLineToBr(goog.string.canonicalizeNewlines(mail.Content));
    goog.dom.setTextContent(d_mailDetailsFrom, mail.Header.Sender);
    goog.dom.setTextContent(d_mailDetailsSubject, mail.Header.Subject);
    goog.dom.setTextContent(d_mailDetailsTo, mail.Header.Receiver);

    goog.dom.removeChildren(d_mailDetailsContent);
    goog.dom.appendChild(d_mailDetailsContent, goog.dom.htmlToDocumentFragment(htmlContent));
};


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  INBOX Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Inbox = function() {
    this.mails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    this.Name = wat.mail.MailboxFolder.INBOX;
};
goog.inherits(wat.mail.Inbox, wat.mail.MailboxFolder);

/**
 * Special treatment for the inbox folder.
 * @override
 */
wat.mail.Inbox.prototype.addMailsToFolder = function(mails) {
    var self = this,
        consideredMails = goog.array.filter(mails, function(curMail) {
            return !curMail.Mail.Flags.Deleted && !curMail.Mail.Flags.Draft;
        });
    goog.array.forEach(consideredMails, function(curMail) { self.mails_.add(curMail); })
};

wat.mail.Inbox.prototype.checkForNewMails = function(reregisterCb) {
    var self = this,
        request = new goog.net.XhrIo();
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var req = event.currentTarget,
            mailsJSON,
            mails;
        if (req.isSuccess()) {
            mailsJSON = req.getResponseJson();
            mails = goog.array.map(mailsJSON, function(curMailJSON) {
                var newMail = new wat.mail.MailItem(curMailJSON, self.Name);
                newMail.renderMail(function(mail) {
                    // 1) Unhighlight currently active mail
                    self.lastActiveMailItem_.highlightOverviewItem(false);
                    // 2) Activate the clicked mail
                    self.showMail(mail);
                }, true);
                return newMail;
            });
            console.log("### Finished poll for new mails: " + mails);
            if (goog.isDefAndNotNull(mails) && mails.length > 0) {
                self.addMailsToFolder(mails);
                //self.showMail(mails[mails.length-1]);
            }
            if (goog.isDefAndNotNull(reregisterCb)) reregisterCb.call(wat.app.mailHandler);
        } else {
            // error
            console.log("something went wrong loading content for mail: " + event.getLastError());
            console.log("^^^ " + event.getLastErrorCode());
        }
    }, false, self);
    request.send(wat.mail.CHECK_MAILS_URI, 'POST');

};

////////////////////////////////////        ABSTRACT METHODS

/**
 * @override
 */
wat.mail.Inbox.prototype.renderCtrlbar = function() {
    var d_ctrlBarContainer = goog.dom.getElement("ctrlBarContainer"),
        d_newCtrlBar = goog.soy.renderAsElement(wat.soy.mail.inboxCtrlBar, this);
    // 2) Remove the current control bar and add the new one
    goog.dom.removeChildren(d_ctrlBarContainer);
    goog.dom.appendChild(d_ctrlBarContainer, d_newCtrlBar);
};

/**
 * Resets all control button events for the current mail (e.g., reply, forward and delete button).
 * @param {wat.mail.MailItem} forMail
 * @public
 */
wat.mail.Inbox.prototype.updateCtrlBtns_ = function(forMail) {
    var self = this,
        d_replyBtn = goog.dom.getElement("mailReplyBtn"),
        d_deleteBtn = goog.dom.getElement("inbox_mailDeleteBtn");
    goog.events.removeAll(d_replyBtn);
    goog.events.removeAll(d_deleteBtn);
    goog.events.listen(d_replyBtn, goog.events.EventType.CLICK, function() {
            var mail = forMail.Mail,
                from = goog.isDefAndNotNull(wat.app.userMail) ? wat.app.userMail
                    : mail.Header.Receiver;
            wat.app.mailHandler.createReply(from, mail.Header.Sender, mail.Header.Subject,
                mail.Content);
        }, false);
    goog.events.listen(d_deleteBtn, goog.events.EventType.CLICK, function() {
        // 1) CLIENT-SIDE: Switch the mail overview list and details part to the next mail in the list
        self.switchToNextItem(forMail);
        // 2) Handle all further client- and server-side actions associated with the deletion
        forMail.setDeleted(true);
    }, false, forMail);
};


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   SENT Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Sent = function() {
    this.mails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    this.Name = wat.mail.MailboxFolder.SENT;
};
goog.inherits(wat.mail.Sent, wat.mail.MailboxFolder);

/**
 *
 */
wat.mail.Sent.prototype.renderCtrlbar = function() {
    var d_ctrlBarContainer = goog.dom.getElement("ctrlBarContainer"),
        d_newCtrlBar = goog.soy.renderAsElement(wat.soy.mail.sentCtrlBar, this);
    // 2) Remove the current control bar and add the new one
    goog.dom.removeChildren(d_ctrlBarContainer);
    goog.dom.appendChild(d_ctrlBarContainer, d_newCtrlBar);
};


/**
 * Resets all control button events for the current mail (e.g., reply, forward and delete button).
 * @param {wat.mail.MailItem} forMail
 * @private
 */
wat.mail.Sent.prototype.updateCtrlBtns_ = function(forMail) {
    console.log("Sent.updateCtrlBtns_ NOT YET IMPLEMENTED");
};


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  Trash Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Trash = function() {
    this.mails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    this.Name = wat.mail.MailboxFolder.TRASH;
};
goog.inherits(wat.mail.Trash, wat.mail.MailboxFolder);

/**
 *
 */
wat.mail.Trash.prototype.renderCtrlbar = function() {
    var d_ctrlBarContainer = goog.dom.getElement("ctrlBarContainer"),
        d_newCtrlBar = goog.soy.renderAsElement(wat.soy.mail.trashCtrlBar, this);
    // 2) Remove the current control bar and add the new one
    goog.dom.removeChildren(d_ctrlBarContainer);
    goog.dom.appendChild(d_ctrlBarContainer, d_newCtrlBar);
};

/**
 * Resets all control button events for the current mail (e.g., reply, forward and delete button).
 * @param {wat.mail.MailItem} forMail
 * @public
 */
wat.mail.Trash.prototype.updateCtrlBtns_ = function(forMail) {
    console.log("Trash.updateCtrlBtns_ NOT YET IMPLEMENTED");
};

wat.mail.Trash.prototype.deleteActiveMail = function() {
    console.log("TODO: Delete of active mailitem in trash folder hasn't been implemented yet!");
};
