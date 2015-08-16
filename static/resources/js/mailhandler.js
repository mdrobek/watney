/**
 * Created by mdrobek on 22/06/15.
 */
goog.provide('wat.mail.MailHandler');

goog.require('wat.mail');
goog.require('wat.mail.MailboxFolder');
goog.require('wat.mail.MailItem');
goog.require('wat.mail.NewMail');
goog.require('goog.events');
goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.json');
goog.require('goog.array');
goog.require('goog.structs.Map');

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Constructor                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler = function() {
    this.mailboxFolders.set(wat.mail.MailboxFolder.INBOX, new wat.mail.Inbox());
    this.mailboxFolders.set(wat.mail.MailboxFolder.SENT, new wat.mail.Sent());
    this.mailboxFolders.set(wat.mail.MailboxFolder.TRASH, new wat.mail.Trash());
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     GLOBAL VARS                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @type wat.mail.NewMail
 */
wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = null;
wat.mail.LAST_ACTIVE_OVERVIEW_ITEM_ID = "";

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private members                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler.prototype.SelectedMailbox = "";
//wat.mail.MailHandler.prototype.inboxMails_ =
//    new goog.structs.AvlTree(wat.mail.MailItem.comparator);
//wat.mail.MailHandler.prototype.trashMails_ =
//    new goog.structs.AvlTree(wat.mail.MailItem.comparator);
//wat.mail.MailHandler.prototype.sentMails_ =
//    new goog.structs.AvlTree(wat.mail.MailItem.comparator);
//// Todo: introduce draft mails

/**
 * MailboxFolderName -> wat.mail.MailboxFolder
 * @type {goog.structs.Map}
 */
wat.mail.MailHandler.prototype.mailboxFolders = new goog.structs.Map();

/**
 * @param {string} toMailbox The name of the mailbox folder that is being activated.
 * @public
 */
wat.mail.MailHandler.prototype.switchMailboxFolder = function(toMailbox) {
    if (this.SelectedMailbox === toMailbox) return;
    var self = this;
    self.SelectedMailbox = toMailbox;
    if (!self.mailboxFolders.containsKey(toMailbox)) {
        // TODO: Error here for a mailbox that is unknown
        console.log("MailHandler.switchMailboxFolder : NOT YET IMPLEMENTED");
    } else {
        // 1) Deactivate current mailbox
        self.mailboxFolders.get(self.SelectedMailbox).deactivate();
        // 2) Activate new mailbox
        self.mailboxFolders.get(toMailbox).activate();
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
    var curMailboxFolder = this.mailboxFolders.get(mail.Folder),
        newMailboxFolder = this.mailboxFolders.get(intoFolder);
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
 * @param {string} origText
 */
wat.mail.MailHandler.prototype.createReply = function(from, to, subject, origText) {
    var newMail = new wat.mail.NewMail(from, to, "Re: "+subject, "\n\n\n\n"+origText);
    wat.mail.MailHandler.hideActiveNewMail(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM);
    newMail.addNewMail();
    wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = newMail;
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


