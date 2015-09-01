/**
 * Created by mdrobek on 02/07/15.
 */
goog.provide('wat.app');

goog.require('wat.mail');
goog.require('wat.mail.MailHandler');
goog.require('wat.mail.MailboxFolder');
goog.require('goog.events');
goog.require('goog.array');
goog.require('goog.net.XhrIo');
goog.require('goog.Uri.QueryData');
goog.require('goog.ui.KeyboardShortcutHandler');


// Global accessible objects
/**
 * @type {wat.mail.MailHandler} The object that handles the mail page.
 */
wat.app.mailHandler = null;
/**
 * @type {goog.ui.KeyboardShortcutHandler}
 */
wat.app.keyboardShortcutHandler = null;

//TODO: outsource
wat.app.LOAD_USER_URI_ = "/userInfo";
/**
 * @type {string} The email address of the user.
 */
wat.app.userMail = null;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    STATIC Methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Entry point for the application.
 * @static
 */
wat.app.start = function() {
    // 1) Load user details
    wat.app.loadUser();
    // 2) Add all events to the mailbox buttons on the left nav bar
    wat.app.addNavigationEvents();
    // 3) Create a keyboard shortcut handler and register the shortcuts for the mail page
    wat.app.keyboardShortcutHandler = new goog.ui.KeyboardShortcutHandler(document);
    goog.events.listen(wat.app.keyboardShortcutHandler,
        goog.ui.KeyboardShortcutHandler.EventType.SHORTCUT_TRIGGERED,
        wat.app.keyboardShortcutCb_);
    wat.app.enableMailKeyboardShortcuts(true);
    // 4) Start loading mails
    wat.app.mailHandler = new wat.mail.MailHandler();
    wat.app.mailHandler.switchMailboxFolder(wat.mail.MailboxFolder.INBOX);
    wat.app.mailHandler.registerUpdateEvents();
};

/**
 * Enables or disables all keyboard shortcuts that are associated with the mail page.
 * @param enable True - All keyboard shortcuts associated with the mail page will be activated.
 *               False - The opposite
 * @static
 * @public
 */
wat.app.enableMailKeyboardShortcuts = function(enable) {
    // 1) In case the shortcut handler is not defined, return without doing anything
    if (!goog.isDefAndNotNull(wat.app.keyboardShortcutHandler)) return;

    if (enable) {
        // 1a) Include the DELETE key
        if (!wat.app.keyboardShortcutHandler.isShortcutRegistered(goog.events.KeyCodes.DELETE)) {
            wat.app.keyboardShortcutHandler.registerShortcut(
                wat.mail.KeyShortcuts.DELETE_MAIL, goog.events.KeyCodes.DELETE);
        }
        // 1b) Include navigation in the mail overview list
        if (!wat.app.keyboardShortcutHandler.isShortcutRegistered(goog.events.KeyCodes.UP)) {
            wat.app.keyboardShortcutHandler.registerShortcut(
                wat.mail.KeyShortcuts.UP, goog.events.KeyCodes.UP);
        }
        if (!wat.app.keyboardShortcutHandler.isShortcutRegistered(goog.events.KeyCodes.DOWN)) {
            wat.app.keyboardShortcutHandler.registerShortcut(
                wat.mail.KeyShortcuts.DOWN, goog.events.KeyCodes.DOWN);
        }
    } else {
        wat.app.keyboardShortcutHandler.unregisterShortcut(wat.mail.KeyShortcuts.DELETE_MAIL);
        wat.app.keyboardShortcutHandler.unregisterShortcut(wat.mail.KeyShortcuts.UP);
        wat.app.keyboardShortcutHandler.unregisterShortcut(wat.mail.KeyShortcuts.DOWN);
    }
};

/**
 *
 * @param ev
 * @static
 * @private
 */
wat.app.keyboardShortcutCb_ = function(ev) {
    switch (ev.identifier) {
        case wat.mail.KeyShortcuts.DELETE_MAIL: {
            wat.app.mailHandler.deleteActiveMail();
            break;
        }
        case wat.mail.KeyShortcuts.UP: {
            wat.app.mailHandler.switchToSibling(false);
            break;
        }
        case wat.mail.KeyShortcuts.DOWN: {
            wat.app.mailHandler.switchToSibling();
            break;
        }
        default:
            console.log("No callback has been registered for keyboard shortcut: " + ev.identifier);
    }
};

wat.app.addNavigationEvents = function() {
    var btns = [{
                domName: "Inbox_Btn",
                mailboxFolder: wat.mail.MailboxFolder.INBOX
            }, {
                domName: "Sent_Btn",
                mailboxFolder: wat.mail.MailboxFolder.SENT
            }, {
                domName: "Trash_Btn",
                mailboxFolder: wat.mail.MailboxFolder.TRASH
            }];
    goog.array.forEach(btns, function(curBtn) {
        var d_newClickedBtn = goog.dom.getElement(curBtn.domName);
        goog.events.listen(d_newClickedBtn, goog.events.EventType.CLICK, function() {
            if (wat.app.mailHandler.SelectedMailbox === curBtn.mailboxFolder) return;
            // 1) Remove highlight of other buttons
            goog.array.forEach(btns, function(curBtn) {
                var d_curBtn = goog.dom.getElement(curBtn.domName);
                if (goog.dom.classes.has(d_curBtn, "active")) {
                    goog.dom.classes.remove(d_curBtn, "active");
                }
            });
            // 2) Add highlight for new button
            goog.dom.classes.add(d_newClickedBtn, "active");
            // 3) Switch to the new mailbox
            wat.app.mailHandler.switchMailboxFolder(curBtn.mailboxFolder);
        });
    });
};

/**
 * TODO: Outsource later on to a user model
 */
wat.app.loadUser = function() {
    var request = new goog.net.XhrIo();
    // We don't need to add the folder data entry, since it defaults to INBOX
    goog.events.listen(request, goog.net.EventType.COMPLETE, function (event) {
        // request complete
        var request = event.currentTarget;
        if (request.isSuccess()) {
            var userInfoJSON = request.getResponseJson();
            wat.app.userMail = userInfoJSON.email;
        } else {
            //error
            console.log("something went wrong: " + event.getLastError());
            console.log("^^^ " + event.getLastErrorCode());
        }
    });
    request.send(wat.app.LOAD_USER_URI_, 'POST', null);

};