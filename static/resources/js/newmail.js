/**
 * Created by mdrobek on 26/07/15.
 */
goog.provide('wat.mail.NewMail');

goog.require('wat.mail');
goog.require('wat.soy.mail');
goog.require('goog.events');
goog.require('goog.dom');
goog.require('goog.dom.classes');

wat.mail.ItemCounter = 0;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Public methods                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * NewMail reflects the UI model for a new email to be sent (e.g., a reply or an entire new mail).
 * @constructor
 */
wat.mail.NewMail = function(from, opt_to, opt_subject, opt_text) {
    var self = this;
    self.WindowDomID = "newMailWindowItem_" + wat.mail.ItemCounter;
    self.WindowBarItemDomID = "newMailBarItem_" + wat.mail.ItemCounter++;
    self.From = from;
    if (goog.isDefAndNotNull(opt_to)) {
        self.To = opt_to;
    }
    if (goog.isDefAndNotNull(opt_subject)) {
        self.Subject = "Re: " + opt_subject;
    }
    if (goog.isDefAndNotNull(opt_text)) {
        self.Text = "\n\n\n\n" + opt_text;
    }
};

/**
 *
 * @type {string}
 * @static
 * @private
 */
wat.mail.NewMail.SEND_MAIL_URI_ = "/sendMail";

wat.mail.NewMail.prototype.WindowBarItemDomID = "";
wat.mail.NewMail.prototype.WindowDomID = "";
wat.mail.NewMail.prototype.From = "";
wat.mail.NewMail.prototype.To = "";
wat.mail.NewMail.prototype.Text = "";
wat.mail.NewMail.prototype.Visible = false;
wat.mail.NewMail.prototype.PreviewActive = false;
wat.mail.NewMail.prototype.MOUSEOVER_KEY = null;
wat.mail.NewMail.prototype.MOUSEOUT_KEY = null;


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Public methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////

wat.mail.NewMail.prototype.addNewMail = function() {
    var self = this,
        d_windowContainerElem = goog.dom.getElement("newMailWindowItems"),
        d_newMailWindowItem = goog.soy.renderAsElement(wat.soy.mail.newMailWindowItem, {
            DomID: self.WindowDomID,
            ShortenedFrom: self.From,
            ShortenedTo: self.To,
            Subject: self.Subject,
            OrigMail: self.Text
        }),
        d_barContainerElem = goog.dom.getElement("newMailBarItems"),
        d_newMailBarItem = goog.soy.renderAsElement(wat.soy.mail.newMailBarItem, {
            DomID: self.WindowBarItemDomID,
            ShortenedTo: self.To
        });
    goog.events.listen(d_newMailBarItem, goog.events.EventType.CLICK, self.toggleVisible, true,
        self);
    goog.dom.append(d_barContainerElem, d_newMailBarItem);
    goog.dom.append(d_windowContainerElem, d_newMailWindowItem);
    // Give the browser a little time to introduce the new element before showing it, so that the
    // CSS animation plays fine
    var timer = new goog.Timer(100);
    timer.start();
    goog.events.listenOnce(timer, goog.Timer.TICK, function() {
        timer.stop();
        self.show();
        self.registerSendBtnEvent_();
    });
};


wat.mail.NewMail.prototype.toggleVisible = function() {
    var self = this;
    // 1) A click event has occurred ...
    if (self.PreviewActive) {
        // We want to get rid of hover events
        self.unregisterHoverEvents();
        // Preview is now active view
        self.PreviewActive = false;
    } else if (self.Visible) {
        // New_Mail is visible because of previous click event => we want hover events
        self.hideAndHoverEvents();
    } else {
        // New_Mail is hidden because of previous click event => we don't want hover events
        self.show();
    }
};

wat.mail.NewMail.prototype.hide = function() {
    // Only return if we're not forcing to hide and its marked sticky
    //if (!this.Visible) return;
    var d_newMailWindowItem = goog.dom.getElement(this.WindowDomID);
    goog.dom.classes.remove(d_newMailWindowItem, "active");
    this.Visible = false;
};

wat.mail.NewMail.prototype.hideAndHoverEvents = function() {
    this.hide();
    this.registerHoverEvents();
};

