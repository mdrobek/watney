// This file was automatically generated from mailOverview.soy.
// Please don't edit this file by hand.

/**
 * @fileoverview Templates in namespace wat.soy.mail.
 */

goog.provide('wat.soy.mail');

goog.require('soy');
goog.require('soydata');


wat.soy.mail.mailOverview = function(opt_data, opt_ignored) {
  return '<div class="row mail-overview-entry"><div class="col-md-12" style="padding: 0"><div class="col-md-3 mail-overview-entry-date"><div style="font-size: 25px;">' + soy.$$escapeHtml(opt_data.Time) + '</div><div style="font-size: 18px;">' + soy.$$escapeHtml(opt_data.Date) + '</div></div><div class="col-md-9 mail-overview-entry-from"><div>' + soy.$$escapeHtml(opt_data.From) + '</div></div><div class="col-md-12 mail-overview-entry-subject"><div>' + soy.$$escapeHtml(opt_data.Subject) + '</div></div></div></div>';
};
if (goog.DEBUG) {
  wat.soy.mail.mailOverview.soyTemplateName = 'wat.soy.mail.mailOverview';
}
