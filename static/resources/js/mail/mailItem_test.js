/**
 * Created by mdrobek on 16/09/15.
 */
goog.provide('wat.mail.MailTest');
goog.setTestOnly('wat.mail.MailTest');

goog.require('wat');
goog.require('wat.app');
goog.require('wat.mail.MailItem');
goog.require('goog.structs.Map');
goog.require('goog.testing.net.XhrIo');
goog.require('goog.testing.jsunit');
goog.require('goog.testing.events');
goog.require('goog.testing.FunctionMock');

var testINBOXItem = new wat.mail.MailItem({
    UID: 1,
    Header: {
        Date: "2015-09-18T11:49:06-07:00",
        Folder: "/",
        Size: 1234,
        MimeHeader: {
            MimeVersion: 1,
            ContentType: "text/plain",
            Encoding: "quoted-printable",
            MultipartBoundary: ""
        },
        Sender: "foo@bar.de",
        Receiver: "mark@watney.de",
        Subject: "TestMail"
    },
    Flags: {
        Seen : true,
        Deleted : false,
        Answered : true,
        Flagged : false,
        Draft : true,
        Recent : false
    },
    Content: new goog.structs.Map({
        "text/plain": "Some text"
    })
}, "/");

function setUp() {
    wat.xhr = goog.testing.net.XhrIo;
}

function tearDown() {
    wat.xhr = goog.net.XhrIo;
    goog.dom.removeChildren(goog.dom.getElement("mailItems"));
}

function testRenderMailItem() {
    var myMock = new goog.testing.FunctionMock();
    myMock(testINBOXItem);
    myMock.$replay();
    testINBOXItem.renderMail(myMock, true);
    assertEquals("Should have one mail item in the list", 1,
        goog.dom.getChildren(goog.dom.getElement("mailItems")).length);
    goog.testing.events.fireClickEvent(goog.dom.getElement(testINBOXItem.DomID));
    // Mock function should have been called after click event with mailItem
    myMock.$verify();
}


function testLoadUserMail() {
    var user = { email: "user@foobar.com" };
    wat.app.loadUser_();
    var curXhrInstance = goog.testing.net.XhrIo.getSendInstances()[0];
    curXhrInstance.simulateResponse(200, goog.json.serialize(user));
    assertEquals("Email should be set after AJAX call", user.email, wat.app.userMail);
}
