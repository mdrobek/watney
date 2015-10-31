/**
 *
 * Created by mdrobek on 16/08/15.
 */
goog.provide('wat.mail.MailboxFolder');
goog.provide('wat.mail.MailboxFolder.Buttons');
goog.provide('wat.mail.Inbox');
goog.provide('wat.mail.Sent');
goog.provide('wat.mail.Trash');

goog.require('wat.mail');
goog.require('wat.mail.MailDetails');
goog.require('wat.mail.MailItem');
goog.require('goog.array');
goog.require('goog.events');
goog.require('goog.events.KeyHandler');
goog.require('goog.Uri.QueryData');
goog.require('goog.json');
goog.require('goog.structs.AvlTree');
goog.require('goog.ui.Dialog');
goog.require('goog.ui.LabelInput');

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Constructor                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.MailboxFolder = function() {
    var self = this;
    self.mails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    self.hiddenMails_ = new goog.structs.AvlTree(wat.mail.MailItem.comparator);
    self.detailsComponent_ = new wat.mail.MailDetails();
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Static Vars                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailboxFolder.INBOX = "/";
wat.mail.MailboxFolder.SENT = "Sent";
wat.mail.MailboxFolder.TRASH = "Trash";
// Reminder: This folder only exists on the client-side
wat.mail.MailboxFolder.SPAM = "Spam";
wat.mail.MailboxFolder.Buttons = {};
wat.mail.MailboxFolder.Buttons.DefaultClasses = ["btn", "btn-lg", "btn-primary"];
// Delete button moves a mail into the trash folder
wat.mail.MailboxFolder.Buttons.DELETE_BTN = {
    ID: "DeleteBtn",
    Caption: "Delete",
    Classes: goog.array.concat(wat.mail.MailboxFolder.Buttons.DefaultClasses, "pull-right"),
    Click: function(curMail) {
        // 1) CLIENT-SIDE: Switch the mail overview list and details part to the next mail in the list
        this.switchAndRemoveNode(curMail);
        // 2) Handle all further client- and server-side actions associated with the deletion
        wat.app.mailHandler.moveMail(curMail, wat.mail.MailboxFolder.TRASH);
    }
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                Public Class members                                          ///
////////////////////////////////////////////////////////////////////////////////////////////////////
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
 * The Y offset used to place the Spinner in the mail overview list.
 * @type {Number}
 */
wat.mail.MailboxFolder.prototype.CtrlBarButtonsDomID = "ControlBarID";
/**
 * Whether this mailbox folder is a client-side local folder only, or if it is mirrored on the
 * backend.
 * @type {boolean}
 */
wat.mail.MailboxFolder.prototype.IsLocal = false;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                               Private Class members                                          ///
////////////////////////////////////////////////////////////////////////////////////////////////////
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
 * @type {wat.mail.MailItem}
 * @private
 */
wat.mail.MailboxFolder.prototype.lastActiveMailItem_ = null;
/**
 * @type {wat.mail.MailDetails}
 * @private
 */
wat.mail.MailboxFolder.prototype.detailsComponent_ = null;
/**
 * @type {goog.ui.LabelInput}
 * @private
 */
wat.mail.MailboxFolder.prototype.searchbar_ = null;
/**
 * @type {string}
 * @private
 */
wat.mail.MailboxFolder.prototype.searchbarParentDomID_ = "OverviewSearchBar";
////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  Abstract methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @return An array of Button elements as follows:
 *   [{ID:string, Caption:string, Classes:[string,..], Click:function(curMail){},
 *     DisableIf:function(curMail){}}, ..]
 *   HINT: The 'this' object in all functions always points to the respective mailbox folder.
 * @public
 */
wat.mail.MailboxFolder.prototype.getButtonSet = goog.abstractMethod;
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
 * @override
 */
wat.mail.MailboxFolder.prototype.renderCtrlbar = function() {
    var self = this,
        d_ctrlBarContainer = goog.dom.getElement("ctrlBarContainer"),
        d_newCtrlBar = goog.soy.renderAsElement(wat.soy.mail.ctrlBarBtns, {
            CtrlBarID: "CtrlBarButtonsDomID",
            Buttons: self.getButtonSet()
        });
    // 1) Remove the current control bar and add the new one
    goog.dom.removeChildren(d_ctrlBarContainer);
    goog.dom.appendChild(d_ctrlBarContainer, d_newCtrlBar);
};

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
    // 3) Check, whether searchbar needs to be disabled
    if (0 == self.mails_.getCount()) { self.searchbar_.setEnabled(false); }
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
            // 4) Check, whether searchbar needs to be disabled
            if (0 == self.mails_.getCount()) { self.searchbar_.setEnabled(false); }
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
        self.showEmptyFolderMsg(true);
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
 * @return wat.mail.MailItem || null
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
    // 1) Show the loading spinner icon
    wat.mail.enableSpinner(true, "mailItems", self.OverviewSpinnerDomID,
        self.LoadingSpinnerYOffset);
    // 2) Add highlight for new button
    goog.dom.classes.add(d_navBtn, "active");
    // 3) Change the control buttons for the specific mail folder
    self.renderCtrlbar();
    // 4) Render the search bar
    self.renderSearchbar_();
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
    var self = this,
        d_curNavBtn = goog.dom.getElement(this.NavDomID);
    // 1) Clean mail overview list
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
    // 2) Disable navigation bar button highlighting
    if (goog.dom.classes.has(d_curNavBtn, "active")) {
        goog.dom.classes.remove(d_curNavBtn, "active");
    }
    // 3) Remove the search bar
    if (null != self.searchbar_) { self.searchbar_.dispose(); }
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
    //goog.dom.removeChildren(goog.dom.getElement("mailDetails_Content"));
    self.detailsComponent_.clean();
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
        self.detailsComponent_.render(activatedMail, activatedMail.Mail.LoadContentImages);
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
 * Renders the mail overview list with all mails (or the filtered mails in the given parameter).
 * Afterwards, renders the first mails content in the mail overview list.
 * @param {[wat.mail.MailItem]} [opt_filteredMails] Optional, the array of filtered mails, e.g.,
 *                                                  from the search bar.
 *                                                  Defaults to: self.mails_
 * @protected
 */
wat.mail.MailboxFolder.prototype.renderMailboxContent_ = function(opt_filteredMails) {
    var self = this,
        mailsToShow = goog.isDefAndNotNull(opt_filteredMails) ? opt_filteredMails
            : self.mails_.getValues();
    // 1) Remove potentially shown empty mailbox folder message
    self.showEmptyFolderMsg(false);
    // 2) Always disable a potential existing loading spinner icon
    wat.mail.enableSpinner(false, "mailItems", self.OverviewSpinnerDomID);
    // 3) Render all mails in the mailbox
    goog.array.forEach(mailsToShow, function(curMail) {
        curMail.renderMail(function(mail) {
            // 4a) Unhighlight currently active mail
            self.lastActiveMailItem_.highlightOverviewItem(false);
            // 4b) Activate the clicked mail
            self.showMail(mail);
        });
    });
    // 4) Highlight the most up-to-date mail in the mailbox
    if (mailsToShow.length > 0) {
        self.showMail(mailsToShow[0]);
    } else {
        // No mails are available -> show empty folder message
        self.showEmptyFolderMsg(true);
    }
};

/**
 * Resets all control button events for the current mail (e.g., reply, forward and delete button).
 * @param {wat.mail.MailItem} forMail
 * @public
 */
wat.mail.MailboxFolder.prototype.updateCtrlBtns_ = function(forMail) {
    var self = this,
        d_curBtn;
    // 1) No Mail was given -> disable all buttons
    if (!goog.isDefAndNotNull(forMail)) {
        goog.array.forEach(self.getButtonSet(), function(curButton) {
            d_curBtn = goog.dom.getElement(curButton.ID);
            if (!goog.dom.classes.has(d_curBtn, "disabled")) {
                goog.dom.classes.add(d_curBtn, "disabled");
            }
        });
        return;
    }
    goog.array.forEach(self.getButtonSet(), function(curButton) {
        d_curBtn = goog.dom.getElement(curButton.ID);
        // 2) Check if the button need to be disabled
        if (goog.isDefAndNotNull(curButton.DisableIf)
                && true === curButton.DisableIf.call(self, forMail)) {
            // 2a) Disable the button
            goog.dom.classes.add(d_curBtn, "disabled");
        } else {
            // 2b) Button is enabled, Attach respective Click-functions to all buttons
            goog.dom.classes.remove(d_curBtn, "disabled");
            goog.events.removeAll(d_curBtn);
            goog.events.listen(d_curBtn, goog.events.EventType.CLICK, function () {
                curButton.Click.call(self, forMail);
            }, false);
        }
    });
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

/**
 * Renders the searchbar input element.
 * @private
 */
wat.mail.MailboxFolder.prototype.renderSearchbar_ = function() {
    var self = this,
        d_searchbarParent = goog.dom.getElement(self.searchbarParentDomID_),
        prevSearchVal = '';
    self.searchbar_ = new goog.ui.LabelInput("Type subject or name");
    self.searchbar_.render(d_searchbarParent);
    goog.events.listen(self.searchbar_.getElement(), goog.events.EventType.KEYUP, function () {
        var searchVal = self.searchbar_.getValue();
        if (searchVal === prevSearchVal) { return; }
        prevSearchVal = searchVal;
        var filteredMails = goog.array.filter(self.mails_.getValues(), function(curMail) {
                return goog.string.caseInsensitiveContains(curMail.Mail.Header.Subject, searchVal);
            });
            console.log("Searching for word: " + searchVal);
        self.renderMailboxContent_(filteredMails);
    }, false);
};
////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  INBOX Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Inbox = function() {
    goog.base(this);
    this.Name = wat.mail.MailboxFolder.INBOX;
    this.DisplayName = "Inbox";
    this.NavDomID = "Inbox_Btn";
};
goog.inherits(wat.mail.Inbox, wat.mail.MailboxFolder);
wat.mail.Inbox.prototype.ButtonSet = [
    {
        ID: "mailReplyBtn",
        Caption: "Reply",
        Classes: wat.mail.MailboxFolder.Buttons.DefaultClasses,
        Click: function(curMail) {
            var mail = curMail.Mail,
                from = goog.isDefAndNotNull(wat.app.userMail) ? wat.app.userMail
                    : mail.Header.Receiver;
            wat.app.mailHandler.createNewMail(from, mail.Header.Sender, mail.Header.Subject,
                mail.Content, true);
        }
    },
    wat.mail.MailboxFolder.Buttons.DELETE_BTN
];

////////////////////////////////////        ABSTRACT METHODS
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
 * @returns {Array}
 */
wat.mail.Inbox.prototype.getButtonSet = function() { return this.ButtonSet; };

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

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   SENT Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Sent = function() {
    goog.base(this);
    this.Name = wat.mail.MailboxFolder.SENT;
    this.DisplayName = this.Name;
    this.NavDomID = "Sent_Btn";
};
goog.inherits(wat.mail.Sent, wat.mail.MailboxFolder);
wat.mail.Sent.prototype.ButtonSet = [
    wat.mail.MailboxFolder.Buttons.DELETE_BTN
];
/**
 * @override
 * @returns {Array}
 */
wat.mail.Sent.prototype.getButtonSet = function() { return this.ButtonSet; };

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  TRASH Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Trash = function() {
    goog.base(this);
    this.Name = wat.mail.MailboxFolder.TRASH;
    this.DisplayName = this.Name;
    this.NavDomID = "Trash_Btn";
};
goog.inherits(wat.mail.Trash, wat.mail.MailboxFolder);
wat.mail.Trash.prototype.ButtonSet = [
    {
        ID: "trashRestoreBtn",
        Caption: "Restore",
        Classes: wat.mail.MailboxFolder.Buttons.DefaultClasses,
        DisableIf: function(curMail) { return curMail.Previous_Folder === curMail.Folder; },
        Click: function(curMail) {
            this.switchAndRemoveNode(curMail);
            wat.app.mailHandler.moveMail(curMail, curMail.Previous_Folder);
        }
    },
    {
        ID: "trashEmptyBtn",
        Caption: "Empty Trash",
        Classes: goog.array.concat(wat.mail.MailboxFolder.Buttons.DefaultClasses, "pull-right"),
        DisableIf: function(curMail) { return 0 == this.mails_.getCount(); },
        Click: function(curMail) { this.showEmptyTrashModal_(); }
    }
];
/**
 * @override
 * @returns {Array}
 */
wat.mail.Trash.prototype.getButtonSet = function() { return this.ButtonSet; };

/**
 * Special case for the Trash folder, since deletion in this case means:
 *   Set the \\Deleted flag (client- and server-side) and hide the mail.
 * @override
 */
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
    // 4) Check, whether searchbar needs to be disabled
    if (0 == self.mails_.getCount()) { self.searchbar_.setEnabled(false); }
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
    goog.base(this);
    this.Name = wat.mail.MailboxFolder.SPAM;
    this.DisplayName = this.Name;
    this.NavDomID = "Spam_Btn";
    this.IsLocal = true;
    // Spam is only a local folder, and its content has been loaded from the Inbox folder
    this.retrieved_ = true;
};
goog.inherits(wat.mail.Spam, wat.mail.MailboxFolder);
wat.mail.Spam.prototype.ButtonSet = [
    wat.mail.MailboxFolder.Buttons.DELETE_BTN
];
/**
 * @override
 * @returns {Array}
 */
wat.mail.Spam.prototype.getButtonSet = function() { return this.ButtonSet; };
/**
 * Special
 * Returns the name of the associated server-side folder.
 * @returns {string}
 */
wat.mail.Spam.prototype.getAssocServerSideFolderName = function() {
    return wat.mail.MailboxFolder.INBOX;
};
/**
 * Special treatment
 * @override
 */
wat.mail.Spam.prototype.synchFolder = function() { /* Nothing to do here */ };
/**
 * Special treatment: Since Spam is only a local folder, don'ts load anything, and rahter just
 * render what has already been loaded.
 * @override
 */
wat.mail.Spam.prototype.loadMails = function() {
    this.renderMailboxContent_();
};
