/**
 * Created by mdrobek on 16/09/15.
 */
goog.provide('wat.mail.MailHandlerTest');
goog.setTestOnly('wat.mail.MailHandlerTest');

goog.require('wat');
goog.require('wat.app');
goog.require('wat.mail');
goog.require('wat.mail.MailHandler');
goog.require('wat.testing');
goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.testing');
goog.require('goog.testing.asserts');
goog.require('goog.testing.net.XhrIo');
goog.require('goog.testing.jsunit');

/**
 * @type {wat.mail.MailHandler}
 */
var handler;

/**
 * @return {goog.testing.net.XhrIo}
 */
function nextXhr() {
    return goog.testing.net.XhrIo.getSendInstances().pop();
}

function setUp() {
    wat.xhr = goog.testing.net.XhrIo;
    handler = new wat.mail.MailHandler();
    wat.app.mailHandler = handler;
    handler.addNavigationButtons();
}

function tearDown() {
    wat.xhr = goog.net.XhrIo;
    goog.testing.net.XhrIo.cleanup();
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
    goog.dom.removeChildren(goog.dom.getElement("ctrlBarContainer"));
    goog.dom.removeChildren(goog.dom.getElement("navBarContainer"));
}

function testSwitchMailboxFolder() {
    assertThrows("Switching a mailbox folder to an invalid name should raise an exception",
        function() { handler.switchMailboxFolder("RUBBISH_FOLDER"); });
    handler.switchMailboxFolder(wat.mail.MailboxFolder.SENT);
    assertEquals("Switching the mailbox folder changes the selected mailbox folder variable",
        handler.SelectedMailbox, wat.mail.MailboxFolder.SENT);
}
 function testMoveMailIntoClientSideMailbox() {
     var inboxMail = new wat.mail.MailItem(wat.testing.createInboxMail(),
                        wat.mail.MailboxFolder.INBOX),
         clientSideFolder = wat.mail.MailboxFolder.SPAM;
     handler.moveMail(inboxMail, clientSideFolder);
     assertFalse("Expect the mail to be removed from the Inbox",
         handler.mailboxFolders_.get(wat.mail.MailboxFolder.INBOX).contains(inboxMail));
     assertTrue("Expect the mail to be moved into the Spam folder",
         handler.mailboxFolders_.get(wat.mail.MailboxFolder.SPAM).contains(inboxMail));
     assertEquals("Expect the client-side folder information in the MailItem to be adjusted",
         inboxMail.Folder, wat.mail.MailboxFolder.SPAM);
     assertEquals(inboxMail.Previous_Folder, wat.mail.MailboxFolder.INBOX);
     assertEquals("Expect the server-side folder information in the MailItem to be unchanged",
         inboxMail.Mail.Header.Folder, wat.mail.MailboxFolder.INBOX);
     assertEquals("Expect no XHR request to be sent to the server when moving a mail in a "
        + "client-side only folder", undefined, nextXhr());
 }

function testMoveMailIntoServerSideMailbox_Success() {
    var inboxMail = new wat.mail.MailItem(wat.testing.createInboxMail(),
            wat.mail.MailboxFolder.INBOX),
        serverSideFolder = wat.mail.MailboxFolder.TRASH,
        successResponse_json = { newUID: 22 };
    handler.moveMail(inboxMail, serverSideFolder);
    assertFalse("Expect the mail to be removed from the Inbox",
        handler.mailboxFolders_.get(wat.mail.MailboxFolder.INBOX).contains(inboxMail));
    assertTrue("Expect the mail to be moved into the Trash folder",
        handler.mailboxFolders_.get(wat.mail.MailboxFolder.TRASH).contains(inboxMail));
    nextXhr().simulateResponse(200, goog.json.serialize(successResponse_json));
    assertEquals("Expect the UID of the mail to be changed",
        inboxMail.Mail.UID, successResponse_json.newUID);
    assertEquals("Expect the client-side folder information in the MailItem to be adjusted",
        inboxMail.Folder, wat.mail.MailboxFolder.TRASH);
    assertEquals(inboxMail.Previous_Folder, wat.mail.MailboxFolder.INBOX);
    assertEquals("Expect the server-side folder information in the MailItem to be updated",
        inboxMail.Mail.Header.Folder, wat.mail.MailboxFolder.TRASH);
}


function testMoveMailIntoServerSideMailbox_Fail() {
    var inboxMail = new wat.mail.MailItem(wat.testing.createInboxMail(),
            wat.mail.MailboxFolder.INBOX),
        serverSideFolder = wat.mail.MailboxFolder.TRASH,
        failResponse_json = { error: "Failure", origError: "Some explanation" };
    handler.moveMail(inboxMail, serverSideFolder);
    nextXhr().simulateResponse(500, goog.json.serialize(failResponse_json));
    assertTrue("Expect the mail to reside in the original folder (INBOX)",
        handler.mailboxFolders_.get(wat.mail.MailboxFolder.INBOX).contains(inboxMail));
    assertFalse("Expect the mail not to be moved to the TRASH folder",
        handler.mailboxFolders_.get(wat.mail.MailboxFolder.TRASH).contains(inboxMail));
    assertEquals("Expect the UID of the mail to be unchanged",
        inboxMail.Mail.UID, inboxMail.Mail.UID);
    assertEquals("Expect the client-side folder information in the MailItem to be unchanged",
        inboxMail.Folder, wat.mail.MailboxFolder.INBOX);
    assertEquals(inboxMail.Previous_Folder, wat.mail.MailboxFolder.INBOX);
    assertEquals("Expect the server-side folder information in the MailItem to be unchanged",
        inboxMail.Mail.Header.Folder, wat.mail.MailboxFolder.INBOX);
}
