/**
 *
 * Created by mdrobek on 16/08/15.
 */
goog.provide('wat.mail.MailboxFolder');
goog.provide('wat.mail.Inbox');
goog.provide('wat.mail.Sent');
goog.provide('wat.mail.Trash');

goog.require('wat.mail');
goog.require('wat.mail.MailDetails');
goog.require('wat.mail.MailItem');
goog.require('goog.array');
goog.require('goog.events');
goog.require('goog.Uri.QueryData');
goog.require('goog.json');
goog.require('goog.structs.AvlTree');
goog.require('goog.ui.Dialog');

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
 * The name of the mailbox folder as displayed in the UI.
 * @type {string}
 */
wat.mail.MailboxFolder.prototype.DisplayName = "";
/**
 * The dom ID used to identify this mailbox in the navigation menu.
 * @type {string}
 */
wat.mail.MailboxFolder.prototype.NavDomID = "";
/**
 * The Dom ID for the loading spinner icon in the mail overview list.
 * @type {string}
 */
wat.mail.MailboxFolder.prototype.OverviewSpinnerDomID = "Overview_Spinner";
/**
 * The Y offset used to place the Spinner in the mail overview list.
 * @type {Number}
 */
wat.mail.MailboxFolder.prototype.LoadingSpinnerYOffset = 400;
/**
 * The Y offset used to place the Spinner in the mail overview list.
 * @type {Number}
 */
wat.mail.MailboxFolder.prototype.ContentSpinnerDomID = "DetailsLoadingSpinnerID";
/**
 * Whether this mailbox folder is a client-side local folder only, or if it is mirrored on the
 * backend.
 * @type {boolean}
 */
wat.mail.MailboxFolder.prototype.IsLocal = false;
/**
 * Stores all the mails that are by default shown in this mailbox.
 * ATTENTION: Has to be assigned in each implementation constructor (Inbox, Sent, Trash)
 * @type {goog.structs.AvlTree}
 * @protected
 */
wat.mail.MailboxFolder.prototype.mails_ = null;
/**
 * Contains all those mails that are by default not shown in the mail list overview.
 * ATTENTION: Has to be assigned in each implementation constructor (Inbox, Sent, Trash)
 * @type {goog.structs.AvlTree}
 * @protected
 */
wat.mail.MailboxFolder.prototype.hiddenMails_ = null;
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
/**
 *
 * @type {wat.mail.MailDetails}
 * @private
 */
wat.mail.MailboxFolder.prototype.detailsComponent_ = null;

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
 * This method renders the navigation button in the left navigation menu for the current
 * mailbox folder.
 * @param {boolean} [opt_isActive] True - The rendered navigation button will be set active.
 *                                 False - Otherwise.
 * @public
 */
wat.mail.MailboxFolder.prototype.renderNavButton = function(opt_isActive) {
    var self = this,
        d_navBarContainer = goog.dom.getElement("navBarContainer"),
        d_newNavButton = goog.soy.renderAsElement(wat.soy.mail.mailNavEntry, {
            DomID: self.NavDomID,
            ButtonName: self.DisplayName,
            IsActive: opt_isActive
        });
    // 1) Add the click event to the menu button
    goog.events.listen(d_newNavButton, goog.events.EventType.CLICK, function() {
        // 1a) Switch to the new mailbox
        wat.app.mailHandler.switchMailboxFolder(self.Name);
    });
    // 2) Append the menu entry to the navigation bar
    goog.dom.appendChild(d_navBarContainer, d_newNavButton);
};

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
    // 1) Add normal mails regular AvlTree and mails that are flagged as deleted to hidden AvlTree
    goog.array.forEach(mails, function(curMail) {
        var curTree = self.mails_;
        if (curMail.Mail.Flags.Deleted) {
            curTree = self.hiddenMails_;
        }
        // TODO: Check for already existing date in the Tree
        //       See bug: watney-26: MailItems with same Date disappear
        curTree.add(curMail);
    });
    // 2) Update the navigation bar visualization for this folder
    self.updateNavigationBar();
};

