var jwt = require("jwt-simple");
var CryptoJS = require("crypto-js");
var config = require("../config");

var utils = {
  generateToken: function (payload) {
    return jwt.encode(payload, config.auth.tokenSecret);
  },

  getDataFromToken: function (token) {
    return jwt.decode(token, config.auth.tokenSecret);
  },

  decrypt: function (encryptedString) {
    var decrytpedBytes = CryptoJS.AES.decrypt(
      encryptedString,
      config.auth.decryptionKey
    );
    return decrytpedBytes.toString(CryptoJS.enc.Utf8);
  },

  convertToSeoFriendlytag(string) {
    return string.toLowerCase().split(" ").join("-");
  },
};

module.exports = utils;
