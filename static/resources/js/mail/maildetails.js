/**
 *
 * Created by mdrobek on 13/10/15.
 */
goog.provide('wat.mail.MailDetails');

goog.require('wat.mail');
goog.require('wat.mail.MailItem');
goog.require('wat.mail.MailHeader');
goog.require('goog.dom');
goog.require('goog.string');
goog.require('goog.style');
goog.require('goog.ui.Zippy');
goog.require('goog.Timer');

/**
 * @fileOverview This file reflects the JS model of the right mail page, which shows the mail
 * details (subject, sender, content, ...). It renders this part of the page for a given mailitem.
 */

wat.mail.MailDetails = function() {};

wat.mail.MailDetails.prototype.FROM_DOMID_ = "mailDetails_From";
wat.mail.MailDetails.prototype.SUBJECT_DOMID_ = "mailDetails_Subject";
wat.mail.MailDetails.prototype.TO_DOMID_ = "mailDetails_To";
wat.mail.MailDetails.prototype.CONTENT_DOMID_ = "mailDetails_Content";

wat.mail.MailDetails.prototype.IMG_LOADING_NOTIFICATION_DOMID_ = "imgWarning_Content";
wat.mail.MailDetails.prototype.IMG_LOAD_BTN_DOMID_ = "imgWarning_Load_Btn";
wat.mail.MailDetails.prototype.IMG_CANCEL_BTN_DOMID_ = "imgWarning_Cancel_Btn";
/**
 * Image warning notification for the user, to decide, whether to allow loading of external
 * mail pictures or not.
 * @type {goog.ui.Zippy}
 * @private
 */
wat.mail.MailDetails.prototype.imgWarning_;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                 PUBLIC METHODS                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 *
 * @param {wat.mail.MailItem} withMailItem
 * @param {boolean} [opt_withImg] True - Images will be included
 *                                False|Undefined - Image links will be replaced with empty pics
 * @public
 */
wat.mail.MailDetails.prototype.render = function(withMailItem, opt_withImg) {
    var self = this,
        mail = withMailItem.Mail,
        d_mailDetailsFrom = goog.dom.getElement(self.FROM_DOMID_),
        d_mailDetailsSubject = goog.dom.getElement(self.SUBJECT_DOMID_),
        d_mailDetailsTo = goog.dom.getElement(self.TO_DOMID_),
        d_mailDetailsContent = goog.dom.getElement(self.CONTENT_DOMID_),
        contentNode = null;
    goog.dom.setTextContent(d_mailDetailsFrom, mail.Header.Sender);
    goog.dom.setTextContent(d_mailDetailsSubject, mail.Header.Subject);
    goog.dom.setTextContent(d_mailDetailsTo, mail.Header.Receiver);

    if (mail.Content.containsKey("text/html")) {
        contentNode = self.createHtmlFragment_(withMailItem, opt_withImg);
        // we have to make the parent node scrollable in this case
        goog.style.setStyle(d_mailDetailsContent, "overflow-y", "scroll");
    } else {
        // this handles all remaining cases as text/plain
        // the textarea will take care of the scrolling
        contentNode = self.createPlainTextFragment_(mail.getContent("text/plain"));
        goog.style.setStyle(d_mailDetailsContent, "overflow-y", "hidden");
    }
    goog.dom.removeChildren(d_mailDetailsContent);
    goog.dom.appendChild(d_mailDetailsContent, contentNode);
};

/**
 *
 * @public
 */
