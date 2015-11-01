/**
 * Created by lion on 01/11/15.
 */
goog.provide('wat.mail.MailFilter');
goog.provide('wat.mail.QuickSearchFilter');

goog.require('wat.mail');
goog.require('wat.mail.MailItem');
goog.require('goog.array');

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                     Constructor                                              ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @type {function} condition The predicate used to check whether one given MailItem should be
 *                            filtered out according to this filter.
 *                            function: MailItem -> boolean
 *                            True - The mail should not be filtered.
 *                            False - The mail will be filtered out.
 * @constructor
 */
wat.mail.MailFilter = function(condition) {
    this.condition_ = condition;
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private members                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * The condition to be applied for filtering.
 * @type {function} MailItem -> boolean
 */
wat.mail.MailFilter.prototype.condition_;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Public methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 *
 * @param {wat.mail.MailItem[]} input The mails to be filtered.
 * @return {wat.mail.MailItem[]} All mails that remain after the filter has been applied.
 */
wat.mail.MailFilter.prototype.apply = function(input) {
    var self = this;
    return goog.array.filter(input, function(curMail) {
        return self.condition_(curMail);
    });
};


////////////////////////////////////////////////////////////////////////////////////////////////////
///                           QuickSearch Filter Constructor                                     ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * @constructor
 */
wat.mail.QuickSearchFilter = function() {
    goog.base(this, this.quickSearchCondition_);
};
goog.inherits(wat.mail.QuickSearchFilter, wat.mail.MailFilter);

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private members                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 * Value to search for
 * @type {string}
 */
wat.mail.MailFilter.prototype.searchVal;

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                    Public methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 *
 * @param {string} newVal
 */
wat.mail.MailFilter.prototype.updateSearchTerm = function(newVal) {
    this.searchVal = newVal;
};

////////////////////////////////////////////////////////////////////////////////////////////////////
///                                   Private methods                                            ///
////////////////////////////////////////////////////////////////////////////////////////////////////
/**
 *
 * @param {wat.mail.MailItem} curMail
 * @return True - The mail
 */
wat.mail.MailFilter.prototype.quickSearchCondition_ = function(curMail) {
    return goog.string.caseInsensitiveContains(curMail.Mail.Header.Subject, this.searchVal)
        || goog.string.caseInsensitiveContains(curMail.Mail.Header.Sender, this.searchVal);
};

