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
wat.mail.NewMail = function(from) {
    var self = this;
    self.WindowDomID = "newMailWindowItem_" + wat.mail.ItemCounter;
    self.WindowBarItemDomID = "newMailBarItem_" + wat.mail.ItemCounter++;
    self.From = from;
};

wat.mail.NewMail.prototype.WindowBarItemDomID;
wat.mail.NewMail.prototype.WindowDomID;
wat.mail.NewMail.prototype.From;
wat.mail.NewMail.prototype.To;
wat.mail.NewMail.prototype.Text;
wat.mail.NewMail.prototype.Visible = false;
wat.mail.NewMail.prototype.HoverEventsActive = false;
wat.mail.NewMail.prototype.PreviewActive = false;
wat.mail.NewMail.prototype.MOUSEROVER_KEY;
wat.mail.NewMail.prototype.MOUSEOUT_KEY;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Private methods                                           ///
////////////////////////////////////////////////////////////////////////////////////////////////////

wat.mail.NewMail.prototype.addNewMail = function(opt_to) {
    var self = this,
        d_windowContainerElem = goog.dom.getElement("newMailWindowItems"),
        d_newMailWindowItem = goog.soy.renderAsElement(wat.soy.mail.newMailWindowItem, {
            DomID: self.WindowDomID,
            ShortenedTo: self.From
        }),
        d_barContainerElem = goog.dom.getElement("newMailBarItems"),
        d_newMailBarItem = goog.soy.renderAsElement(wat.soy.mail.newMailBarItem, {
            DomID: self.WindowBarItemDomID,
            ShortenedTo: self.From
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
        self.show();
    });
};

wat.mail.NewMail.prototype.toggleVisible = function() {
    console.log("TOGGLE");
    var self = this,
        d_newMailBarItem = goog.dom.getElement(self.WindowBarItemDomID);
    // 1) A click event has occurred ...
    if (self.PreviewActive) {
        goog.events.unlistenByKey(self.MOUSEOVER_KEY);
        goog.events.unlistenByKey(self.MOUSEOUT_KEY);
        // Preview is now active view
        self.PreviewActive = false;
    } else if (self.Visible) {
        // New_Mail is visible because of previous click event
        self.hide();
        self.MOUSEOVER_KEY = goog.events.listen(d_newMailBarItem, goog.events.EventType.MOUSEOVER,
            function(ev) {
            ev.stopPropagation();
            console.log("ENTERING!" + ev.target);
            self.show();
            self.PreviewActive = true;
        }, false, self);
        self.MOUSEOUT_KEY = goog.events.listen(d_newMailBarItem, goog.events.EventType.MOUSEOUT,
            function(ev) {
            ev.stopPropagation();
            console.log("LEAVING! " + ev.target);
            self.hide();
            self.PreviewActive = false;
        }, false, self);
    } else {
        // New_Mail is hidden because of previous click event
        self.show();
    }
};

wat.mail.NewMail.prototype.hide = function() {
    // Only return if we're not forcing to hide and its marked sticky
    //if (!this.Visible) return;
    console.log("HIDE");
    var d_newMailWindowItem = goog.dom.getElement(this.WindowDomID);
    goog.dom.classes.remove(d_newMailWindowItem, "active");
    this.Visible = false;
};

wat.mail.NewMail.prototype.show = function() {
    //if (this.Visible) return;
    console.log("SHOW");
    var d_newMailWindowItem = goog.dom.getElement(this.WindowDomID);
    if (!goog.dom.classes.has(d_newMailWindowItem, "active")) {
        goog.dom.classes.add(d_newMailWindowItem, "active");
    }
    this.Visible = true;
};