wat.mail.MailDetails.prototype.clean = function() {
    var self = this,
        d_mailDetailsFrom = goog.dom.getElement(self.FROM_DOMID_),
        d_mailDetailsSubject = goog.dom.getElement(self.SUBJECT_DOMID_),
        d_mailDetailsTo = goog.dom.getElement(self.TO_DOMID_),
        d_loadMsgContent = goog.dom.getElement(self.IMG_LOADING_NOTIFICATION_DOMID_),
        d_mailDetailsContent = goog.dom.getElement(self.CONTENT_DOMID_);
    goog.dom.setTextContent(d_mailDetailsFrom, "");
    goog.dom.setTextContent(d_mailDetailsSubject, "");
    goog.dom.setTextContent(d_mailDetailsTo, "");
    goog.dom.removeChildren(d_loadMsgContent);
    goog.dom.removeChildren(d_mailDetailsContent);
    if (goog.isDefAndNotNull(self.imgWarning_)) {
        self.imgWarning_.dispose();
        self.imgWarning_ = null;
    }
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                PRIVATE METHODS                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Method that creates the HTML fragment for a given email content that is of content-type
 * "text/plain".
 * @param {string} content
 * @return {Element}
 * @private
 */
wat.mail.MailDetails.prototype.createPlainTextFragment_ = function(content) {
    var plainContent = goog.dom.createDom("textarea", {readOnly:true}, content);
    return plainContent;
};

/**
 * Method that creates the HTML fragment for a given email content that is of content-type
 * "text/html".
 * @param {wat.mail.MailItem} mailItem
 * @param {boolean} [opt_withImg] True - Images will be included
 *                                False|Undefined - Image links will be replaced with empty pics
 * @return {Element}
 * @private
 */
wat.mail.MailDetails.prototype.createHtmlFragment_ = function(mailItem, opt_withImg) {
    var self = this,
        mail = mailItem.Mail,
        d_htmlContent = goog.dom.htmlToDocumentFragment(mail.getContent("text/html")),
        // Find style elements in mail content
        d_styleNodes = goog.dom.findNodes(d_htmlContent, function(curNode) {
            return curNode.nodeName === "STYLE" || curNode.type === 'text/css';
        });
    // 1) Remove style nodes from mail since they can destroy the look & feel
    goog.array.forEach(d_styleNodes, function(curNode) { goog.dom.removeNode(curNode); });
    // 2) Replace all img 'src' tags to avoid default loading
    if (!goog.isDefAndNotNull(opt_withImg) || (goog.isDefAndNotNull(opt_withImg) && !opt_withImg)) {
        // 2a) Find and replace src attribute of img tags
        self.filterImages_(d_htmlContent);
        // 2b) Add notification for user
        self.addAndShowImgWarning_(mailItem);
    }
    return d_htmlContent;
};

/**
 *
 * @param d_htmlContent
 * @private
 */
wat.mail.MailDetails.prototype.filterImages_ = function(d_htmlContent) {
    var d_imgNodes = goog.dom.getElementsByTagNameAndClass("img", "", d_htmlContent);
    goog.array.forEach(d_imgNodes, function(curImg) {
        curImg.src = "";
    });
};

/**
 * Adds the notification message at the top of the mail content section to notify the user about
 * potential harmful images.
 * @param {wat.mail.MailItem} curMail
 * @private
 */
wat.mail.MailDetails.prototype.addAndShowImgWarning_ = function(curMail) {
    var self = this,
        d_imgNotification = goog.dom.getElement(self.IMG_LOADING_NOTIFICATION_DOMID_),
        d_zippyMsg = goog.soy.renderAsElement(wat.soy.mail.loadMailImg, {
            BtnLoadID: self.IMG_LOAD_BTN_DOMID_,
            BtnCancelID: self.IMG_CANCEL_BTN_DOMID_
        });
    self.imgWarning_ = new goog.ui.Zippy("", d_imgNotification, true);
    goog.dom.appendChild(d_imgNotification, d_zippyMsg);
    goog.events.listen(goog.dom.getElement(self.IMG_LOAD_BTN_DOMID_), goog.events.EventType.CLICK,
        function () {
            // 1) Remember decision for next loading
            curMail.Mail.LoadContentImages = true;
            // 2) Clean details view and re-render mail now with loaded images
            self.clean.call(self);
            self.render.call(self, curMail, true);
        }, false);
    goog.events.listen(goog.dom.getElement(self.IMG_CANCEL_BTN_DOMID_), goog.events.EventType.CLICK,
        function () {
            self.imgWarning_.toggle();
        }, false);
};