const { default: axios, AxiosError } = require("axios");
const dbHandler = require("../handlers/databaseHandler");
const responseHandler = require("../handlers/responseHandler");
var monk = require("monk");
const { convertToSeoFriendlytag } = require("../utils");
// const puppeteer = require("puppeteer");
var orderService = {
  createOrder: async (req, res) => {
    let requiredOrderDetails = validateNewOrderRequest(req.body, res);
    if (!!requiredOrderDetails) {
      var interim_order = {
        merchant_id: "",
        label_printed: false,
        shipment_id: 0,
        sb_created: false,
        sb_created_At: "",
        ...requiredOrderDetails,
      };

      try {
        let merchant = await dbHandler.getOne("merchants", {
          _id: req.merchant._id,
        });

        interim_order.merchant_id = merchant._id;

        if (!!merchant.config && !!merchant.config.create_order_on_import) {
          try {
            let response = await axios({
              method: "post",
              url: " https://gateway-stage.shipbob.dev/experimental/order/transportation",
              data: {
                ...requiredOrderDetails.order,
              },
              headers: {
                Authorization: `Bearer ${merchant.config.sb_PAT}`,
                shipbob_channel_id: `${merchant.config.sb_channel_id}`,
              },
            });
            let shipment_id =
              !!response.data && !!response.data.shipment_id
                ? response.data.shipment_id
                : 0;
            interim_order.shipment_id = shipment_id;
            interim_order.sb_created_At = new Date().toISOString();
            interim_order.sb_created = true;
          } catch (err) {
            if (err instanceof AxiosError)
              responseHandler.sendCustomStatusCodeWithBody(
                res,
                err.status,
                err.response?.data
              );
            else responseHandler.sendBadRequestError(res);

            return;
          }
        }

        let insertedOrder = await dbHandler.insert(
          "interim_orders",
          interim_order
        );
        let response = {
          interim_order_id: insertedOrder._id,
          reference_id: insertedOrder.order.reference_id,
        };
        if (!!interim_order.shipment_id)
          response.shipment_id = interim_order.shipment_id;

        if (!!insertedOrder) {
          responseHandler.sendSuccessWithBody(res, response);
        } else responseHandler.sendBadRequestError(res, {});
      } catch (error) {
        if (!!error.name && error.name === "MongoError") {
          if (error.code === 11000)
            responseHandler.sendBadRequestError(res, {
              errors: [
                `An order with refernce_id ${requiredOrderDetails.order.reference_id} already exists`,
              ],
            });
          else
            responseHandler.sendBadRequestError(res, {
              errors: [error.message],
            });
        } else responseHandler.sendBadRequestError(res, error);
      }
    }
  },
  getAllOrders: async (req, res) => {
    let page = 1;
    let page_size = 25;
    let filterQuery = {
      merchant_id: monk.id(req.merchant._id),
    };
    try {
      if (!!req.query.page) page = parseInt(req.query.page);
      if (!!req.query.page_size) page_size = parseInt(req.query.page_size);
      if (!!req.query.stores)
        filterQuery["meta.customer_name"] = {
          $in: req.query.stores.split(","),
        };
      if (
        !!req.query.label_printed &&
        (req.query.label_printed === "true" ||
          req.query.label_printed === "false")
      )
        filterQuery["label_printed"] = req.query.label_printed === "true";

      let count = await dbHandler.count("interim_orders", filterQuery);

      let data = await dbHandler.get("interim_orders", filterQuery, {
        limit: page_size,
        skip: (page - 1) * page_size,
        sort: { _created_at: -1 },
      });
      responseHandler.sendSuccessWithBody(res, { orders: data, count });
    } catch (error) {
      responseHandler.sendBadRequestError(res, error);
    }
  },
  getOrderByReferenceId: async (req, res) => {
    if (!!req.params.reference_id) {
      try {
        let response = await dbHandler.getOne("interim_orders", {
          "order.reference_id": req.params.reference_id,
          merchant_id: monk.id(req.merchant._id),
        });
        if (!!response) responseHandler.sendSuccessWithBody(res, response);
      } catch (error) {
        responseHandler.sendBadRequestError(res);
      }
    } else
      responseHandler.sendBadRequestError(res, {
        message: "Refernce Id not provided",
      });
  },
  searchOrders: async (req, res) => {
    if (!!req.query && !!req.query.reference_id) {
      try {
        let response = await dbHandler
          .get("interim_orders", {
            $or: [
              { "order.reference_id": { $regex: req.query.reference_id } },
              { "meta.order_number": { $regex: req.query.reference_id } },
            ],
            merchant_id: monk.id(req.merchant._id),
          })
          .catch();
        if (!!response) responseHandler.sendSuccessWithBody(res, response);
        else responseHandler.sendCustomStatusCodeWithBody(res, 404);
      } catch (error) {
        responseHandler.sendBadRequestError(res);
      }
    } else {
      responseHandler.sendBadRequestError(res, {
        message: "Unable to find search params",
      });
    }
  },
  getOrderFilters: async (req, res) => {
    let customer_names = await dbHandler.distinct(
      "interim_orders",
      "meta.customer_name",
      { merchant_id: monk.id(req.merchant._id) }
    );

    let filters = {
      store: { display_name: "Store Name", data: customer_names },
    };
    responseHandler.sendSuccessWithBody(res, filters);
  },
  markLabelPrinted: async (req, res) => {
    if (!!req.body._id) {
      let order = await dbHandler.modify(
        "interim_orders",
        { _id: req.body._id },
        { label_printed: true }
      );
      if (!!order) {
        responseHandler.sendSuccessWithBody(res, {
          _id: order._id,
          updated_At: order._updated_at,
        });
      }
    } else responseHandler.sendBadRequestError(res);
  },
};

const validateNewOrderRequest = (order_request, res) => {
  let meta = order_request.meta;
  let order = order_request.order;
  let errors = [];
  if (!!!order.reference_id) {
    errors.push("order.reference_id is a required field");
  }
  if (!!!meta.customer_name) {
    errors.push("meta.customer_name is a required field");
  }
  if (!!!meta.order_number) {
    errors.push("meta.order_number is a required field");
  }
  if (!!!meta.order_id) {
    errors.push("meta.order_id is a required field");
  }
  if (errors.length > 0) {
    responseHandler.sendBadRequestError(res, { errors });
    return;
  }
  return { meta, order };
};

const buildFilterQuery = (filters, filterQuery) => {
  let _filters = filters.split("$");
  _filters.map((filter) => {
    if (filter.length > 0) {
      let filterObjects = filter.split(":");
      if (filterObjects.length > 1) {
        if (filterObjects[0] === "store")
          filterQuery["meta.customer_name"] = { $in: ["Mongo"] };
      }
    }
  });
  return filterQuery;
};

module.exports = orderService;

// async function generatePDFfromHTML(htmlContent, outputPath) {
//   const browser = await puppeteer.launch();
//   const page = await browser.newPage();
//   await page.setContent(htmlContent);
//   await page.pdf({ path: outputPath, format: "A4" });
//   await browser.close();
// }

// const htmlContent =
// "<h1>Hello World</h1><p>This is custom HTML content.</p>";
// generatePDFfromHTML(htmlContent, "custom.pdf")
// .then((data) => {
//   console.log("PDF generated successfully");
//   responseHandler.sendSuccessWithBody(res, data);
// })
// .catch((err) => console.error("Error generating PDF:", err));