wat.mail.MailboxFolder.prototype.getUnreadMails = function() {
    return goog.array.filter(this.mails_.getValues(), function(curMail) {
        if (!curMail.Mail.Flags.Seen) return true;
    });
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
    wat.app.mailHandler.moveMail(tempLastItem, wat.mail.MailboxFolder.TRASH);
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

/**
 *
 */
wat.mail.MailboxFolder.prototype.loadMails = function() {
    var self = this,
        data = new goog.Uri.QueryData();
    data.add("mailInformation", "overview");
    data.add("mailbox", self.Name);
    wat.xhr.send(wat.mail.LOAD_MAILS_URI, function (event) {
        var request = event.currentTarget;
        if (request.isSuccess()) {
            self.retrieved_ = true;
            var mailsJSON = request.getResponseJson(),
                mails = goog.array.map(mailsJSON, function(curMailJSON) {
                    return new wat.mail.MailItem(curMailJSON, curMailJSON.Header.Folder);
                }),
                unseenMails;
            mails = self.postProcessMails_(mails);
            self.addMailsToFolder(mails);
            self.renderMailboxContent_();
            unseenMails = goog.array.filter(mails, function(curMail) {
                return !curMail.Mail.Flags.Seen;
            });
            if (unseenMails.length > 0) {
                wat.app.mailHandler.notifyAboutMails(unseenMails.length, self.Name);
            }
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
        console.log("MailboxFolder.switchAndRemoveNode : NOT YET IMPLEMENTED");
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

    var self = this;
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
    var self = this,
        d_navBtn = goog.dom.getElement(self.NavDomID);
    // 1) Clean mail overview list
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
    // 2) Show the loading spinner icon
    wat.mail.enableSpinner(true, "mailItems", self.OverviewSpinnerDomID, self.LoadingSpinnerYOffset);
    // 3) Add highlight for new button
    goog.dom.classes.add(d_navBtn, "active");
    // 4) Change the control buttons for the specific mail folder
    self.renderCtrlbar();
    // 5) Check, whether we need to retrieve the Mails for the given mailbox ...
    if (!self.retrieved_) {
        // 5a) ... and if so, do it
        self.loadMails();
    } else {
        // 5b) ... otherwise just render the mails
        self.renderMailboxContent_();
    }
};

wat.mail.MailboxFolder.prototype.deactivate = function() {
    var d_curNavBtn = goog.dom.getElement(this.NavDomID);
    if (goog.dom.classes.has(d_curNavBtn, "active")) {
        goog.dom.classes.remove(d_curNavBtn, "active");
    }
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
    // First: Clean the contents from a potentially last shown mail
    goog.dom.removeChildren(goog.dom.getElement("mailDetails_Content"));
    if (!activatedMail.HasContentBeenLoaded) {
        wat.mail.enableSpinner(true, "mailDetails_Content", self.ContentSpinnerDomID, 300);
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
        // 5) Hide the mail content loading spinner icon
        wat.mail.enableSpinner(false, "mailDetails_Content", self.ContentSpinnerDomID);
        // 6) Copy over the mail information into the mail details form
        self.detailsComponent_.render(activatedMail);
        // 7) Adjust control buttons for newly activated mail item
        self.updateCtrlBtns_(activatedMail);
    }
    self.lastActiveMailItem_ = activatedMail;
};

/**
 * This method shows an empty mailbox message in the mail overview item list.
 * ATTENTION:
 *   The method also empties the mail overview list. This means, that all DOM elements for mail
 *   items being shown, will be removed.
 * @param {boolean} enable True - The 'empty folder message' will be shown.
 *                         False|Undefined- The message will be removed from the mail overview list.
 * @public
 */
wat.mail.MailboxFolder.prototype.showEmptyFolderMsg = function(enable) {
    var self = this,
        d_mailItems = goog.dom.getElement("mailItems"),
        d_emptyFolderMsg;
    goog.dom.removeChildren(d_mailItems);
    if (goog.isDefAndNotNull(enable) && enable) {
        // 1) Clean mail overview list
        d_emptyFolderMsg = goog.soy.renderAsElement(wat.soy.mail.emptyFolderMessage);
        goog.dom.appendChild(d_mailItems, d_emptyFolderMsg);
        // 2) Disable empty trash button
        self.updateCtrlBtns_();
        // 3) Clean the mail details component
        self.detailsComponent_.clean();
    }
};

/**
 * Updates the left navigation bar about new arrived mails or mails have been read.
 * @public
 */
wat.mail.MailboxFolder.prototype.updateNavigationBar = function() {
    var self = this,
        d_navbarButton = goog.dom.getElement(self.NavDomID),
        d_navbarButtonA = goog.dom.getElementsByTagNameAndClass("a", null, d_navbarButton)[0],
        unreadMails = self.getUnreadMails(),
        label = self.DisplayName;
    if (unreadMails.length > 0) {
        label = label + " (" + unreadMails.length + ")";
        goog.dom.classes.add(d_navbarButton, "strong");
    } else {
        goog.dom.classes.remove(d_navbarButton, "strong");
    }
    goog.dom.setTextContent(d_navbarButtonA, label);
};

/**
 * Returns the name of the associated server-side folder.
 * ATTENTION: Needs to be overwritten for client-side only folders.
 * @returns {string}
 */
wat.mail.MailboxFolder.prototype.getAssocServerSideFolderName = function() {
    return this.Name;
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                               Protected methods                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 *
 * @protected
 */
wat.mail.MailboxFolder.prototype.renderMailboxContent_ = function() {
    var self = this;
    // 1) Remove potentially shown empty mailbox folder message
    self.showEmptyFolderMsg(false);
    // 2) Always disable a potential existing loading spinner icon
    wat.mail.enableSpinner(false, "mailItems", self.OverviewSpinnerDomID);
    // 3) Render all mails in the mailbox
    self.mails_.inOrderTraverse(function(curMail) {
        curMail.renderMail(function(mail) {
            // 4a) Unhighlight currently active mail
            self.lastActiveMailItem_.highlightOverviewItem(false);
            // 4b) Activate the clicked mail
            self.showMail(mail);
        });
    });
    // 4) Highlight the most up-to-date mail in the mailbox
    if (self.mails_.getCount() > 0) {
        self.showMail(self.mails_.getKthValue(0));
    } else {
        // No mails are available -> show empty folder message
        self.showEmptyFolderMsg(true);
    }
};

/**
 * This method runs through the given retrieved mails from the backend and filters dependent on the
 * specific mailbox implementation those mails, that are part of this mailbox, but have to be
 * excluded for particular reasons.
 * @param {[wat.mail.MailItem]} retrievedMails All mails that have been loaded from the
 * backend.
 * @protected
 * @return [wat.mail.MailItem] An array of filtered mails.
 */
wat.mail.MailboxFolder.prototype.postProcessMails_ = function(retrievedMails) {
    return retrievedMails;
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
    this.hiddenMails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    this.Name = wat.mail.MailboxFolder.INBOX;
    this.DisplayName = "Inbox";
    this.NavDomID = "Inbox_Btn";
    this.detailsComponent_ = new wat.mail.MailDetails();
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
                var newMail = new wat.mail.MailItem(curMailJSON, curMailJSON.Header.Folder);
                newMail.renderMail(function(mail) {
                    // 1) Unhighlight currently active mail
                    self.lastActiveMailItem_.highlightOverviewItem(false);
                    // 2) Activate the clicked mail
                    self.showMail(mail);
                }, true);
                return newMail;
            });
            mails = self.postProcessMails_(mails);
            if (mails.length > 0) {
                self.addMailsToFolder(mails);
                wat.app.mailHandler.notifyAboutMails(mails.length, self.Name);
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

/**
 * @override
 */
wat.mail.Inbox.prototype.postProcessMails_ = function(retrievedMails) {
    // In case this is the Inbox, filter all spam mails and add them to the Spam folder
    var spamMails = goog.array.filter(retrievedMails, function(curMail) {
            return curMail.Mail.Header.SpamIndicator > 0;
        });
    if (spamMails.length > 0) {
        wat.app.mailHandler.addMailsToSpamFolder(spamMails);
    }
    // remove spam mails from original mail array
    goog.array.forEach(spamMails, function(curSpam) {
        goog.array.remove(retrievedMails, curSpam);
    });
    return retrievedMails;
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
    // No Mail was given -> disable all buttons
    if (!goog.isDefAndNotNull(forMail)) {
        if (!goog.dom.classes.has(d_replyBtn, "disabled")) {
            goog.dom.classes.add(d_replyBtn, "disabled");
        }
        if (!goog.dom.classes.has(d_deleteBtn, "disabled")) {
            goog.dom.classes.add(d_deleteBtn, "disabled");
        }
        return;
    }

    goog.events.removeAll(d_replyBtn);
    goog.events.removeAll(d_deleteBtn);
    goog.events.listen(d_replyBtn, goog.events.EventType.CLICK, function() {
            var mail = forMail.Mail,
                from = goog.isDefAndNotNull(wat.app.userMail) ? wat.app.userMail
                    : mail.Header.Receiver;
            wat.app.mailHandler.createNewMail(from, mail.Header.Sender, mail.Header.Subject,
                mail.Content, true);
        }, false);
    goog.events.listen(d_deleteBtn, goog.events.EventType.CLICK, function() {
        // 1) CLIENT-SIDE: Switch the mail overview list and details part to the next mail in the list
        self.switchAndRemoveNode(forMail);
        // 2) Handle all further client- and server-side actions associated with the deletion
        wat.app.mailHandler.moveMail(forMail, wat.mail.MailboxFolder.TRASH);
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
    this.hiddenMails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    this.Name = wat.mail.MailboxFolder.SENT;
    this.DisplayName = this.Name;
    this.NavDomID = "Sent_Btn";
    this.detailsComponent_ = new wat.mail.MailDetails();
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
 * @private
 */
wat.mail.Sent.prototype.updateCtrlBtns_ = function() {
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
    this.hiddenMails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    this.Name = wat.mail.MailboxFolder.TRASH;
    this.DisplayName = this.Name;
    this.NavDomID = "Trash_Btn";
    this.detailsComponent_ = new wat.mail.MailDetails();
};
goog.inherits(wat.mail.Trash, wat.mail.MailboxFolder);

wat.mail.Trash.prototype.RestoreBtnDomID = "trashRestoreBtn";
wat.mail.Trash.prototype.EmptyBtnDomID = "trashEmptyBtn";

/**
 *
 */
wat.mail.Trash.prototype.renderCtrlbar = function() {
    var d_ctrlBarContainer = goog.dom.getElement("ctrlBarContainer"),
        d_newCtrlBar = goog.soy.renderAsElement(wat.soy.mail.trashCtrlBar, {
            RestoreBtnID: this.RestoreBtnDomID,
            EmptyBtnID: this.EmptyBtnDomID
        });
    // 2) Remove the current control bar and add the new one
    goog.dom.removeChildren(d_ctrlBarContainer);
    goog.dom.appendChild(d_ctrlBarContainer, d_newCtrlBar);
};

wat.mail.Trash.prototype.deleteActiveMail = function() {
    var self = this,
        tempLastItem = self.lastActiveMailItem_;
    if (!goog.isDefAndNotNull(tempLastItem)) return;
    // 1) Remove mail items DOM elements and switch to the next item
    self.switchAndRemoveNode(tempLastItem);
    // 2) Change \\Deleted flag client- and server-side
    tempLastItem.setDeleted(true);
    // 3) Move mail into different member tree
    self.mails_.remove(tempLastItem);
    self.hiddenMails_.add(tempLastItem);
};

/**
 * Resets all control button events for the current mail (e.g., reply, forward and delete button).
 * @param {wat.mail.MailItem} forMail
 * @public
 */
wat.mail.Trash.prototype.updateCtrlBtns_ = function(forMail) {
    var self = this,
        d_restoreBtn = goog.dom.getElement(self.RestoreBtnDomID),
        d_emptyBtn = goog.dom.getElement(self.EmptyBtnDomID);
    // No Mail was given -> disable all buttons
    if (!goog.isDefAndNotNull(forMail)) {
        if (!goog.dom.classes.has(d_restoreBtn, "disabled")) {
            goog.dom.classes.add(d_restoreBtn, "disabled");
        }
        if (!goog.dom.classes.has(d_emptyBtn, "disabled")) {
            goog.dom.classes.add(d_emptyBtn, "disabled");
        }
        return;
    }

    if (forMail.Previous_Folder === forMail.Folder) {
        // 1) Disable restore button, if the mail wasn't moved in this session
        goog.dom.classes.add(d_restoreBtn, "disabled");
    } else {
        // 2a) Enable restore button, if the mail was moved in this session
        goog.dom.classes.remove(d_restoreBtn, "disabled");
        // 2b) Add events for restore and empty buttons
        goog.events.listen(d_restoreBtn, goog.events.EventType.CLICK, function() {
            self.switchAndRemoveNode(forMail);
            wat.app.mailHandler.moveMail(forMail, forMail.Previous_Folder);
        }, false);
    }
    // 3) Add empty trash listener for modal dialog if mails are available
    if (0 == self.mails_.getCount()) {
        goog.dom.classes.add(d_emptyBtn, "disabled");
    } else {
        goog.dom.classes.remove(d_emptyBtn, "disabled");
        if (!goog.events.hasListener(d_emptyBtn, goog.events.EventType.CLICK)) {
            goog.events.listen(d_emptyBtn, goog.events.EventType.CLICK, function () {
                self.showEmptyTrashModal_();
            }, false);
        }
    }
};

/**
 *
 * @private
 */
wat.mail.Trash.prototype.showEmptyTrashModal_ = function() {
    // 1) Create dialog and content
    var self = this,
        dialog = new goog.ui.Dialog("empty-trash-modal modal-dialog"),
        d_content = goog.soy.renderAsElement(wat.soy.mail.modalEmptyTrash, this);
    dialog.setContent(goog.dom.getOuterHtml(d_content));
    dialog.setTitle("Permanently delete mails");
    dialog.setButtonSet(goog.ui.Dialog.ButtonSet.OK_CANCEL);
    // 2) Set dialog visible to create the DOM elements necessary to get the Button elements
    dialog.setVisible(true);
    var d_cancelBtn = dialog.getButtonSet().getButton(
            goog.ui.Dialog.ButtonSet.DefaultButtons.CANCEL.key),
        d_okBtn = dialog.getButtonSet().getButton(
            goog.ui.Dialog.ButtonSet.DefaultButtons.OK.key);
    // 3) Add button event listener
    goog.events.listen(d_okBtn, goog.events.EventType.CLICK, function() {
        self.emptyMailbox_();
    }, false);
    goog.events.listen(d_cancelBtn, goog.events.EventType.CLICK, function() {
        dialog.dispose();
    }, false);
    // 4) Add button CSS classes
    goog.dom.classes.add(d_okBtn, "btn btn-primary");
    goog.dom.classes.add(d_cancelBtn, "btn btn-primary pull-right");
    // 5) Make dialog more user-friendly
    dialog.setHasTitleCloseButton(false);
    dialog.setDraggable(false);
    dialog.setEscapeToCancel(true);
    dialog.setDisposeOnHide(true);
};

/**
 * Runs through all mails in the mailbox that are not deleted (whose Flag \\Deleted is not set) and
 * changes the deletion flag to active. All DOM elements of these mails will be removed from the
 * mail overview list and the 'empty folder message' DOM element will be shown instead.
 * ATTENTION:
 *   All mails whose flag \\Deleted is being activated, will be moved to the 'hiddenMails_' member
 *   and are available up until reload of the page.
 * @private
 */
wat.mail.Trash.prototype.emptyMailbox_ = function() {
    var self = this;
    // 1) Remove all mail item DOM elements from the mail overview list and show 'no mails' text
    self.showEmptyFolderMsg(true);
    // 2) Change flag (also on server-side).
    goog.array.forEach(self.mails_.getValues(), function(curMail) {
        // 2a) Change client- and server-side status of mail flag \\Deleted
        curMail.setDeleted(true);
        // 2b) Move mails from 'mails_' tree to 'hiddenMails_' tree
        self.mails_.remove(curMail);
        self.hiddenMails_.add(curMail);
    });
    // 3) Reset last selected item
    self.lastActiveMailItem_ = null;
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
    this.hiddenMails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    this.Name = wat.mail.MailboxFolder.SPAM;
    this.DisplayName = this.Name;
    this.NavDomID = "Spam_Btn";
    this.IsLocal = true;
    this.detailsComponent_ = new wat.mail.MailDetails();
};
goog.inherits(wat.mail.Spam, wat.mail.MailboxFolder);

/**
 * Special
 * Returns the name of the associated server-side folder.
 * @returns {string}
 */
wat.mail.MailboxFolder.prototype.getAssocServerSideFolderName = function() {
    return wat.mail.MailboxFolder.INBOX;
};

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
    var self = this,
        d_navBtn = goog.dom.getElement(self.NavDomID);
    // 1) Clean mail overview list
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
    // 2) Show the loading spinner icon
    wat.mail.enableSpinner(true, "mailItems", self.OverviewSpinnerDomID, self.LoadingSpinnerYOffset);
    // 3) Add highlight for new button
    goog.dom.classes.add(d_navBtn, "active");
    // 4) Change the control buttons for the specific mail folder
    self.renderCtrlbar();
    // 5) Local client-folder: always just render the content
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
    console.log("Spam.updateCtrlBtns_ NOT YET IMPLEMENTED");
};

wat.mail.Spam.prototype.deleteActiveMail = function() {
    console.log("TODO: Delete of active mailitem in trash folder hasn't been implemented yet!");
};
