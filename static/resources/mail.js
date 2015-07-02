/**
 *
 * Created by lion on 30/06/15.
 */
goog.provide('wat.mail');
goog.require('wat');
goog.require('goog.dom');

wat.mail.Mail = function(jsonData) {
    this.Date = jsonData.Date;
    this.Folder = jsonData.Folder;
    this.Receiver = jsonData.Receiver;
    this.Sender = jsonData.Sender;
    this.Size = jsonData.Size;
    this.Subject = jsonData.Subject;
};

wat.mail.Mail.prototype.Date = null;
wat.mail.Mail.prototype.Folder = null;
wat.mail.Mail.prototype.Receiver = null;
wat.mail.Mail.prototype.Sender = null;
wat.mail.Mail.prototype.Size = null;
wat.mail.Mail.prototype.Subject = null;

wat.mail.Mail.prototype.renderMail = function() {
    var cells = [
            goog.dom.createDom('td', {}, goog.dom.createTextNode(this.Size)),
            goog.dom.createDom('td', {}, goog.dom.createTextNode(this.Date)),
            goog.dom.createDom('td', {}, goog.dom.createTextNode(this.Subject)),
            goog.dom.createDom('td', {}, goog.dom.createTextNode(this.Sender)),
            goog.dom.createDom('td', {}, goog.dom.createTextNode(this.Receiver))
        ],
        mailRow = goog.dom.createDom('tr', {}, cells),
        tableElem = goog.dom.getElement("mailTable");
    /*
     <tr>
     <td>{{ $curMail.Header.Size }}</td>
     <td>{{ $curMail.Header.Date }}</td>
     <td>{{ $curMail.Header.Subject }}</td>
     <td>{{ $curMail.Header.Sender }}</td>
     <td>{{ $curMail.Header.Receiver }}</td>
     </tr>
     */
    goog.dom.appendChild(tableElem, mailRow);
};
