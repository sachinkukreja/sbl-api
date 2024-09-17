var responseHandler = {
  //Private members used internally, also accesible outside
  sendCustomStatusCode: function (res, statusCode) {
    res.status(statusCode).end();
  },

  sendCustomStatusCodeWithBody: function (res, statusCode, body) {
    res.status(statusCode).json(body);
  },

  //Better abstraction and naming
  sendUnauthorizedError: function (res) {
    res.status(401).end();
  },

  sendSuccessWithBody: function (res, body) {
    res.json(body);
  },

  sendEmptySuccess: function (res) {
    res.status(200).end();
  },

  sendBadRequestError: function (res, body = {}) {
    this.sendCustomStatusCodeWithBody(res, 400, body);
  },
};

module.exports = responseHandler;
