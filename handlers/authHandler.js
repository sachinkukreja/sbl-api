const responseHandler = require("./responseHandler.js");
var utils = require("../utils");

module.exports = function (req, res, next) {
  if (req.url.includes("login")) {
    next();
    return;
  }

  var token = req.headers["authorization"];
  if (token) {
    try {
      req.merchant = utils.getDataFromToken(token);
      next();
    } catch (error) {
      var body = {
        title: "Access Denied",
        msg: "Unauthorized Token, You are not allowed access to this endpoint",
      };
      responseHandler.sendCustomStatusCodeWithBody(res, 401, body);
    }
  } else {
    var body = {
      title: "Access Denied",
      msg: "Invalid Token, Please make sure that the Authorization Header is present",
    };
    responseHandler.sendCustomStatusCodeWithBody(res, 403, body);
  }
};
