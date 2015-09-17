/**
 * Created by lion on 30/06/15.
 */
goog.provide('wat');

goog.require('goog.net.XhrIo');

/**
 * @type {goog.net.XhrIo || goog.testing.net.XhrIo} Instance used to create new XmlHttpRequests.
 */
wat.xhr = goog.net.XhrIo;
