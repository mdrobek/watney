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


/**
 * @fileOverview This file reflects the JS model of the right mail page, which shows the mail
 * details (subject, sender, content, ...). It renders this part of the page for a given mailitem.
 */

wat.mail.MailDetails = function() {};

wat.mail.MailDetails.prototype.FROM_DOMID_ = "mailDetails_From";
wat.mail.MailDetails.prototype.SUBJECT_DOMID_ = "mailDetails_Subject";
wat.mail.MailDetails.prototype.TO_DOMID_ = "mailDetails_To";
wat.mail.MailDetails.prototype.CONTENT_DOMID_ = "mailDetails_Content";

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                 PUBLIC METHODS                                               ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 *
 * @param {wat.mail.MailItem} withMailItem
 * @public
 */
wat.mail.MailDetails.prototype.render = function(withMailItem) {
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

    if (withMailItem.Mail.Content.containsKey("text/html")) {
        contentNode = self.createHtmlFragment_(mail.getContent("text/html"));
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
 * @param {string} content
 * @return {Element}
 * @private
 */
wat.mail.MailDetails.prototype.createHtmlFragment_ = function(content) {
    //var htmlContent = goog.dom.htmlToDocumentFragment(goog.string.newLineToBr(
    //        goog.string.canonicalizeNewlines(content)));
    var htmlContent = goog.dom.htmlToDocumentFragment(content);
    return htmlContent;
    //goog.dom.appendChild(d_mailDetailsContent, goog.dom.createTextNode(plainContent));
};
