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
 *
 * @type {goog.structs.AvlTree}
 * @protected
 */
wat.mail.MailboxFolder.prototype.mails_ =
    new goog.structs.AvlTree(wat.mail.MailItem.comparator);
/**
 * Whether the mails for this folder have already been loaded or not
 * @type {boolean}
 * @private
 */
wat.mail.MailboxFolder.prototype.retrieved_ = false;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  Abstract methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailboxFolder.prototype.renderCtrlbar = goog.abstractMethod;

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
 *
 * @param {wat.mail.MailItem[]}mails
 */
wat.mail.MailboxFolder.prototype.addMailsToFolder = function(mails) {
    var self = this;
    goog.array.forEach(mails, function(curMail) { self.mails_.add(curMail); })
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
 * @param {wat.mail.MailItem} curMailItem
 */
wat.mail.MailboxFolder.prototype.switchToNextItem = function(curMailItem) {
    var nextItem = this.getNextItem(curMailItem);
    // 1) Highlight the next item (if there is one)
    if (null != nextItem) nextItem.showContent();
    else {
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
 *
 * @private
 */
wat.mail.MailboxFolder.prototype.renderMailboxContent_ = function() {
    this.mails_.inOrderTraverse(function(curMail) {
        curMail.renderMail();
    });
    if (this.mails_.getCount() > 0) {
        this.mails_.getKthValue(0).showContent();
    }
};


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  INBOX Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Inbox = function() {
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

/**
 *
 */
wat.mail.Inbox.prototype.renderCtrlbar = function() {
    var d_ctrlBarContainer = goog.dom.getElement("ctrlBarContainer"),
        d_newCtrlBar = goog.soy.renderAsElement(wat.soy.mail.inboxCtrlBar, this);
    // 2) Remove the current control bar and add the new one
    goog.dom.removeChildren(d_ctrlBarContainer);
    goog.dom.appendChild(d_ctrlBarContainer, d_newCtrlBar);
};


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   SENT Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Sent = function() {
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



////////////////////////////////////////////////////////////////////////////////////////////////////
///                                  Trash Constructor                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 * @abstract
 */
wat.mail.Trash = function() {
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
