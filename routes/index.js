var orderService = require("../service/order-service.js");
var authService = require("../service/auth-service.js");

module.exports = function (app) {
  app.post("/api/login", authService.login);
  app.post("/api/introspect", authService.introspect);

  app.get("/api/orders", orderService.getAllOrders);
  app.post("/api/order", orderService.createOrder);
  app.get("/api/order/:reference_id", orderService.getOrderByReferenceId);
  app.put("/api/order[:]marklabelprinted", orderService.markLabelPrinted);
  app.get("/api/order[:]search", orderService.searchOrders);
  app.get("/api/order[:]getFilters", orderService.getOrderFilters);

  app.post("/api/order[:]createLabel", orderService.createLabel);
};
