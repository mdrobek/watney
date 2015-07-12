/**
 *
 * Created by lion on 30/06/15.
 */
goog.provide('wat.mail');
goog.provide('wat.mail.MailItem');

goog.require('wat');
goog.require('wat.soy.mail');
goog.require('goog.events');
goog.require('goog.dom');
goog.require('goog.date');
goog.require('goog.i18n.DateTimeFormat');
goog.require('goog.soy');

wat.mail.LOAD_MAILCONTENT_URI_ = "/mailContent";

/**
 *
 * @param jsonData
 * @constructor
 */
////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Public methods                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////

wat.mail.MailItem = function(jsonData) {
    var self = this;
    self.UID = jsonData.UID;
    self.DomID = "mailItem_" + self.UID;
    self.Date = goog.date.fromIsoString(jsonData.Header.Date);
    self.DateString = (new goog.i18n.DateTimeFormat("dd/mm/yyyy")).format(self.Date);
    self.TimeString = (new goog.i18n.DateTimeFormat("HH:MM")).format(self.Date);
    self.Folder = jsonData.Header.Folder;
    self.Receiver = jsonData.Header.Receiver;
    self.From = jsonData.Header.Sender;
    self.ShortFrom = self.shrinkField_(self.From, 45, true);
    self.Size = jsonData.Header.Size;
    self.Subject = jsonData.Header.Subject;
    self.ShortSubject = self.shrinkField_(self.Subject, 33, true);
    // Is the given date of the mail today?
    self.IsFromToday = goog.date.isSameDay(self.Date);
    self.Seen = jsonData.Flags.Seen;
    self.Answered = jsonData.Flags.Answered;
    self.Deleted = jsonData.Flags.Deleted;
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                 Member declaration                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////

// Number - universal ID of this mail as retrieved from the server
wat.mail.MailItem.prototype.UID = null;
wat.mail.MailItem.prototype.DomID = null;

// goog.date.Date
wat.mail.MailItem.prototype.Date = null;
wat.mail.MailItem.prototype.DateString = null;
wat.mail.MailItem.prototype.TimeString = null;

wat.mail.MailItem.prototype.Folder = null;
wat.mail.MailItem.prototype.Receiver = null;
wat.mail.MailItem.prototype.From = null;
wat.mail.MailItem.prototype.ShortFrom = null;
wat.mail.MailItem.prototype.Size = null;
wat.mail.MailItem.prototype.ShortSubject = null;
wat.mail.MailItem.prototype.Subject = null;
wat.mail.MailItem.prototype.Content = null;
wat.mail.MailItem.prototype.HasContentBeenLoaded = false;

wat.mail.MailItem.prototype.IsFromToday = false;
wat.mail.MailItem.prototype.Seen = false;
wat.mail.MailItem.prototype.Answered = false;
wat.mail.MailItem.prototype.Deleted = false;

/**
 *
 */
wat.mail.MailItem.prototype.renderMail = function() {
    var self = this,
        mailTableElem = goog.dom.getElement("mailItems"),
        d_mailItem = goog.soy.renderAsElement(wat.soy.mail.mailOverview, this);
    goog.events.listen(d_mailItem, goog.events.EventType.CLICK, self.showContent, false, self);
    goog.dom.append(mailTableElem, d_mailItem);
};

wat.mail.MailItem.prototype.showContent = function() {
    var self = this;
    if (!self.HasContentBeenLoaded) {
        console.log("Content is not available! Starting to fetch content for UID: " + self.UID);
        self.loadContent_(self.showContent);
    } else {
        var d_mailDetailsFrom = goog.dom.getElement("mailDetails_From"),
            d_mailDetailsSubject = goog.dom.getElement("mailDetails_Subject"),
            d_mailDetailsTo = goog.dom.getElement("mailDetails_To"),
            d_mailDetailsContent = goog.dom.getElement("mailDetails_Content");
        goog.dom.setTextContent(d_mailDetailsFrom, self.From);
        goog.dom.setTextContent(d_mailDetailsSubject, self.Subject);
        goog.dom.setTextContent(d_mailDetailsTo, self.Receiver);
        goog.dom.setTextContent(d_mailDetailsContent, self.Content);
    }
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Private methods                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * @param {function} localCallback
 * @private
 */
wat.mail.MailItem.prototype.loadContent_ = function(localCallback) {
    var self = this,
        request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData();
    data.add("uid", self.UID);
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
        //memoriesJSON;
        if (request.isSuccess()) {
            self.Content = request.getResponseJson();
            self.HasContentBeenLoaded = true;
            //console.log("Mail Content request was successful: " + self.Content);
            // Populate the Mail overview with all retrieved mails
            //var mails = goog.array.map(mailsJSON, function(curMailJSON) {
            //    var curMail = new wat.mail.Mail(curMailJSON);
            //    curMail.renderMail();
            //    return curMail;
            //});
            if (null != localCallback) { self.showContent(); }
        } else {
            //error
            console.log("something went wrong loading content for mail: " + this.getLastError());
            console.log("^^^ " + this.getLastErrorCode());
        }
    }, false, self);
    request.send(wat.mail.LOAD_MAILCONTENT_URI_, 'POST', data.toString());
};
/**
 *
 * @param {String} subject
 * @param {Number} maxLength
 * @param {Boolean} appendDots Whether to append 3 dots ' ...' at the end of the shortened subject
 * @private
 */
wat.mail.MailItem.prototype.shrinkField_ = function(subject, maxLength, appendDots) {
    // 1) If we're smaller than the given length, just return
    if (subject.length <= maxLength) return subject;
    // 2) Otherwise, check if we need to append dots ...
    var shortenedLength = appendDots ? maxLength - 4 : maxLength,
        shortenedSubject = subject.substr(0, shortenedLength);
    return appendDots ? (shortenedSubject + " ...") : shortenedSubject;
};