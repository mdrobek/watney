/**
 * Created by mdrobek on 22/09/15.
 */
goog.provide('wat.testing');
goog.setTestOnly('wat.testing');
goog.provide('wat.testing.MailJson');
goog.setTestOnly('wat.testing.MailJson');
goog.provide('wat.testing.ContentJson');
goog.setTestOnly('wat.testing.ContentJson');

goog.require('goog.object');
goog.require('goog.date.DateTime');
goog.require('wat.mail.MailFlags');
goog.require('wat.mail.MailboxFolder');

wat.testing = {};

/**
 * UID counter for newly created JSON mail objects.
 * @type {number}
 * @private
 */
wat.testing.mailUIDCounter_ = 1;

/**
 * Creates a new JSON mail response object, which is flagged as <b>UNSEEN</b> and <b>RECENT</b>.
 * @param {wat.mail.MailFlags} [opt_flags] Optional flags that should be set in the created JSON
 *                                         object. Hint: Use one of wat.mail.MailFlags.*
 * @param {goog.date.DateTime} [opt_date] Optional time stamp of this mail
 * @return {wat.testing.MailJson} JSON representation of wat.mail.MailItem
 * @static
 */
wat.testing.createInboxMail = function(opt_flags, opt_date) {
    var flags = goog.isDefAndNotNull(opt_flags) ? opt_flags : wat.mail.MailFlags.RECENT;
    return wat.testing.createJSONMail(wat.mail.MailboxFolder.INBOX, 0, flags, opt_date);
};

/**
 * Creates a new JSON mail response object that is marked as SPAM and flagged as <b>UNSEEN</b> and
 * <b>RECENT</b>.
 * @param {wat.mail.MailFlags} [opt_flags] Optional flags that should be set in the created JSON
 *                                         object. Hint: Use one of wat.mail.MailFlags.*
 * @param {goog.date.DateTime} [opt_date] Optional time stamp of this mail
 * @return {wat.testing.MailJson} JSON representation of wat.mail.MailItem
 * @static
 */
wat.testing.createSpamMail = function(opt_flags, opt_date) {
    var flags = goog.isDefAndNotNull(opt_flags) ? opt_flags : wat.mail.MailFlags.RECENT;
    return wat.testing.createJSONMail(wat.mail.MailboxFolder.SPAM, 4, flags, opt_date);
};

/**
 * Creates a new JSON mail response object that is associated with the <b>TRASH</b> folder and
 * flagged as <b>SEEN</b> and <b>NOT RECENT</b>.
 * @param {wat.mail.MailFlags} [opt_flags] Optional flags that should be set in the created JSON
 *                                         object. Hint: Use one of wat.mail.MailFlags.*
 * @param {goog.date.DateTime} [opt_date] Optional time stamp of this mail
 * @return {wat.testing.MailJson} JSON representation of wat.mail.MailItem
 * @static
 */
wat.testing.createTrashMail = function(opt_flags, opt_date) {
    var flags = goog.isDefAndNotNull(opt_flags) ? opt_flags : wat.mail.MailFlags.SEEN;
    return wat.testing.createJSONMail(wat.mail.MailboxFolder.TRASH, 0, flags, opt_date);
};

/**
 * Creates a new JSON mail response object.
 * @param {string} folder The folder this JSON mail is associated with (one of
 *                        wat.mail.MailboxFolder.*)
 * @param {number} spamIndicator =0 => Marked as NO SPAM
 *                               >0 => Marked as SPAM
 * @param {wat.mail.MailFlags} [opt_flags] Optional flags that should be set in the created JSON
 *                                         object. Hint: Use one of wat.mail.MailFlags.*
 * @param {goog.date.DateTime} [opt_date] Optional time stamp of this mail
 * @return {wat.testing.MailJson} JSON representation of wat.mail.MailItem
 * @static
 */
wat.testing.createJSONMail = function(folder, spamIndicator, opt_flags, opt_date) {
    var jsonMail = goog.object.unsafeClone(wat.testing.MailJson);
    jsonMail.UID = wat.testing.mailUIDCounter_++;
    jsonMail.Header.SpamIndicator = spamIndicator;
    if (spamIndicator > 0) {
        jsonMail.Header.Folder = wat.mail.MailboxFolder.SPAM;
    }
    if (goog.isDefAndNotNull(opt_flags)) {
        jsonMail.Flags = opt_flags;
    }
    if (goog.isDefAndNotNull(opt_date)) {
        jsonMail.Header.Date = opt_date.toUTCIsoString();
    } else {
        jsonMail.Header.Date = new goog.date.DateTime().toUTCIsoString();
    }
    return jsonMail;
};

/**
 * This is a SPAM mail.
 * JSON representation of wat.mail.MailItem
 * @type {wat.testing.MailJson}
 */
wat.testing.MailJson = {
    UID: 1,
    Header: {
        Date: "2015-09-18T11:49:06-07:00",
        Folder: "/",
        Size: 1234,
        MimeHeader: {
            MimeVersion: 1,
            ContentType: "text/plain",
            Encoding: "quoted-printable",
            MultipartBoundary: ""
        },
        Sender: "foo@bar.de",
        Receiver: "mark@watney.de",
        SpamIndicator: 6,
        Subject: "TestMail"
    },
    Flags: {
        Seen : false,
        Deleted : false,
        Answered : true,
        Flagged : false,
        Draft : false,
        Recent : true
    },
    Content: null
};

wat.testing.ContentJson = {
    "text/plain": {
        Charset : "UTF-8",
        Encoding : "quoted-printable",
        Body : "some plain text"
    },
    "text/html": {
        Charset : "UTF-8",
        Encoding : "quoted-printable",
        Body : "<div>Same text as html</div>"
    }
};
