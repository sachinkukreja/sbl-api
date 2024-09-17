var orderService = require("../service/order-service.js");
var authService = require("../service/auth-service.js");

module.exports = function (app) {
  app.post("/api/login", authService.login);

  app.get("/api/orders", orderService.getAllOrders);
  app.post("/api/order", orderService.createOrder);
  app.get("/api/order/:reference_id", orderService.getOrderByReferenceId);
  app.get("/api/order::action", (req, res, next) => {
    if (!!req.params.action) {
      switch (req.params.action) {
        case "search":
          orderService.searchOrders(req, res);
          break;
        case "getFilters":
          orderService.getOrderFilters(req, res);
          break;
        default:
          next();
      }
    }
  });
};
