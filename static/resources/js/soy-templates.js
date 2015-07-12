// This file was automatically generated from mailOverview.soy.
// Please don't edit this file by hand.

/**
 * @fileoverview Templates in namespace wat.soy.mail.
 */

goog.provide('wat.soy.mail');

goog.require('soy');
goog.require('soydata');


wat.soy.mail.mailOverview = function(opt_data, opt_ignored) {
  return '<div id=' + soy.$$escapeHtml(opt_data.DomID) + ' class="row"><div class="col-md-12"><div class="row entry ' + ((! opt_data.Seen) ? ' newMail ' : '') + '"><div class="col-md-9 content"><div class="subject"><div>' + soy.$$escapeHtml(opt_data.ShortSubject) + '</div></div><div class="from"><div>' + soy.$$escapeHtml(opt_data.ShortFrom) + '</div></div></div><div class="col-md-3 date"><div class="time">' + soy.$$escapeHtml(opt_data.TimeString) + '</div><div class="cal">' + ((opt_data.IsFromToday) ? ' Today ' : ' ' + soy.$$escapeHtml(opt_data.DateString) + ' ') + '</div></div></div><div class="row"><hr class="mail-separator"></div></div></div>';
};
if (goog.DEBUG) {
  wat.soy.mail.mailOverview.soyTemplateName = 'wat.soy.mail.mailOverview';
}
