/**
 * Created by mdrobek on 16/09/15.
 */
goog.provide('wat.mail.MailboxFolderTest');
goog.setTestOnly('wat.mail.MailboxFolderTest');

goog.require('wat');
goog.require('wat.app');
goog.require('wat.mail');
goog.require('wat.mail.MailHandler');
goog.require('wat.testing');
goog.require('wat.testing.MailJson');
goog.require('wat.testing.ContentJson');
goog.require('goog.date.Interval');
goog.require('goog.date.DateTime');
goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.testing');
goog.require('goog.testing.events');
goog.require('goog.testing.LooseMock');
goog.require('goog.testing.asserts');
goog.require('goog.testing.net.XhrIo');
goog.require('goog.testing.jsunit');

/**
 * @type {wat.mail.MailHandler}
 */
var mhMock;

/**
 * @type {wat.mail.MailboxFolder}
 */
var inbox, spam, trash;

/**
 * @return {goog.testing.net.XhrIo}
 */
function nextXhr() {
    return goog.testing.net.XhrIo.getSendInstances().pop();
}

function setUp() {
    wat.xhr = goog.testing.net.XhrIo;
    inbox = new wat.mail.Inbox();
    spam = new wat.mail.Spam();
    trash = new wat.mail.Trash();
    mhMock = new goog.testing.LooseMock(wat.mail.MailHandler);
    wat.app.mailHandler = mhMock;
}

function tearDown() {
    wat.xhr = goog.net.XhrIo;
    goog.testing.net.XhrIo.cleanup();
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
    goog.dom.removeChildren(goog.dom.getElement("ctrlBarContainer"));
    goog.dom.removeChildren(goog.dom.getElement("navBarContainer"));
}

function testRenderNavigation() {
    // 1) Test correct DOM structure and content to be set
    inbox.renderNavButton(true);
    assertEquals("Rendering 1 mailbox navigation entry creates 1 navigation button",
        1, goog.dom.getChildren(goog.dom.getElement("navBarContainer")).length);
    assertNotNull("Expect the Inbox navigation button to have the correct DOM ID: "
        + inbox.NavDomID, goog.dom.getElement(inbox.NavDomID));
    assertTrue("Expect CSS class active being set for the initial inbox folder",
        goog.dom.classes.has(goog.dom.getElement(inbox.NavDomID), "active"));
    spam.renderNavButton();
    var navLink = goog.dom.getElementsByTagNameAndClass("a", null,
        goog.dom.getElement(spam.NavDomID));
    assertNotNull("Expect navigation button to have an <a href> link element",
        navLink);
    assertEquals("Expect navigation button to have the correct DisplayName set: "
        + spam.DisplayName, spam.DisplayName, goog.dom.getTextContent(navLink[0]));

    // 2) Test correct execution of click event
    mhMock.switchMailboxFolder(spam.Name);
    mhMock.$replay();
    goog.testing.events.fireClickEvent(goog.dom.getElement(spam.NavDomID));
    mhMock.$verify();
}

function testDeactivateMailbox() {
    inbox.renderNavButton(true);
    inbox.deactivate();
    assertFalse("Expect CSS class active being removed from inbox after mailbox switch",
        goog.dom.classes.has(goog.dom.getElement(inbox.NavDomID), "active"));
}

function testLoadMails() {
    var inboxMailJson = wat.testing.createInboxMail(wat.mail.MailFlags.RECENT),
        trashMailJson = wat.testing.createTrashMail(wat.mail.MailFlags.RECENT),
        inboxLoadXhr, trashLoadXhr;
    goog.array.forEach([inbox, trash], function(curFolder) { curFolder.renderNavButton(); });
    // Run the load methods for the Trash and Inbox folder
    trash.loadMails();
    trashLoadXhr = nextXhr();
    inbox.loadMails();
    inboxLoadXhr = nextXhr();
    // Set up the expected method calls for the mailhandler object
    mhMock.notifyAboutMails(1, wat.mail.MailboxFolder.TRASH);
    mhMock.notifyAboutMails(1, wat.mail.MailboxFolder.INBOX);
    mhMock.$replay();
    // Simulate that the loadMails() method for the Trash mailbox returns before, the Inbox method
    trashLoadXhr.simulateResponse(200, goog.json.serialize([trashMailJson]));
    assertEquals("Expect changed number of mails in the mailbox whose XHR has returned",
        1, trash.mails_.getCount());
    assertEquals("Expect unchanged number of mails in the mailbox whose XHR has not returned",
        0, inbox.mails_.getCount());
    inboxLoadXhr.simulateResponse(200, goog.json.serialize([inboxMailJson]));
    assertEquals("Expect changed number of mails in the mailbox whose XHR has returned",
        1, inbox.mails_.getCount());
    assertEquals("Expect unchanged number of mails in the mailbox whose XHR has not returned",
        1, trash.mails_.getCount());
    mhMock.$verify();
}

