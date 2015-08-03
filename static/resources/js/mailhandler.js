/**
 * Created by mdrobek on 22/06/15.
 */
goog.provide('wat.mail.MailHandler');

goog.require('wat');
goog.require('wat.mail');
goog.require('wat.mail.MailItem');
goog.require('wat.mail.NewMail');
goog.require('goog.events');
goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.json');
goog.require('goog.array');
goog.require('goog.structs.AvlTree');

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Constructor                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.MailHandler = function() {};

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
wat.mail.MailHandler.prototype.mails = [];
wat.mail.MailHandler.prototype.inboxMails_ =
    new goog.structs.AvlTree(wat.mail.MailItem.comparator);
wat.mail.MailHandler.prototype.trashMails_ =
    new goog.structs.AvlTree(wat.mail.MailItem.comparator);
// Todo: introduce draft mails

/**
 * @param {string} mailbox
 * @param {function} localCallback
 * @public
 */
wat.mail.MailHandler.prototype.loadMails = function(mailbox) {
    var self = this,
        request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("mailInformation", "overview");
    // We don't need to add the folder data entry, since it defaults to INBOX
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
        if (request.isSuccess()) {
            var mailsJSON = request.getResponseJson();
            // Populate the Mail overview with all retrieved mails
            goog.array.forEach(mailsJSON, function(curMailJSON) {
                var curMail = new wat.mail.MailItem(curMailJSON);
                if (curMail.Mail.Flags.Deleted) {
                    self.trashMails_.add(curMail);
                    return;
                }
                if (curMail.Mail.Flags.Draft) {
                    // Todo!
                    return;
                }
                // It's neither, so put it into the INBOX
                self.inboxMails_.add(curMail);
            });
            self.renderMailboxContent_(mailbox);
        } else {
            //error
            console.log("something went wrong: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    }, false, self);
    request.send(wat.mail.LOAD_MAILS_URI, 'POST', data.toString());
};

/**
 * This method selects the next mail item in the overview list that is timely before the given item
 * (further away from 'now'). In case the given item is the oldest mail item in the mail box, the
 * method selects the next mail item that is timely after this item (closer to 'now'). If, for
 * whatever reason, the given mail item was the only item in the box, null is returned.
 * @param {wat.mail.MailItem} curMailItem
 */
wat.mail.MailHandler.prototype.getNextItem = function(curMailItem) {
    var self = this,
        curMailbox = self.getMailbox_(curMailItem),
        nextItem = null;
    if (goog.isDefAndNotNull(curMailbox)) {
        // 1) If there's less than or 1 mail in the mailbox, no 'next' item exists
        if (curMailbox.getCount() <= 1) return null;
        // 2) First try to find item that is timely before the given item
        curMailbox.inOrderTraverse(function(curItem) {
            if (curItem !== curMailItem) {
                nextItem = curItem;
                return true;
            }
        }, curMailItem);
        // 2a) If we found the next item, return it
        if (null != nextItem) return nextItem;
        // 3) If not, traverse in the opposite direction to find the item timely after the given one
        curMailbox.reverseOrderTraverse(function(curItem) {
            if (curItem !== curMailItem) {
                nextItem = curItem;
                return true;
            }
        }, curMailItem);
        // 3a) There needs to be a result here, otherwise case 1) or 2) would've been true
        return nextItem;
    }
    return null;
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
///                                   Private Methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 *
 * @param {wat.mail.BaseMail} forMail
 * @private
 */
wat.mail.MailHandler.prototype.getMailbox_ = function(forMail) {
    if (this.inboxMails_.contains(forMail)) return this.inboxMails_;
    if (this.trashMails_.contains(forMail)) return this.trashMails_;
    return null;
};

/**
 *
 * @param {string} forMailbox
 * @private
 */
wat.mail.MailHandler.prototype.renderMailboxContent_ = function(forMailbox) {
    var selectedMailbox;
    switch (forMailbox) {
        case wat.mail.Mailbox.TRASH: {
            selectedMailbox = this.trashMails_;
            break;
        }
        case wat.mail.Mailbox.INBOX:
        default: {
            selectedMailbox = this.inboxMails_;
        }
    }
    selectedMailbox.inOrderTraverse(function(curMail) {
        curMail.renderMail();
    });
    if (selectedMailbox.getCount() > 0) {
        selectedMailbox.getKthValue(0).showContent();
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


