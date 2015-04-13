var fs = require("fs");
var path = require("path");

function PlugBase() {
  this.app = require("connect")();
  this.config_dir = null;
  this.rootdir = "src";
  this.hostsMap = {};
  this.middlewares = [];

  this.app
    .use(require("connect-timeout")("5s"))
    .use(function (req, res, next) {
      if (/^\/favicon\.ico$/.test(req.url)) {
        res.writeHead(200, {
          "Content-Type": "image/x-icon"
        });
        res.end(fs.readFileSync(path.join(__dirname, "assets/favicon.ico")));
      }
      else {
        next();
      }
    })
    .use(function (req, res, next) {
      req.url = decodeURI(req.url);

      var buffer = [];
      req.on("data", function (chunk) {
        buffer.push(chunk);
      });

      req.on("end", function () {
        var urlLib = require("url");
        var QUERY = require("querystring");

        req.body = {};

        var _get = urlLib.parse(req.url).path.match(/([^\?])\?[^\?].*$/);
        if (_get && _get[0]) {
          req.body = QUERY.parse(_get[0].slice(2));
        }

        buffer = Buffer.concat(buffer);
        var post = QUERY.parse(buffer.toString());
        for (var k in post) {
          req.body[k] = post[k];
        }

        next();
      });
    });
}
PlugBase.prototype = {
  constructor: PlugBase,
  config: function (config_dir) {
    this.config_dir = config_dir;
  },
  root: function (rootdir) {
    this.rootdir = rootdir;
  },
  hosts: function (hosts) {
    this.hostsMap = hosts;
  },
  plug: function (module, params) {
    this.middlewares.push({
      module: module,
      params: (params && typeof params == "object") ? JSON.parse(JSON.stringify(params)) : {}
    });
    return this;
  },
  use: function (middleware) {
    this.middlewares.push(middleware);
    return this;
  },
  listen: function (http_port, https_port, cb) {
    http_port = http_port || 80;

    if (typeof https_port == "function") {
      cb = https_port;
      https_port = 443;
    }

    var https = require("https");
    var tls = require("tls");
    var exec = require("child_process").exec;
    var platform = require("os").platform();

    var HTTPS_DIR = path.join(__dirname, "https");
    var rootCA = path.join(HTTPS_DIR, "rootCA.crt");
    var serverPath = path.join(HTTPS_DIR, ".sni");

    if (!fs.existsSync(serverPath)) {
      fs.mkdirSync(serverPath);
      fs.chmod(serverPath, 0777);
    }
    fs.readdir(serverPath, function (err, files) {
      if (!err) {
        files.forEach(function (file) {
          fs.unlink(path.join(serverPath, file));
        });
      }
    });

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

    require("flex-hosts")(this.hostsMap, this.config_dir, function (hosts) {
      self.middlewares.forEach(function (middleware) {
        if (typeof middleware == "function") {
          self.app.use(middleware);
        }
        else if (typeof middleware.module == "function") {
          middleware.params.hosts = hosts;
          middleware.params.rootdir = middleware.params.rootdir || self.rootdir;
          self.app.use(middleware.module(middleware.params, self.config_dir));
        }
      });

      self.app
        .use(require("serve-index")(self.rootdir, {icons: true}))
        .use(require("serve-static")(self.rootdir, {index: false}))
        .listen(http_port, function () {
          console.log("HTTP Server running at http://127.0.0.1:" + http_port);
          typeof cb == "function" && cb(http_port);
        });

      https
        .createServer({
          SNICallback: function (domain, SNICallback) {
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
                  fs.chmod(key, 0777);
                  fs.chmod(crt, 0777);
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
          typeof cb == "function" && cb(https_port);
        });
    });
  }
};

exports = module.exports = new PlugBase();
