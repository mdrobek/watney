/**
 * Created by mdrobek on 22/09/15.
 */
goog.provide('wat.testing');
goog.setTestOnly('wat.testing');
goog.provide('wat.testing.MailJson');
goog.setTestOnly('wat.testing.MailJson');
goog.provide('wat.testing.ContentJson');
goog.setTestOnly('wat.testing.ContentJson');

wat.testing = {};

wat.testing.MailJson = {
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
        SpamIndicator: 6,
        Subject: "TestMail"
    },
    Flags: {
        Seen : false,
        Deleted : false,
        Answered : true,
        Flagged : false,
        Draft : true,
        Recent : false
    },
    Content: null
};

wat.testing.ContentJson = {
    "text/plain": {
        Charset : "UTF-8",
        Encoding : "quoted-printable",
        Body : "some plain text"
    },
    "text/html": {
        Charset : "UTF-8",
        Encoding : "quoted-printable",
        Body : "<div>Same text as html</div>"
    }
};
