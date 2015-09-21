/**
 * Created by mdrobek on 16/09/15.
 */
goog.provide('wat.mail.MailHandlerTest');
goog.setTestOnly('wat.mail.MailHandlerTest');

goog.require('wat');
goog.require('wat.app');
goog.require('wat.mail');
goog.require('wat.mail.MailHandler');
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
    //mhMock = new goog.testing.LooseMock(wat.mail.MailHandler);
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
