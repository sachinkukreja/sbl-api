var config = require("../config/index");
var monk = require("monk");
// @ts-ignore
var db = monk(config.mongo.dbUrl);
db.catch((err) => {
  console.log(err);
});

var dbHandler = {
  get: function (collectionName, query, fieldparams) {
    return new Promise((resolve, reject) => {
      db.get(collectionName)
        .find(query, fieldparams)
        .then(function (data) {
          resolve(data);
        })
        .catch(function (error) {
          reject(error);
        });
    });
  },
  getOne: function (collectionName, query, fieldparams) {
    return new Promise((resolve, reject) => {
      db.get(collectionName)
        .findOne(query, fieldparams)
        .then(function (data) {
          if (data) resolve(data);
          else reject("Record not found");
        })
        .catch(function (error) {
          reject(error);
        });
    });
  },
  insert: function (collectionName, data) {
    return new Promise((resolve, reject) => {
      data._created_at = new Date();
      data._updated_at = new Date();
      db.get(collectionName)
        .insert(data)
        .then(
          (data) => {
            resolve(data);
          },
          (error) => {
            reject(error);
          }
        );
    });
  },
  remove: function (collectionName, query) {
    return new Promise((resolve, reject) => {
      db.get(collectionName)
        .findOneAndDelete(query)
        .then(
          (data) => {
            resolve(data);
          },
          (error) => {
            reject(error);
          }
        );
    });
  },
  modify: function (collectionName, query, updatedValues) {
    return new Promise((resolve, reject) => {
      updatedValues._updated_at = new Date();
      db.get(collectionName)
        .findOneAndUpdate(query, { $set: { ...updatedValues } })
        .then(
          (data) => {
            resolve(data);
          },
          (error) => {
            reject(error);
          }
        );
    });
  },
  aggregate: function (collectionName, piplineArray) {
    return new Promise((resolve, reject) => {
      db.get(collectionName)
        .aggregate(piplineArray)
        .then(function (data) {
          if (data.length >= 1) resolve(data);
          else reject(data);
        })
        .catch(function (error) {
          reject(error);
        });
    });
  },
  count: function (collectionName, query) {
    return new Promise((resolve, reject) => {
      db.get(collectionName)
        .count(query)
        .then(function (data) {
          resolve(data);
        })
        .catch(function (error) {
          reject(error);
        });
    });
  },
  distinct: function (collectionName, field, query) {
    return new Promise((resolve, reject) => {
      db.get(collectionName)
        .distinct(field, query)
        .then(function (data) {
          resolve(data);
        })
        .catch(function (error) {
          reject(error);
        });
    });
  },
};

module.exports = dbHandler;
