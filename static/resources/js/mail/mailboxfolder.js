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
// Reminder: This folder only exists on the client-side
wat.mail.MailboxFolder.SPAM = "Spam";

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

/**
 * Requests the backend to check for new mails or changes in the mailbox folder.
 *
 * @param {function} updateCb
 * @public
 */
wat.mail.MailboxFolder.prototype.synchFolder = goog.abstractMethod;
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
    // Special treatment for mails that are flagged as deleted
    var self = this,
        consideredMails = goog.array.filter(mails, function(curMail) {
            return !curMail.Mail.Flags.Deleted;
        });
    goog.array.forEach(consideredMails, function(curMail) { self.mails_.add(curMail); });
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

    self.switchAndRemoveNode(tempLastItem);
    tempLastItem.trash();
};

/**
 * @param {boolean} [opt_before] True | undefined - Tries to switch to the sibling that is timely
 *                                                  before the active mail item.
 *                               False - Tries to switch to the sibling that is timely after.
 * @return {boolean} True - Switch worked well => active item has changed
 *                   False - Couldn't switch, e.g., the active item is the last item in the list
 *                           => no change for the active item
 * @public
 */
wat.mail.MailboxFolder.prototype.switchActiveMail = function(opt_before) {
    var self = this;
    if (!goog.isDefAndNotNull(self.lastActiveMailItem_)) return false;
    return self.switchToSibling(self.lastActiveMailItem_, opt_before);
};

