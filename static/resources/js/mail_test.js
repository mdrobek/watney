/**
 * Created by mdrobek on 16/09/15.
 */
goog.provide('wat.mail.MailTest');
goog.setTestOnly('wat.mail.MailTest');

goog.require('wat');
goog.require('wat.app');
goog.require('wat.mail.MailItem');
goog.require('goog.net.XhrIo');
goog.require('goog.testing.net.XhrIo');
goog.require('goog.testing.jsunit');


function setUp() {
    wat.xhr = goog.testing.net.XhrIo;
}

function tearDown() {
    wat.xhr = goog.net.XhrIo;
}

function testLoadUserMail() {
    var user = { email: "user@foobar.com" };
    wat.app.loadUser_();
    var curXhrInstance = goog.testing.net.XhrIo.getSendInstances()[0];
    curXhrInstance.simulateResponse(200, goog.json.serialize(user));
    assertEquals("Email should be set after AJAX call", user.email, wat.app.userMail);
}
