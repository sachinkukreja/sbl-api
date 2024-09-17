const dbHandler = require("../handlers/databaseHandler");
var bcrypt = require("bcrypt");
const responseHandler = require("../handlers/responseHandler");
const utils = require("../utils");

var authService = {
  login: async (req, res) => {
    var query = { username: req.body.username };
    dbHandler.getOne("merchants", query).then(
      (_user) => {
        //on successfull DB Query compare password hashes

        let password = utils.decrypt(req.body.password);
        bcrypt.compare(password, _user.password).then((isPasswordCorrect) => {
          if (isPasswordCorrect) {
            //If hash matches send token and user data without the password
            let token = utils.generateToken(_user);
            delete _user.password;
            res.status(200).json({ token: token });
          } else
            responseHandler.sendBadRequestError(res, {
              error: "Email and password do not match!",
            });
        });
      },
      (error) => {
        console.log(error);
        //username and password does not match
        responseHandler.sendBadRequestError(res, {
          error: "Invalid username!",
        });
      }
    );
  },
};
module.exports = authService;
