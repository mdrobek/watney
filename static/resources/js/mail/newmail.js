/**
 * Created by mdrobek on 26/07/15.
 */
goog.provide('wat.mail.NewMail');

goog.require('wat.mail');
goog.require('wat.mail.BaseMail');
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
wat.mail.NewMail = function(from, opt_to, opt_subject, opt_content) {
    var self = this;
    self.WindowDomID = "newMailWindowItem_" + wat.mail.ItemCounter;
    self.WindowBarItemDomID = "newMailBarItem_" + wat.mail.ItemCounter++;
    self.Mail = new wat.mail.BaseMail(from, opt_to, opt_subject, opt_content);
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
/**
 * @type {wat.mail.BaseMail}
 */
wat.mail.NewMail.prototype.Mail = null;
wat.mail.NewMail.prototype.Visible = false;
wat.mail.NewMail.prototype.PreviewActive = false;
wat.mail.NewMail.prototype.MouseOver_Key = null;
wat.mail.NewMail.prototype.MouseOut_Key = null;


////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Public methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 *
 * @param {boolean} asReply True - This 'new Mail' will be rendered as if it was a reply mail.
 *                          False - It will be rendered as a completely new email.
 */
wat.mail.NewMail.prototype.renderNewMail = function(asReply) {
    var self = this,
        d_windowContainerElem = goog.dom.getElement("newMailWindowItems"),
        d_newMailWindowItem = goog.soy.renderAsElement(wat.soy.mail.newMailWindowItem, {
            DomID: self.WindowDomID,
            From: self.Mail.Header.Sender,
            To: self.Mail.Header.Receiver,
            Subject: self.Mail.Header.Subject,
            OrigMail: self.createOriginalText_(asReply)
        }),
        d_barContainerElem = goog.dom.getElement("newMailBarItems"),
        d_newMailBarItem = goog.soy.renderAsElement(wat.soy.mail.newMailBarItem, {
            DomID: self.WindowBarItemDomID,
            ShortenedTo: self.createTaskBarText_(asReply)
        });
    // Listener for Click on item in the lower Bar
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
        self.registerCtrlBtnEvents_();
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
    if (null == self.MouseOver_Key) {
        self.MouseOver_Key = goog.events.listen(d_newMailBarItem, goog.events.EventType.MOUSEOVER,
            function (ev) {
                wat.mail.MailHandler.hideActiveNewMail(self);
                ev.stopPropagation();
                self.show();
                self.PreviewActive = true;
            }, false, self);
    }
    if (null == self.MouseOut_Key) {
        self.MouseOut_Key = goog.events.listen(d_newMailBarItem, goog.events.EventType.MOUSEOUT,
            function (ev) {
                ev.stopPropagation();
                self.hide();
                self.PreviewActive = false;
            }, false, self);
    }
};

wat.mail.NewMail.prototype.unregisterHoverEvents = function() {
    goog.events.unlistenByKey(this.MouseOver_Key);
    goog.events.unlistenByKey(this.MouseOut_Key);
    this.MouseOver_Key = null;
    this.MouseOut_Key = null;
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 *
 * @param {boolean} asReply True - This 'new Mail' will be rendered as if it was a reply mail.
 *                          False - It will be rendered as a completely new email.
 */
wat.mail.NewMail.prototype.createTaskBarText_ = function(asReply) {
    if (asReply) {
        return wat.mail.MailHandler.shrinkField(this.Mail.Header.Receiver, 20, true)
    } else {
        return "New Mail";
    }
};

/**
 *
 * @param {boolean} asReply True - This 'new Mail' will be rendered as if it was a reply mail.
 *                          False - It will be rendered as a completely new email.
 */
wat.mail.NewMail.prototype.createOriginalText_ = function(asReply) {
    if (asReply) {
        return "\n\n\n***         Original Text           ***\n"
            + this.Mail.getContent("text/plain")
    } else {
        return "";
    }
};

wat.mail.NewMail.prototype.registerCtrlBtnEvents_ = function() {
    var self = this,
        d_minimizeBtn = goog.dom.getElement(self.WindowDomID+"_MinimizeBtn"),
        d_closeBtn = goog.dom.getElement(self.WindowDomID+"_CloseBtn"),
        d_sendBtn = goog.dom.getElement(self.WindowDomID+"_SendBtn");
    // Listener for Click on the minimize icon of the window
    goog.events.listen(d_minimizeBtn, goog.events.EventType.CLICK, function() {
            self.hideAndHoverEvents();
        }, true, self);
    // Listener for Click on the close icon of the window
    goog.events.listen(d_closeBtn, goog.events.EventType.CLICK, function() {
            self.close_();
        }, true, self);
    // Listener for Click on the send icon
    goog.events.listen(d_sendBtn, goog.events.EventType.CLICK, self.sendMail_, true, self);


};

wat.mail.NewMail.prototype.sendMail_ = function() {
    var self = this,
        data = new goog.Uri.QueryData(),
        d_to = goog.dom.getElement(self.WindowDomID+"_newMail_Window_To"),
        d_subject = goog.dom.getElement(self.WindowDomID+"_newMail_Window_Subject"),
        d_body = goog.dom.getElement(self.WindowDomID+"_newMail_Window_Text");

    // 1) Clean the error field from previous tries
    goog.dom.setTextContent(goog.dom.getElement(self.WindowDomID+"_ErrMsg"), "");
    // 2) Create data object to send (mail)
    data.add("from", self.Mail.Header.Sender);
    data.add("to", d_to.value);
    data.add("subject", d_subject.value);
    data.add("body", d_body.value);
    // 3) Send and add the COMPLETE listener
    //wat.xhr.send(wat.mail.NewMail.SEND_MAIL_URI_, self.sendMailResponse_, 'POST', data.toString());
    wat.xhr.send(wat.mail.NewMail.SEND_MAIL_URI_, function(event) {
        // request complete
        var request = event.currentTarget;
        if (request.isSuccess()) {
            var responseJSON = request.getResponseJson();
            // Check if the send mail request was successful ...
            if (goog.isDefAndNotNull(responseJSON) && goog.isDefAndNotNull(responseJSON.error)) {
                // ... and if not, print the error msg
                goog.dom.setTextContent(goog.dom.getElement(self.WindowDomID+"_ErrMsg"),
                    responseJSON.sendMailError);
            } else {
                // ... otherwise, sending went fine => go back to previous state
                self.close_();
            }
        } else {
            //error
            console.log("something went wrong: " + event.error);
        }
    }, 'POST', data.toString());
};

//wat.mail.NewMail.prototype.sendMailResponse_ = function(event) {
//    // request complete
//    var self = this,
//        request = event.currentTarget;
//    if (request.isSuccess()) {
//        var responseJSON = request.getResponseJson();
//        // Check if the send mail request was successful ...
//        if (goog.isDefAndNotNull(responseJSON) && goog.isDefAndNotNull(responseJSON.error)) {
//            // ... and if not, print the error msg
//            goog.dom.setTextContent(goog.dom.getElement(self.WindowDomID+"_ErrMsg"),
//                responseJSON.sendMailError);
//        } else {
//            // ... otherwise, sending went fine => go back to previous state
//            self.close_();
//        }
//    } else {
//        //error
//        console.log("something went wrong: " + event.error);
//    }
//};

wat.mail.NewMail.prototype.close_ = function() {
    var self = this;
    self.unregisterHoverEvents();
    // 2) Remove the DOM elements for the new_mail window and bar item
    var d_windowItem = goog.dom.getElement(self.WindowDomID),
        d_windowBarItem = goog.dom.getElement(self.WindowBarItemDomID);
    goog.dom.removeNode(d_windowItem);
    goog.dom.removeNode(d_windowBarItem);
    // 3) If this was the last active new_mail item, reset the state
    if (goog.isDefAndNotNull(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM)
        && wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM == self) {
        wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM = null;
    }
};
