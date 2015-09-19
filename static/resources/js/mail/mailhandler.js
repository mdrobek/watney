/**
 * Created by mdrobek on 22/06/15.
 */
goog.provide('wat.mail.MailHandler');

goog.require('wat.mail');
goog.require('wat.mail.MailboxFolder');
goog.require('wat.mail.MailItem');
goog.require('wat.mail.NewMail');
goog.require('goog.Timer');
goog.require('goog.events');
goog.require('goog.json');
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

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Constructor                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler = function() {
    // 1) Create all mailboxes
    this.mailboxFolders_.set(wat.mail.MailboxFolder.INBOX, new wat.mail.Inbox());
    this.mailboxFolders_.set(wat.mail.MailboxFolder.SENT, new wat.mail.Sent());
    this.mailboxFolders_.set(wat.mail.MailboxFolder.TRASH, new wat.mail.Trash());
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private members                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler.prototype.SelectedMailbox = "";

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
 * @param {string} toMailbox The name of the mailbox folder that is being activated.
 * @public
 */
wat.mail.MailHandler.prototype.switchMailboxFolder = function(toMailbox) {
    if (this.SelectedMailbox === toMailbox) return;
    var self = this;
    self.SelectedMailbox = toMailbox;
    if (!self.mailboxFolders_.containsKey(toMailbox)) {
        // TODO: Error here for a mailbox that is unknown
        console.log("MailHandler.switchMailboxFolder : NOT YET IMPLEMENTED");
    } else {
        // 1) Deactivate current mailbox
        self.mailboxFolders_.get(self.SelectedMailbox).deactivate();
        // 2) Activate new mailbox
        self.mailboxFolders_.get(toMailbox).activate();
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
        //self.pollTimer_ = new goog.Timer(wat.mail.MailHandler.UPDATE_TIME);
        //self.pollTimer_.start();
        //goog.events.listenOnce(self.pollTimer_, goog.Timer.TICK, function() {
        //    console.log("### Starting poll for new mails");
        //    self.pollTimer_.stop();
        //    inbox.checkForNewMails(self.registerUpdateEvents);
        //});
        goog.Timer.callOnce(function() {
            //console.log("### Starting poll for new mails");
            inbox.synchFolder(self.registerUpdateEvents);
            //inbox.checkForNewMails();
        }, wat.mail.UPDATE_TIME, self);
    }
};

/**
 * Moves a mail from its current mailbox folder into the given new one and additionally updates
 * the folder information in the given mail item.
 * @param {wat.mail.MailItem} mail
 * @param {string} intoFolder The new mailbox folder as one of wat.mail.MailboxFolder
 */
wat.mail.MailHandler.prototype.moveMail = function(mail, intoFolder) {
    // TODO: folders might be null -> react accordingly
    var curMailboxFolder = this.mailboxFolders_.get(mail.Folder),
        newMailboxFolder = this.mailboxFolders_.get(intoFolder);
    // 1) Remove the mail from the current folder
    curMailboxFolder.remove(mail);
    // 2) Add the mail to the new folder
    newMailboxFolder.add(mail);
    // 3) Update the mail folder information
    mail.Previous_Folder = mail.Folder;
    mail.Folder = intoFolder;
};

/**
 *
 * @param {string} from
 * @param {string} to TODO: To be string[]
 * @param {string} subject
 * @param {goog.structs.Map} Content-Type -> wat.mail.ContentPart
 */
wat.mail.MailHandler.prototype.createReply = function(from, to, subject, content) {
    var newMail = new wat.mail.NewMail(from, to, "Re: "+subject, content);
    wat.mail.MailHandler.hideActiveNewMail(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM);
    newMail.renderNewMail();
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
 * @param {boolean} [opt_enable] True - Unread/New mails are available/have arrived
 *                               False - Mails have been read (are not unseen/recent anymore)
 */
wat.mail.MailHandler.prototype.notifyAboutMails = function(quantity, opt_enable) {
    var self = this;
    if (goog.isDefAndNotNull(opt_enable) && opt_enable) {
        self.unreadMails_ += quantity;
    } else {
        self.unreadMails_ -= quantity;
    }
    // 1) update window title
    self.updateTitle();
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private Methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler.prototype.updateTitle = function() {
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


