const { default: axios, AxiosError, Axios } = require("axios");
const dbHandler = require("../handlers/databaseHandler");
const responseHandler = require("../handlers/responseHandler");
var monk = require("monk");
const fs = require("fs");
const AWS = require("aws-sdk");
const path = require("path");
const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  SB_CREATE_ORDER_URI,
} = require("../config");

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

        //check if we should create an order on Shipbob
        if (!!merchant.config && !!merchant.config.create_order_on_import) {
          try {
            let response = await axios({
              method: "post",
              url: SB_CREATE_ORDER_URI,
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
  modifyOrder: async (req, res) => {
    let requiredOrderDetails = validateNewOrderRequest(req.body, res);
    if (!!requiredOrderDetails) {
      let modified_order = {
        ...requiredOrderDetails,
        ...req.body,
      };
      delete modified_order._id;
      delete modified_order.merchant_id;
      delete modified_order._created_at;
      try {
        let modifiedOrder = await dbHandler.modify(
          "interim_orders",
          {
            _id: monk.id(req.body._id),
            merchant_id: monk.id(req.merchant._id),
          },
          modified_order
        );

        if (!!modifiedOrder) {
          responseHandler.sendSuccessWithBody(res, modifiedOrder);
        } else {
          console.log("err", modifiedOrder);
          responseHandler.sendBadRequestError(res, {});
        }
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
  createLabel: async (req, res) => {
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
        try {
          let response = await axios({
            method: "post",
            url: SB_CREATE_ORDER_URI,
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
          let isPDF =
            !!req.headers["label-type"] &&
            req.headers["label-type"] === "application/pdf";
          let label_url = await uploadtoS3(insertedOrder, isPDF);
          response.label = label_url;
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

      let sortQueryParam = !!req.query.sort ? JSON.parse(req.query.sort) : {};

      let sortQueryDB = !!sortQueryParam
        ? { ...sortQueryParam, _created_at: -1 }
        : { _created_at: -1 };

      let data = await dbHandler.get("interim_orders", filterQuery, {
        limit: page_size,
        skip: (page - 1) * page_size,
        sort: sortQueryDB,
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
    if (!!req.query && !!req.query.search_term) {
      try {
        let response = await dbHandler
          .get("interim_orders", {
            $or: [
              { "order.reference_id": { $regex: req.query.search_term } },
              { "meta.order_number": { $regex: req.query.search_term } },
              {
                "order.recipient.name": {
                  $regex: req.query.search_term,
                  $options: "i",
                },
              },
              {
                "meta.customer_name": {
                  $regex: req.query.search_term,
                  $options: "i",
                },
              },
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
  generatePickList: async (req, res) => {
    let orders = !!req.body.orders ? req.body.orders : [];
    if (!!orders && orders.length > 0) {
      let interim_orders = await dbHandler.aggregate("interim_orders", [
        {
          $match: {
            merchant_id: monk.id(req.merchant._id),
            "order.reference_id": { $in: orders },
          },
        },
        {
          $unwind: {
            path: "$order.products",
          },
        },
        {
          $group: {
            _id: {
              sku: "$order.products.sku",
            },
            name: {
              $last: "$order.products.name",
            },
            quantity: {
              $sum: "$order.products.quantity",
            },
          },
        },
        {
          $project: {
            _id: 0,
            sku: "$_id.sku",
            name: 1,
            quantity: 1,
          },
        },
      ]);
      responseHandler.sendSuccessWithBody(res, interim_orders);
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

const uploadtoS3 = async (order, isPDF) => {
  let fileFormat = order._id + (!!isPDF ? ".pdf" : ".zpl");
  const labelFilePath = path.join(__dirname, "..", "labels", fileFormat);
  AWS.config.update({
    region: "us-east-1",
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  });
  const s3 = new AWS.S3();

  return new Promise(async (resolve, reject) => {
    let sb_created_At = getFormattedDate(order.sb_created_At);
    let zpl = `^XA
    ^FX Top section with logo, name and address.
    ^CF0,60
    ^FO50,50^GFA,1023,1023,11,,O01F8,O07FE,N01IF8,N07IFE,N0KF,M03KFC,M0MF,L03MFC,L0OF,K01OF8,K07OFE,J01QF8,J07QFC,J0LF0KFC,I03KFC03JFE,I0LF801JFE,003KFEI07IFE,00LF8I01IFE,01KFEK07FFC,07KFCK03FFC,1LFM0FF803F8,3KFCM03E00FFC,7KFQ01FFE,7JFCQ07FFE,KF8P01JF,JFEQ07JF,KF8O01KF,7JFCO03KF,7KFO0LF,3KFCM03LF,1LFM0MF,07KF8K01MF,01KFEK07MF,00LF8I01NF,003KFEI07NF,I0LF801OF,I03KFC03KFDIF,I01LF0LF9IF,J07QFE1IF,J01QF81IF,1FC007OFE01IF,3FE001OF801IF,7FFI0OF001IF,7FFI03MFC001IF,IF8I0MFI01IF,IF8I03KFCI01IF,IF8I01KF8I01IF,IF8J07IFEJ01IF,IF8J01IF8J01IF,IF8K07FEK01IF,IF8K01F8K01IF,IF8S01IF,::::::::::IFCS03IF,IFES07IF,JF8Q01JF,JFEQ07JF,KF8O01KF,7JFCO03JFE,7KFO0KFE,3KFCM03KFC,1LFM0LF8,07KF8K01KFE,01KFEK07KF8,00LF8I01LF,003KFEI07KFC,I0LF801LF,I03KFC03KFC,J0LF0LF,J07QFE,J01QF8,K07OFE,K01OF8,L0OF,L03MFC,M0MF,M03KFC,N0KF,N07IFE,N01IF8,O07FE,O01F8,,^FS
    ^FO220,50^FDShipBob Logistics^FS
    ^CF0,30
    ^FO220,115^FD5900 W Ogden Ave^FS
    ^FO220,155^FDCicero IL 60804^FS
    ^FO220,195^FDUnited States (USA)^FS
    ^FO50,250^GB700,3,3^FS
    
    ^FX Second section with recipient address and permit information.
    
    ^FO50,300^FD${order.order.recipient.name}^FS
    ^FO50,340^FD${order.order.recipient.address.address1}^FS
    ^FO50,380^FD${order.order.recipient.address.address2}^FS
    ^FO50,420^FD${order.order.recipient.address.city} ${order.order.recipient.address.state} ${order.order.recipient.address.zip_code}^FS
    ^FO50,460^FD${order.order.recipient.address.country}^FS
    
    ^FO50,520^GB700,3,3^FS
    
    ^FX Third section with bar code.
    ^BY5,2,270
    ^FO70,550^BC^FD${order.shipment_id}^FS
    
    ^FX Fourth section (the two boxes on the bottom).
    ^FO50,900^GB700,250,3^FS
    ^FO400,900^GB3,250,3^FS
    ^CF0,20
    ^FO75,940^FD^FS
    ^FO75,990^FDShipment ID: ${order.shipment_id}^FS
    ^FO75,1040^FDOrder Number: ${order.meta.order_number}^FS
    ^FO75,1090^FDOrder Date: ${sb_created_At}^FS
    ^CF0,190
    ^FO470,955
    ^BQN,2,10
    ^FDQA,${order.shipment_id}^FS
    ^FS
    
    ^FO470,650
    ^BQN,2,10
    ^FDQA,${order.shipment_id}^FS
    
    ^XZ`;

    let pdf = zpl;
    if (!!isPDF) {
      pdf = await axios({
        method: "post",
        url: "http://api.labelary.com/v1/printers/8dpmm/labels/4x6",
        data: zpl,
        headers: {
          Accept: "application/pdf",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        responseType: "arraybuffer",
      });
    }

    await fs.promises.writeFile(labelFilePath, !!isPDF ? pdf.data : zpl);

    const params = {
      Bucket: "sb-labels",
      Key: fileFormat,
      Body: fs.createReadStream(labelFilePath),
    };

    s3.upload(params, async (err, data) => {
      if (err) {
        reject(err);
      } else {
        await fs.promises.unlink(path.join(labelFilePath));
        delete params.Body;
        params.Expires = 604800;
        let signedUrl = await s3.getSignedUrlPromise("getObject", params);
        resolve(signedUrl);
      }
    });
  });
};

const createSbOrder = async (order) => {
  return new Promise((resolve, reject) => {});
};
const getFormattedDate = (_date) => {
  let date = new Date(_date);
  var year = date.getFullYear();

  var month = (1 + date.getMonth()).toString();
  month = month.length > 1 ? month : "0" + month;

  var day = date.getDate().toString();
  day = day.length > 1 ? day : "0" + day;

  return month + "/" + day + "/" + year;
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
