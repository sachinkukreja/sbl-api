const dotenv = require("dotenv");
dotenv.config();

var config = {
  auth: {
    tokenSecret: process.env.TOKEN_SECRET,
    decryptionKey: process.env.DECRYPTION_KEY,
  },
  mongo: {
    dbUrl: process.env.DB_CONNECTION_STRING,
  },

  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  SB_CREATE_ORDER_URI: process.env.SB_CREATE_ORDER_URI,
};
module.exports = config;
