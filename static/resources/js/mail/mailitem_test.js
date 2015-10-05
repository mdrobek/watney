/**
 * Created by mdrobek on 16/09/15.
 */
goog.provide('wat.mail.MailItemTest');
goog.setTestOnly('wat.mail.MailItemTest');

goog.require('wat');
goog.require('wat.app');
goog.require('wat.mail.MailHandler');
goog.require('wat.mail.MailItem');
goog.require('wat.testing');
goog.require('wat.testing.MailJson');
goog.require('wat.testing.ContentJson');
goog.require('goog.object');
goog.require('goog.dom.classes');
goog.require('goog.structs.Map');
goog.require('goog.testing');
goog.require('goog.testing.asserts');
goog.require('goog.testing.net.XhrIo');
goog.require('goog.testing.jsunit');
goog.require('goog.testing.events');
goog.require('goog.testing.FunctionMock');

/**
 * Mock object for the mail handler object (because it is not under test here).
 * @type {goog.testing.LooseMock} Mock of wat.mail.MailHandler
 */
var mhMock;
/**
 * @type {wat.testing.MailJson}
 */
var inboxMailJson;
/**
 * @type {wat.testing.ContentJson}
 */
var contentJson;

/**
 * @return {goog.testing.net.XhrIo}
 */
function nextXhr() {
    return goog.testing.net.XhrIo.getSendInstances().pop();
}

function setUp() {
    wat.xhr = goog.testing.net.XhrIo;
    inboxMailJson = wat.testing.createInboxMail();
    contentJson = goog.object.unsafeClone(wat.testing.ContentJson);
    mhMock = new goog.testing.LooseMock(wat.mail.MailHandler);
    wat.app.mailHandler = mhMock;
}

function tearDown() {
    wat.xhr = goog.net.XhrIo;
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
    goog.testing.net.XhrIo.cleanup();
    mhMock.$reset();
}

function testRenderMailItem() {
    var myMock = new goog.testing.FunctionMock(),
        testInboxItem = new wat.mail.MailItem(inboxMailJson, "/");
    myMock(testInboxItem);
    myMock.$replay();
    testInboxItem.renderMail(myMock, true);
    assertEquals("Should have one mail item in the list", 1,
        goog.dom.getChildren(goog.dom.getElement("mailItems")).length);
    assertEquals("NewMail CSS class 'newMail' should be set/unset for mail with Flag Seen="
            +inboxMailJson.Flags.Seen,
        inboxMailJson.Flags.Seen,
        !goog.dom.classes.has(goog.dom.getElement(testInboxItem.DomID+"_Seen"), "newMail"));
    goog.testing.events.fireClickEvent(goog.dom.getElement(testInboxItem.DomID));
    // Mock function should have been called after click event with mailItem
    myMock.$verify();
}

function testLoadContent() {
    var myMock = new goog.testing.FunctionMock(),
        testInboxItem = new wat.mail.MailItem(inboxMailJson, "/");
    myMock(testInboxItem);
    myMock.$replay();
    testInboxItem.loadContent(myMock);
    nextXhr().simulateResponse(200, goog.json.serialize(contentJson));
    myMock.$verify();
    assertTrue("Mail content should have been loaded", testInboxItem.HasContentBeenLoaded);
    assertEquals("Mail content should have 2 entries", 2, testInboxItem.Mail.Content.getCount());
    assertEquals("text/plain body has been set correctly",
        goog.object.get(contentJson, "text/plain").Body,
        testInboxItem.Mail.getContent("text/plain"));
    assertEquals("text/html body has been set correctly",
        goog.object.get(contentJson, "text/html").Body,
        testInboxItem.Mail.getContent("text/html"));
}

function testHighlightItem() {
    var testInboxItem = new wat.mail.MailItem(inboxMailJson, "/");
    assertNotThrows("Highlighting doesn't throw an error, if called without existing DOM element",
        testInboxItem.highlightOverviewItem);
    testInboxItem.renderMail(function(){});
    testInboxItem.highlightOverviewItem(true);
    assertTrue("Highlight CSS class 'active' should be set for mail overview item",
        goog.dom.classes.has(goog.dom.getElement(testInboxItem.DomID+"_Seen"), "active"));
    testInboxItem.highlightOverviewItem(false);
    assertFalse("Highlight CSS class 'active' should be removed for mail overview item",
        goog.dom.classes.has(goog.dom.getElement(testInboxItem.DomID+"_Seen"), "active"));
}

function testSetSeen() {
    var testInboxItem = new wat.mail.MailItem(inboxMailJson, inboxMailJson.Header.Folder),
        updateFlagXhr;
    testInboxItem.renderMail();
    // Expect notify for Spam mail
    mhMock.notifyAboutMails(1, inboxMailJson.Header.Folder, true);
    mhMock.updateNavigationBarButton(inboxMailJson.Header.Folder);
    mhMock.$replay();
    testInboxItem.setSeen(true);
    mhMock.$verify();
    assertTrue("Mail flag should have been changed", testInboxItem.Mail.Flags.Seen);
    assertEquals("NewMail CSS class 'newMail' should be set/unset for mail with Flag Seen="
        +testInboxItem.Mail.Flags.Seen,
        testInboxItem.Mail.Flags.Seen,
        !goog.dom.classes.has(goog.dom.getElement(testInboxItem.DomID+"_Seen"), "newMail"));
    updateFlagXhr = nextXhr();
    assertNotNull("SetSeen() needs to update the server side about the flag change", updateFlagXhr);
    assertEquals("Check for the correct flag update request URI",
        wat.mail.UPDATE_FLAGS_URI,
        updateFlagXhr.getLastUri());
}

function testTrashRequest() {
    var myMock = new goog.testing.FunctionMock(),
        testInboxItem = new wat.mail.MailItem(inboxMailJson, "/"),
        trashResponse_json = { trashedUID: 22 };
    myMock(trashResponse_json.trashedUID);
    myMock.$replay();
    testInboxItem.trashRequest_(testInboxItem.Folder, myMock, function(){});
    nextXhr().simulateResponse(200, goog.json.serialize(trashResponse_json));
    myMock.$verify();
}

//function testTrashRequestRemoteFolder() {
//    var testInboxItem = new wat.mail.MailItem(inboxMailJson, "/"),
//        trashResponse_json = { trashedUID: 22 };
//    myMock(trashResponse_json.trashedUID);
//    myMock.$replay();
//    testInboxItem.trashRequest_(testInboxItem.Folder, myMock, function(){});
//    nextXhr().simulateResponse(200, goog.json.serialize(trashResponse_json));
//    myMock.$verify();
//}

function testLoadUserMail() {
    var user = { email: "user@foobar.com" };
    wat.app.loadUser_();
    nextXhr().simulateResponse(200, goog.json.serialize(user));
    assertEquals("Email should be set after AJAX call", user.email, wat.app.userMail);
}
