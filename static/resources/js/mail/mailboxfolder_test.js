/**
 * Created by mdrobek on 16/09/15.
 */
goog.provide('wat.mail.MailboxFolderTest');
goog.setTestOnly('wat.mail.MailboxFolderTest');

goog.require('wat');
goog.require('wat.app');
goog.require('wat.mail');
goog.require('wat.mail.MailHandler');
goog.require('wat.testing.MailJson');
goog.require('wat.testing.ContentJson');
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
 * @return {goog.testing.net.XhrIo}
 */
function nextXhr() {
    return goog.testing.net.XhrIo.getSendInstances().pop();
}

function setUp() {
    wat.xhr = goog.testing.net.XhrIo;
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
    var inbox = new wat.mail.Inbox(),
        spam =  new wat.mail.Spam();
    // 1) Test correct DOM structure and content to be set
    inbox.renderNavigation(true);
    assertEquals("Rendering 1 mailbox navigation entry creates 1 navigation button",
        1, goog.dom.getChildren(goog.dom.getElement("navBarContainer")).length);
    assertNotNull("Expect the Inbox navigation button to have the correct DOM ID: "
        + inbox.NavDomID, goog.dom.getElement(inbox.NavDomID));
    assertTrue("Expect CSS class active being set for the initial inbox folder",
        goog.dom.classes.has(goog.dom.getElement(inbox.NavDomID), "active"));
    spam.renderNavigation();
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
    var inbox = new wat.mail.Inbox();
    inbox.renderNavigation(true);
    inbox.deactivate();
    assertFalse("Expect CSS class active being removed from inbox after mailbox switch",
        goog.dom.classes.has(goog.dom.getElement(inbox.NavDomID), "active"));
}

function testLoadMails() {
    var inbox = new wat.mail.Inbox(),
        trash = new wat.mail.Trash(),
        inboxMailJson = goog.object.unsafeClone(wat.testing.MailJson),
        trashMailJson = goog.object.unsafeClone(wat.testing.MailJson),
        inboxLoadXhr, trashLoadXhr;
    // Run the load methods for the Trash and Inbox folder
    trash.loadMails();
    trashLoadXhr = nextXhr();
    inbox.loadMails();
    inboxLoadXhr = nextXhr();
    // Set up the expected method calls for the mailhandler object
    mhMock.notifyAboutMails(1).$times(2);
    mhMock.$replay();
    // Simulate that the loadMails() method for the Trash mailbox returns before, the Inbox method
    trashMailJson.Header.Folder = wat.mail.MailboxFolder.TRASH;
    trashMailJson.UID = 2;
    trashLoadXhr.simulateResponse(200, goog.json.serialize([trashMailJson]));
    assertEquals("Expect changed number of mails in the mailbox whose XHR has returned",
        1, trash.mails_.getCount());
    assertEquals("Expect unchanged number of mails in the mailbox whose XHR has not returned",
        0, inbox.mails_.getCount());
    inboxMailJson.Header.SpamIndicator = 0;
    inboxLoadXhr.simulateResponse(200, goog.json.serialize([inboxMailJson]));
    assertEquals("Expect changed number of mails in the mailbox whose XHR has returned",
        1, inbox.mails_.getCount());
    assertEquals("Expect unchanged number of mails in the mailbox whose XHR has not returned",
        1, trash.mails_.getCount());
    mhMock.$verify();
}