wat.mail.NewMail.prototype.show = function() {
    wat.mail.MailHandler.hideActiveNewMail(this);
    var d_newMailWindowItem = goog.dom.getElement(this.WindowDomID);
    if (!goog.dom.classes.has(d_newMailWindowItem, "active")) {
        goog.dom.classes.add(d_newMailWindowItem, "active");
    }
    wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = this;
    this.Visible = true;
};

wat.mail.NewMail.prototype.registerHoverEvents = function() {
    // 1) Check if the events are already active, and if so, don't register them again
    var self = this,
        d_newMailBarItem = goog.dom.getElement(self.WindowBarItemDomID);
    if (null == self.MOUSEOVER_KEY) {
        self.MOUSEOVER_KEY = goog.events.listen(d_newMailBarItem, goog.events.EventType.MOUSEOVER,
            function (ev) {
                wat.mail.MailHandler.hideActiveNewMail(self);
                ev.stopPropagation();
                self.show();
                self.PreviewActive = true;
            }, false, self);
    }
    if (null == self.MOUSEOUT_KEY) {
        self.MOUSEOUT_KEY = goog.events.listen(d_newMailBarItem, goog.events.EventType.MOUSEOUT,
            function (ev) {
                ev.stopPropagation();
                self.hide();
                self.PreviewActive = false;
            }, false, self);
    }
};

wat.mail.NewMail.prototype.unregisterHoverEvents = function() {
    goog.events.unlistenByKey(this.MOUSEOVER_KEY);
    goog.events.unlistenByKey(this.MOUSEOUT_KEY);
    this.MOUSEOVER_KEY = null;
    this.MOUSEOUT_KEY = null;
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
wat.mail.NewMail.prototype.registerSendBtnEvent_ = function() {
    var self = this,
        d_sendBtn = goog.dom.getElement(self.WindowDomID+"_SendBtn");
    goog.events.listen(d_sendBtn, goog.events.EventType.CLICK, self.sendMail_, true, self);
};

wat.mail.NewMail.prototype.sendMail_ = function() {
    var self = this,
        request = new goog.net.XhrIo(),
        data = new goog.Uri.QueryData(),
        d_to = goog.dom.getElement(self.WindowDomID+"_newMail_Window_To"),
        d_subject = goog.dom.getElement(self.WindowDomID+"_newMail_Window_Subject"),
        d_body = goog.dom.getElement(self.WindowDomID+"_newMail_Window_Text");
    data.add("from", self.From);
    data.add("to", d_to.value);
    data.add("subject", d_subject.value);
    data.add("body", d_body.value);

    // 1) Clean the error field from previous tries
    goog.dom.setTextContent(goog.dom.getElement(self.WindowDomID+"_ErrMsg"), "");
    // 2) Add the COMPLETE send listener
    goog.events.listen(request, goog.net.EventType.COMPLETE, self.sendMailResponse_, true, self);
    // 3) Send the request (mail)
    request.send(wat.mail.NewMail.SEND_MAIL_URI_, 'POST', data.toString());
};

wat.mail.NewMail.prototype.sendMailResponse_ = function(event) {
    // request complete
    var self = this,
        request = event.currentTarget;
    if (request.isSuccess()) {
        var responseJSON = request.getResponseJson();
        // Check if the send mail request was successful ...
        if (goog.isDefAndNotNull(responseJSON) && goog.isDefAndNotNull(responseJSON.error)) {
            // ... and if not, print the error msg
            goog.dom.setTextContent(goog.dom.getElement(self.WindowDomID+"_ErrMsg"),
                responseJSON.sendMailError);
        } else {
            // x) Remove the DOM elements for the new_mail window and bar item
            var d_windowItem = goog.dom.getElement(self.WindowDomID),
                d_windowBarItem = goog.dom.getElement(self.WindowBarItemDomID);
            goog.dom.removeNode(d_windowItem);
            goog.dom.removeNode(d_windowBarItem);
            // x) If this was the last active new_mail item, reset the state
            if (goog.isDefAndNotNull(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM)
                && wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM == self) {
                wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = null;
            }
        }
    } else {
        //error
        console.log("something went wrong: " + event.error);
    }
};