wat.mail.MailboxFolder.prototype.loadMails = function() {
    var self = this,
        data = new goog.Uri.QueryData();
    data.add("mailInformation", "overview");
    data.add("mailbox", self.Name);
    wat.xhr.send(wat.mail.LOAD_MAILS_URI, function (event) {
        var request = event.currentTarget;
        if (request.isSuccess()) {
            var mailsJSON = request.getResponseJson(),
                mails = goog.array.map(mailsJSON, function(curMailJSON) {
                    return new wat.mail.MailItem(curMailJSON, self.Name);
                }),
                unseenMails = goog.array.filter(mails, function(curMail) {
                    return !curMail.Mail.Flags.Seen;
                });
            // In case this is the Inbox, filter all spam mails and add them to the Spam folder
            if (self.Name === wat.mail.MailboxFolder.INBOX) {
                var spamMails = goog.array.filter(mails, function(curMail) {
                    return curMail.Mail.Header.SpamIndicator > 0;
                });
                wat.app.mailHandler.addMailsToSpamFolder(spamMails);
                // remove spam mails from original mail array
                goog.array.forEach(spamMails, function(curSpam) {
                    goog.array.remove(mails, curSpam);
                });
            }
            self.addMailsToFolder(mails);
            self.renderMailboxContent_();
            wat.app.mailHandler.notifyAboutMails(true, unseenMails.length);
            self.retrieved_ = true;
        } else {
            //error
            console.log("something went wrong: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    }, 'POST', data.toString());
};

/**
 * Switches to the next item (any sibling) in the mail overview list and displays its details in
 * the mail details part. Afterwards, removes the DOM node of the previously active item.
 * ATTENTION: Changes the state of 'lastActiveMailItem_'.
 * @param {wat.mail.MailItem} curMailItem
 * @public
 */
wat.mail.MailboxFolder.prototype.switchAndRemoveNode = function(curMailItem) {
    var self = this,
        nextItem = self.getOtherItem(curMailItem);
    // 1) Highlight the next item (if there is one)
    if (null != nextItem) {
        self.showMail(nextItem);
    } else {
        // 1a) There's no other mail that could be shown in the current folder
        console.log("MailItem.trash : NOT YET IMPLEMENTED");
        // 1a) TODO: Clean the mail page:
        //      * reset from, to, subject
        //      * deactivate control btns (reply, delete)
        //      * reset content area
    }
    // 2) Remove the deleted item from the overview list
    goog.dom.removeNode(goog.dom.getElement(curMailItem.DomID));
};

/**
 *
 * @param {wat.mail.MailItem} curMailItem
 * @param {boolean} [opt_before] True | undefined - Tries to switch to the sibling that is timely
 *                                                  before the given mail item.
 *                               False - Tries to switch to the sibling that is timely after.
 * @returns {boolean} True - Switch was successful
 *                    False - otherwise
 * @public
 */
wat.mail.MailboxFolder.prototype.switchToSibling = function(curMailItem, opt_before) {
    var self = this,
        nextItem = self.getNextItem(curMailItem, opt_before);
    // 1) Check, whether there is a sibling to be highlighted
    if (null != nextItem) {
        // 1a) And if so, de-highlight the current item
        curMailItem.highlightOverviewItem(false);
        // 1b) Highlight the next item (if there is one)
        self.showMail(nextItem);
        return true;
    }
    return false;
};

/**
 * This method selects the next mail item in the overview list that is timely before the given item
 * (further away from 'now'). In case the given item is the oldest mail item in the mail box, the
 * method selects the next mail item that is timely after this item (closer to 'now'). If, for
 * whatever reason, the given mail item was the only item in the box, null is returned.
 * @param {wat.mail.MailItem} curMailItem
 * @return {wat.mail.MailItem}
 * @public
 */
wat.mail.MailboxFolder.prototype.getOtherItem = function(curMailItem) {
    // 1) If it is not part of this mailbox folder, simply return null
    if (!this.contains(curMailItem)) return null;

    var self = this,
        nextItem;
    // 1) If there's less than or 1 mail in the mailbox, no 'next' item exists
    if (self.mails_.getCount() <= 1) return null;
    // 2) First try item that is timely before the current item
    nextItem = self.getNextItem(curMailItem);
    if (goog.isDefAndNotNull(nextItem)) return nextItem;
    // 2b) The timely item before doesn't exist, but we already checked, that there are at least 2
    //     items in the list => return the item that is timely after the given one
    else return self.getNextItem(nextItem, false);
};

/**
 * This method selects the next mail item in the overview list that is the sibling of the given
 * 'curMailItem'. If the given flag 'before' is true, the successor (timely before) of the given
 * mail item is returned. Otherwise, if the given flag 'before' is false, the predecessor (timely
 * after) the given item is returned. If the respective sibling does not exist, null is returned.
 * @param {wat.mail.MailItem} curMailItem
 * @param {boolean} [opt_before] True | undefined - Selects the next item that is timely BEFORE the
 *                                                  given item
 *                               False - Selects the next item that is timely AFTER the given item
 * @return wat.mail.MailItem || null
 * @public
 */
wat.mail.MailboxFolder.prototype.getNextItem = function(curMailItem, opt_before) {
    // 1) If it is not part of this mailbox folder, simply return null
    if (!this.contains(curMailItem)) return null;

    var self = this,
        nextItem = null;
    // 1) Check trivial cases
    // a) If there's less than or 1 mail in the mailbox, no 'next' item exists
    if (self.mails_.getCount() <= 1) return null;
    // b) timely before is chosen, but given item is the last in the list (=the oldest item)
    if ((!goog.isDefAndNotNull(opt_before) || opt_before)
            && self.mails_.getMaximum() === curMailItem) {
        return null;
    }
    // c) timely after is chosen, but given item is the first in the list (=the oldest item)
    if (goog.isDefAndNotNull(opt_before) && !opt_before
            && self.mails_.getMinimum() === curMailItem) {
        return null;
    }

    // 2) Now, dependent on the given timely flag, return the respective sibling
    if (!goog.isDefAndNotNull(opt_before) || opt_before) {
        return self.mails_.getKthValue(self.mails_.indexOf(curMailItem)+1);
    } else {
        return self.mails_.getKthValue(self.mails_.indexOf(curMailItem)-1);
    }
};

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
        plainContent = goog.string.newLineToBr(
            goog.string.canonicalizeNewlines(mail.getContent("text/plain")));
    goog.dom.setTextContent(d_mailDetailsFrom, mail.Header.Sender);
    goog.dom.setTextContent(d_mailDetailsSubject, mail.Header.Subject);
    goog.dom.setTextContent(d_mailDetailsTo, mail.Header.Receiver);

    goog.dom.removeChildren(d_mailDetailsContent);
    //goog.dom.appendChild(d_mailDetailsContent, goog.dom.createTextNode(plainContent));
    // TODO: should be a textarea for plain content!
    goog.dom.appendChild(d_mailDetailsContent, goog.dom.htmlToDocumentFragment(plainContent));
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
 * @param reregisterCb
 * @override
 */
wat.mail.Inbox.prototype.synchFolder = function(reregisterCb) {
    var self = this;
    wat.xhr.send(wat.mail.CHECK_MAILS_URI, function (event) {
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
            //console.log("### Finished poll for new mails: " + mails);
            if (goog.isDefAndNotNull(mails) && mails.length > 0) {
                self.addMailsToFolder(mails);
                wat.app.mailHandler.notifyAboutMails(true, mails.length);
            }
            if (goog.isDefAndNotNull(reregisterCb)) reregisterCb.call(wat.app.mailHandler);
        } else {
            // There could be multiple error possibilities here:
            // 1) The session has timed out => Check for the respective error code
            switch (req.getStatus()) {
                case 419: {
                    // TODO: Implement better error visualization before redirecting to the login
                    //       page
                    alert("Your session has timed out\nYou are being redirected to the login page");
                    window.location.replace("/");
                    break;
                }
                default:
                    console.log("Something went wrong loading content for mail: \n\t"
                        + "Status: " + req.getLastErrorCode() + "\n\t"
                        + "Error Code: " + req.getLastErrorCode() + "\n\t"
                        + "Error Msg: " + req.getLastError() + "\n");
            }
        }
    }, 'POST');

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
        self.switchAndRemoveNode(forMail);
        // 2) Handle all further client- and server-side actions associated with the deletion
        forMail.trash();
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
 * Special treatment for the trash folder => all mails in here are shown
 * @override
 */
//wat.mail.Trash.prototype.addMailsToFolder = function(mails) {
//    var self = this;
//    goog.array.forEach(mails, function(curMail) { self.mails_.add(curMail); })
//};

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


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  Spam Constructor                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * The Spam folder is a pure client-side mailbox folder that is not mirrored on the server backend.
 * All mails in this folder are physically located in the INBOX folder, but have been classified as
 * spam.
 * @constructor
 * @abstract
 */
wat.mail.Spam = function() {
    this.mails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    this.Name = wat.mail.MailboxFolder.TRASH;
};
goog.inherits(wat.mail.Spam, wat.mail.MailboxFolder);

/**
 * Special treatment
 * @override
 */
wat.mail.Spam.prototype.loadMails = function() { /* Nothing to do here */ };
/**
 * Special treatment
 * @override
 */
wat.mail.Spam.prototype.synchFolder = function() { /* Nothing to do here */ };

/**
 * @override
 */
wat.mail.Spam.prototype.activate = function() {
    var self = this;
    // 1) Change the control buttons for the specific mail folder
    self.renderCtrlbar();
    // 2) Clean mail overview list
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
    // 3) Local client-folder: always just render the content
    self.renderMailboxContent_();
};
/**
 *
 */
wat.mail.Spam.prototype.renderCtrlbar = function() {
    var d_ctrlBarContainer = goog.dom.getElement("ctrlBarContainer"),
        d_newCtrlBar = goog.soy.renderAsElement(wat.soy.mail.spamCtrlBar, this);
    // 2) Remove the current control bar and add the new one
    goog.dom.removeChildren(d_ctrlBarContainer);
    goog.dom.appendChild(d_ctrlBarContainer, d_newCtrlBar);
};

/**
 * Resets all control button events for the current mail (e.g., reply, forward and delete button).
 * @param {wat.mail.MailItem} forMail
 * @public
 */
wat.mail.Spam.prototype.updateCtrlBtns_ = function(forMail) {
    console.log("Trash.updateCtrlBtns_ NOT YET IMPLEMENTED");
};

wat.mail.Spam.prototype.deleteActiveMail = function() {
    console.log("TODO: Delete of active mailitem in trash folder hasn't been implemented yet!");
};
