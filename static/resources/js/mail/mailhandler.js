/**
 * Created by mdrobek on 22/06/15.
 */
goog.provide('wat.mail.MailHandler');

goog.require('wat.mail');
goog.require('wat.mail.MailboxFolder');
goog.require('wat.mail.MailItem');
goog.require('wat.mail.NewMail');
goog.require('wat.soy.mail');

goog.require('goog.Timer');
goog.require('goog.events');
goog.require('goog.json');
goog.require('goog.soy');
goog.require('goog.array');
goog.require('goog.structs.Map');

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                 GLOBAL STATIC VARS                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @type wat.mail.NewMail
 * @static
 */
wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = null;
/**
 * @type {string}
 * @static
 */
wat.mail.KeyShortcuts = {
    DELETE_MAIL : "DELETE_MAIL",
    UP : "NAVIGATE_UP",
    DOWN : "NAVIGATE_DOWN"
};
// Time until a new update poll to the backend is started
wat.mail.UPDATE_TIME = 5000;

/**
 *
 * @param enable
 * @param intoDOMID
 * @param spinnerDOMID
 * @param {Number} opt_YOffset Y offset in pixel
 */
wat.mail.enableSpinner = function(enable, intoDOMID, spinnerDOMID, opt_YOffset) {
    var d_targetElem = goog.dom.getElement(intoDOMID),
        d_spinnerElem;
    if (enable) {
        d_spinnerElem = goog.soy.renderAsElement(wat.soy.mail.colorBarLoading, {
            LoadID: spinnerDOMID
        });
        if (goog.isDefAndNotNull(opt_YOffset)) {
            goog.style.setStyle(d_spinnerElem, "top", opt_YOffset+"px");
        }
        goog.dom.appendChild(d_targetElem, d_spinnerElem);
    } else {
        // 2) We want to remove the spinner from the target element
        // 2a) Find the spinner element
        d_spinnerElem = goog.dom.findNode(d_targetElem, function(curNode) {
            // Check if the Node is an Element with the spinner ID
            return curNode.nodeType === 1 && curNode.id === spinnerDOMID;
        });
        goog.dom.removeNode(d_spinnerElem);
    }
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Constructor                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler = function() {
    // 1) Create all mailboxes
    this.mailboxFolders_.set(wat.mail.MailboxFolder.INBOX, new wat.mail.Inbox());
    this.mailboxFolders_.set(wat.mail.MailboxFolder.SENT, new wat.mail.Sent());
    this.mailboxFolders_.set(wat.mail.MailboxFolder.TRASH, new wat.mail.Trash());
    this.mailboxFolders_.set(wat.mail.MailboxFolder.SPAM, new wat.mail.Spam());
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Public members                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * The currently selected mailbox folder as shown in the UI.
 * @type {string}
 */
wat.mail.MailHandler.prototype.SelectedMailbox = "";
/**
 * The DOM ID of the "New Email" button in the action button menu (which is located in the left
 * navigation bar).
 * @type {string}
 */
wat.mail.MailHandler.prototype.NewEmailBtnDomID = "newMailBtn";

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private members                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * {string} MailboxFolderName -> wat.mail.MailboxFolder
 * @type {goog.structs.Map}
 */
wat.mail.MailHandler.prototype.mailboxFolders_ = new goog.structs.Map();

/**
 * The Timer used to initiate a new poll to the backend to check for new arrived mails
 * @type {goog.Timer}
 */
wat.mail.MailHandler.prototype.pollTimer_;

/**
 * Number of mails that the user should be notified about.
 * @type {int}
 */
wat.mail.MailHandler.prototype.unreadMails_ = 0;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Public methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * This method adds the navigation menu buttons for each mailbox folder initiated in this
 * mailhandler object. Additionally, all associated events (click) are added to the navigation
 * buttons.
 * @public
 */
wat.mail.MailHandler.prototype.addNavigationButtons = function() {
    // The folders have to be added in a certain order, which is why we can't use the Map iterator
    // here (it might switch the iteration order)
    var self = this;
    self.mailboxFolders_.get(wat.mail.MailboxFolder.INBOX).renderNavigation(true);
    self.mailboxFolders_.get(wat.mail.MailboxFolder.SENT).renderNavigation();
    self.mailboxFolders_.get(wat.mail.MailboxFolder.SPAM).renderNavigation();
    self.mailboxFolders_.get(wat.mail.MailboxFolder.TRASH).renderNavigation();
};

/**
 * Switches to the given folder name in the main mailbox.
 * @param {string} mailboxFolder The name of the mailbox folder that is being activated.
 * @throws In case an invalid mailbox string has been passed, a string with an error message.
 * @public
 */
wat.mail.MailHandler.prototype.switchMailboxFolder = function(mailboxFolder) {
    if (this.SelectedMailbox === mailboxFolder) return;
    var self = this;
    if (!self.mailboxFolders_.containsKey(mailboxFolder)) {
        throw "Invalid mailbox exception";
    } else {
        // 1) Deactivate current mailbox (if one is activated)
        if ("" !== self.SelectedMailbox) {
            self.mailboxFolders_.get(self.SelectedMailbox).deactivate();
        }
        // 2) Activate new mailbox
        self.mailboxFolders_.get(mailboxFolder).activate();
        self.SelectedMailbox = mailboxFolder;
    }
};

/**
 * This method registers a timer to continuously poll the backend for new messages.
 * @param {boolean} [opt_enable] True|undefined - Registers all update events to check for new
 *          mails.
 *          False - Unregisters all update events.
 */
wat.mail.MailHandler.prototype.registerUpdateEvents = function(opt_enable) {
    var self = this,
        inbox = self.mailboxFolders_.get(wat.mail.MailboxFolder.INBOX);
    if (!goog.isDefAndNotNull(opt_enable) || opt_enable) {
        goog.Timer.callOnce(function() {
            //console.log("### Starting poll for new mails");
            inbox.synchFolder(self.registerUpdateEvents);
            //inbox.checkForNewMails();
        }, wat.mail.UPDATE_TIME, self);
    }
};

/**
 * Registers all event listeners to the action bar menu in the left navigation bar. This currently
 * includes the following actions:
 * <ul>
 *     <li>Click event for the "New Email" button.</li>
 * </ul>
 * @param mails
 */
wat.mail.MailHandler.prototype.registerActionBarEvents = function() {
    var self = this,
        d_newMailBtn = goog.dom.getElement(self.NewEmailBtnDomID);
    goog.events.listen(d_newMailBtn, goog.events.EventType.CLICK, function() {
        wat.app.mailHandler.createNewMail(wat.app.userMail, "", "", "", false);
    }, false);
};

/**
 * Moves the given mail in the given 'intoFolder' on the client- and potentially server-side.
 * However, if the given 'intoFolder' is a client-side only mailbox folder, the moving will only
 * happen on the client-side, no matter if the given 'opt_alsoOnServer' flag is provided or not. In
 * any other cases, the server-side operation is performed, if the 'opt_alsoOnServer' flag is true
 * or omitted.
 * Additionally, the folder information in the given JS mail item will be updated.</br>
 * @param {wat.mail.MailItem} mail The MailItem that is to be moved from its current folder in the
 * new given folder.
 * @param {string} intoFolder The new mailbox folder (as one of wat.mail.MailboxFolder)
 * @param {boolean|Undefined} [opt_alsoOnServer]
 *  True|Undefined - The request is also performed on the server side (if the given intoFolder is
 *                   not a client-side only mailbox folder).
 *  False - The request is only performed on the client-side (no matter if the given folder also
 *          exists on the server-side).
 */
wat.mail.MailHandler.prototype.moveMail = function(mail, intoFolder, opt_alsoOnServer) {
    // a) Simple case, if the folders are equal => return
    if (mail.Folder === intoFolder) return;
    var self = this,
        alsoOnServer = !goog.isDefAndNotNull(opt_alsoOnServer) || opt_alsoOnServer,
        curMailboxFolder = self.mailboxFolders_.get(mail.Folder),
        newMailboxFolder = self.mailboxFolders_.get(intoFolder),
        originalPrevious_Folder = mail.Previous_Folder;
    // I) Perform all client-side actions
    // 1) Remove the mail from the current folder
    curMailboxFolder.remove(mail);
    // 2) Add the mail to the new folder
    newMailboxFolder.add(mail);
    // 3) Update the mail folder information
    mail.Previous_Folder = mail.Folder;
    mail.Folder = intoFolder;
    newMailboxFolder.showMail()
    // II) Perform server-side request only if:
    //  * opt_alsoOnServer = undefined|null
    //  * opt_alsoOnServer = true
    if (alsoOnServer) {
        // 1) If the target folder is local => get the associated server-side folder
        var serverSideTargetFolder = newMailboxFolder.IsLocal
                ? newMailboxFolder.getAssocServerSideFolderName()
                : intoFolder;
        mail.moveMailOnServer(serverSideTargetFolder,
            // success
            function (newUID) {
                // Request successful: The mail has a new UID now
                mail.Mail.UID = newUID;
            },
            // fail
            function (mailItem, req) {
                // Request to move mail on the server-side failed => revert client-side mail move
                wat.app.mailHandler.moveMail(mailItem, mailItem.Previous_Folder, false);
                mailItem.Previous_Folder = originalPrevious_Folder;
            });
    }
};

/**
 *
 * @param {string} from
 * @param {string} to TODO: To be string[]
 * @param {string} subject
 * @param {goog.structs.Map} Content-Type -> wat.mail.ContentPart
 */
wat.mail.MailHandler.prototype.createNewMail = function(from, to, subject, content, asReply) {
    var actSubject = asReply ? "Re: "+subject : subject,
        newMail = new wat.mail.NewMail(from, to, actSubject, content);
    wat.mail.MailHandler.hideActiveNewMail(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM);
    newMail.renderNewMail(asReply);
    wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = newMail;
};

/**
 * @public
 */
wat.mail.MailHandler.prototype.deleteActiveMail = function() {
    var curMailbox = this.mailboxFolders_.get(this.SelectedMailbox);
    if (goog.isDefAndNotNull(curMailbox)) {
        curMailbox.deleteActiveMail();
    }
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
wat.mail.MailHandler.prototype.switchToSibling = function(opt_before) {
    var curMailbox = this.mailboxFolders_.get(this.SelectedMailbox);
    if (goog.isDefAndNotNull(curMailbox)) {
        curMailbox.switchActiveMail(opt_before);
    }
};

/**
 * This method performs all tasks necessary to notify the user about the arrival of new mails.
 * @param {int} quantity How many mails are either unread/recent or seen
 * @param {string} folder The mailbox folder for which the mail update occurred (one of
 *                        wat.mail.MailboxFolder.*)
 * @param {boolean} [opt_seen] True - Mails have been read (are not unseen/recent anymore)
 *                             False|Omitted - Unread/New mails are available/have arrived
 */
wat.mail.MailHandler.prototype.notifyAboutMails = function(quantity, folder, opt_seen) {
    var self = this;
    if (goog.isDefAndNotNull(opt_seen) && opt_seen) {
        self.unreadMails_ -= quantity;
    } else {
        self.unreadMails_ += quantity;
    }
    // 1) Update window title
    self.updateTitle_();
};

/**
 * Updates the navigation bar element associated with the given folder.
 * @param {string} folder The name of the folder, whose nav bar button should be updated;
 */
wat.mail.MailHandler.prototype.updateNavigationBarButton = function(folder) {
    this.mailboxFolders_.get(folder).updateNavigationBar();
};

/**
 * Adds the given array of mails to the SPAM folder and updates the mails folder member,
 * respectively.
 * @param {[wat.mail.MailItem]} mails All mails that are marked as SPAM.
 */
wat.mail.MailHandler.prototype.addMailsToSpamFolder = function(mails) {
    var self = this,
        spamMailbox = self.mailboxFolders_.get(wat.mail.MailboxFolder.SPAM),
        unreadSpamMails;
    // 1) Change folder name these mails are residing in
    goog.array.forEach(mails, function(curSpamMail) {
        curSpamMail.Folder = wat.mail.MailboxFolder.SPAM;
    });
    // 2) Add mails to the Spam mailbox folder
    spamMailbox.addMailsToFolder(mails);
    unreadSpamMails = spamMailbox.getUnreadMails();
    if (unreadSpamMails.length > 0 ) {
        self.notifyAboutMails(unreadSpamMails.length, wat.mail.MailboxFolder.SPAM);
    }
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private Methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Changes the document title to indicate new mails have arrived/mails have been read.
 * @private
 */
wat.mail.MailHandler.prototype.updateTitle_ = function() {
    var self = this;
    if (self.unreadMails_ <= 0){
        document.title = "Watney";
        self.unreadMails_ = 0;
    } else {
        document.title = "Watney (" + self.unreadMails_ + ")";
    }
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