function testSynchFolder() {
    var mail2Date = new goog.date.DateTime();
    mail2Date.add(new goog.date.Interval(goog.date.DateTime.MINUTES, 5));
    var inboxMail1 = wat.testing.createInboxMail( wat.mail.MailFlags.RECENT),
        // Make sure, both mails have different dates (see bug watney-26)
        inboxMail2 = wat.testing.createInboxMail(wat.mail.MailFlags.RECENT, mail2Date),
        spamMail = wat.testing.createSpamMail(wat.mail.MailFlags.RECENT),
        spamMailObj = new wat.mail.MailItem(spamMail, wat.mail.MailboxFolder.SPAM),
        inboxXHR;
    goog.array.forEach([inbox, spam], function(curFolder) { curFolder.renderNavButton(); });
    inbox.synchFolder();
    inboxXHR = nextXhr();
    // Set up expected method calls for spam mails
    mhMock.addMailsToSpamFolder([spamMailObj]);
    mhMock.notifyAboutMails(2, wat.mail.MailboxFolder.INBOX);
    mhMock.$replay();
    inboxXHR.simulateResponse(200, goog.json.serialize([inboxMail1, inboxMail2, spamMail]));
    assertEquals("Expect correct number of inbox mails", 2, inbox.mails_.getCount());
    mhMock.$verify();
}

function testUpdateNavigationBar() {
    var mail2Date = new goog.date.DateTime();
    mail2Date.add(new goog.date.Interval(goog.date.DateTime.MINUTES, 5));
    var spamMail1 = new wat.mail.MailItem(wat.testing.createSpamMail(wat.mail.MailFlags.RECENT),
            wat.mail.MailboxFolder.SPAM),
        // Make sure, both mails have different dates (see bug watney-26)
        spamMail2 = new wat.mail.MailItem(
            wat.testing.createSpamMail(wat.mail.MailFlags.RECENT, mail2Date),
            wat.mail.MailboxFolder.SPAM),
        d_navbarButton, d_navbarButtonA;
    spam.renderNavButton();
    goog.array.forEach([spamMail1, spamMail2], function(curMail) {
        curMail.renderMail();
        spam.mails_.add(curMail);
    });
    // Test 1) Check that the folder is highlighted after new mails have arrived
    spam.updateNavigationBar();
    d_navbarButton = goog.dom.getElement(spam.NavDomID);
    d_navbarButtonA = goog.dom.getElementsByTagNameAndClass("a", null, d_navbarButton)[0];
    assertEquals("Expect navigation bar button text to show arrival of new mails",
        "Spam (2)", goog.dom.getTextContent(d_navbarButtonA));
    assertTrue("Expect navigation bar button to be highlighted on new mail arrival",
        goog.dom.classes.has(d_navbarButton, "strong"));
    // Test 2) Check that folder is reset after all mails are read
    goog.array.forEach(spam.mails_.getValues(), function(curSpam) {
        curSpam.Mail.Flags.Seen = true;
    });
    spam.updateNavigationBar();
    assertEquals("Expect navigation bar button text to only show button name after mails have "
        + "been read", "Spam", goog.dom.getTextContent(d_navbarButtonA));
    assertFalse("Expect navigation bar button to be reset after mails have been read",
        goog.dom.classes.has(d_navbarButton, "strong"));
}

// Future test to remo
function testEmptyTrashFolder() {
    var mail2Date = new goog.date.DateTime(),
        mail3Date = new goog.date.DateTime();
    mail2Date.add(new goog.date.Interval(goog.date.DateTime.MINUTES, 5));
    mail3Date.add(new goog.date.Interval(goog.date.DateTime.MINUTES, 15));
    var trashMailJson1 = wat.testing.createTrashMail(wat.mail.MailFlags.RECENT),
        trashMailJson2 = wat.testing.createTrashMail(wat.mail.MailFlags.RECENT, mail2Date),
        trashMailJson3 = wat.testing.createTrashMail(wat.mail.MailFlags.RECENT, mail3Date),
        trashMailsJson = [trashMailJson1, trashMailJson2, trashMailJson3],
        //trashMailsJson = goog.json.serialize([trashMailJson1, trashMailJson2, trashMailJson3]),
        trashLoadXhr;
    trash.renderNavButton();
    // Run the load methods for the Trash and Inbox folder
    trash.loadMails();
    trashLoadXhr = nextXhr();
    // Fill the trash mailbox with 3 mails
    trashLoadXhr.simulateResponse(200, goog.json.serialize(trashMailsJson));
    assertEquals("Expect 3 mails to be stored in the trashs 'mail_' member",
        3, trash.mails_.getCount());
    // Now empty the mailbox folder
    trash.emptyMailbox_();
    assertEquals("Expect no mails remaining in the trashs 'mail_' member",
        0, trash.mails_.getCount());
    assertEquals("Expect 3 new mails in the trashs 'hiddenMails_' member",
        3, trash.hiddenMails_.getCount());
    goog.array.forEach(trash.hiddenMails_.getValues(), function(curMail) {
        assertTrue("Expect mail flag \\\\Deleted to be set", curMail.Mail.Flags.Deleted);
    });
}
