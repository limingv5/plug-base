function PlugBase(config_dir) {
  var urlLib = require("url");
  var QUERY = require("querystring");
  var app = require("connect")();
  var timeout = require("connect-timeout");

  this.app = app;
  this.config_dir = config_dir;
  this.middlewares = [];

  this.app
    .use(timeout("5s"))
    .use(function (req, res, next) {
      var buffer = [];
      req.on("data", function (chunk) {
        buffer.push(chunk);
      });

      req.on("end", function () {
        buffer = Buffer.concat(buffer);
        req.query = {
          _POST: QUERY.parse(buffer.toString()),
          _GET: {}
        };

        var _get = urlLib.parse(req.url).path.match(/([^\?])\?[^\?].*$/);
        if (_get && _get[0]) {
          req.query._GET = QUERY.parse(_get[0].slice(2));
        }

        next();
      });
    });
}
PlugBase.prototype = {
  constructor: PlugBase,
  use: function (middleware, params) {
    this.middlewares.push({
      module: middleware,
      params: params
    });
    return this;
  },
  listen: function (http_port, https_port) {
    http_port = http_port || 80;
    https_port = https_port || 443;

    var fs = require("fs");
    var path = require("path");
    var https = require("https");

    var tls = require("tls");
    var exec = require("child_process").exec;
    var platform = require("os").platform();

    var HTTPS_DIR = path.join(__dirname, "https");
    var rootCA = path.join(HTTPS_DIR, "rootCA.crt");
    var shell;
    if (platform.match(/^win/i)) {
      shell = "certutil -addstore -f \"ROOT\" new-root-certificate.crt";
    }
    else if (platform.match(/darwin/i)) {
      shell = "sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain " + rootCA;
    }
    else {
      // TODO: Linux
    }

    exec(shell, function () {
      console.log("The rootCA is installed!");
    });

    var self = this;

    require("flex-hosts")({}, self.config_dir).once("refreshed", function (hosts) {
      self.middlewares.forEach(function (middleware) {
        middleware.params.hosts = hosts;
        self.app.use(middleware.module(middleware.params, self.config_dir))
      });

      self.app
        .use(require("serve-index")("src", {'icons': true}))
        .listen(http_port, function () {
          console.log("HTTP Server running at http://127.0.0.1:" + http_port);
        });

      https
        .createServer({
          SNICallback: function (domain, SNICallback) {
            var serverPath = path.join(HTTPS_DIR, ".sni");
            if (!fs.existsSync(serverPath)) {
              fs.mkdirSync(serverPath);
            }
            var certPath = path.join(serverPath, domain);
            var key = certPath + ".key";
            var crt = certPath + ".crt";

            if (fs.existsSync(key) && fs.existsSync(crt)) {
              SNICallback(null, tls.createSecureContext({
                key: fs.readFileSync(key, "utf-8"),
                cert: fs.readFileSync(crt, "utf-8")
              }));
            }
            else {
              exec(HTTPS_DIR + "/gen-cer " + domain + ' ' + serverPath, function (err) {
                if (!err) {
                  SNICallback(null, tls.createSecureContext({
                    key: fs.readFileSync(key, "utf-8"),
                    cert: fs.readFileSync(crt, "utf-8")
                  }));
                }
                else {
                  SNICallback(err);
                }
              });
            }
          },
          ca: fs.readFileSync(rootCA, "utf-8")
        }, self.app)
        .listen(https_port, function () {
          console.log("HTTPS Server running at https://127.0.0.1:" + https_port);
        });
    });
  }
};

exports = module.exports = PlugBase;
