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
    //if (this.Visible) return;
    if (goog.isDefAndNotNull(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM)
        && this != wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM) {
        wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM.hideAndHoverEvents();
    }
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
                if (goog.isDefAndNotNull(wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM)
                    && self != wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM) {
                    wat.mail.LAST_ACTIVE_NEW_MAIL_ITEM.hideAndHoverEvents();
                }
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
