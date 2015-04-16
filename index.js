var fs = require("fs");
var path = require("path");
var mime = require("mime");
var chalk = require("chalk");

var pkg = require(__dirname + "/package.json");
require("check-update")({
  packageName: pkg.name,
  packageVersion: pkg.version,
  isCLI: process.title == "node"
}, function (err, latestVersion, defaultMessage) {
  if (!err && pkg.version < latestVersion) {
    console.log(defaultMessage);
  }
});

function PlugBase() {
  this.app = require("connect")();
  this.config_dir = null;
  this.rootdir = "src";
  this.hostsMap = {};
  this.middlewares = [];

  var rootCA = "rootCA.crt";
  var favicon = "favicon.ico";

  this.app
    .use(require("connect-timeout")("5s"))
    .use("/~", function (req, res) {
      res.writeHead(200, {
        "Content-Type": "text/html"
      });
      res.write(
        "<style>body{text-align: center}</style>" +
        "<h1>Scan && Install the Root-CA in your mobile devices:</h1>"
      );

      var CAUrl = "http://" + require("ip").address() + "/~" + rootCA;
      var qr = require("qrcode-npm").qrcode(4, 'M');
      qr.addData(CAUrl);
      qr.make();
      res.write(qr.createImgTag(4));
      res.end("<p><a href='" + CAUrl + "'>" + CAUrl + "</a></p>");
    })
    .use("/~" + rootCA, function (req, res) {
      console.log("Downloading " + rootCA);

      res.writeHead(200, {
        "Content-Type": mime.lookup(rootCA),
        "Content-Disposition": "attachment;filename=" + rootCA
      });
      res.end(fs.readFileSync(path.join(__dirname, "https", rootCA), {encoding: null}));
    })
    .use('/' + favicon, function (req, res) {
      res.writeHead(200, {
        "Content-Type": mime.lookup(favicon)
      });
      res.end(fs.readFileSync(path.join(__dirname, "assets", favicon), {encoding: null}));
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

        req.query = {};
        var _get = urlLib.parse(req.url).path.match(/([^\?])\?[^\?].*$/);
        if (_get && _get[0]) {
          req.query = QUERY.parse(_get[0].slice(2));
        }

        buffer = Buffer.concat(buffer);
        req.body = QUERY.parse(buffer.toString());

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
  use: function (router, middleware) {
    if (typeof router == "function") {
      this.middlewares.push([router]);
    }
    else if (typeof middleware == "function") {
      this.middlewares.push([router, middleware]);
    }

    return this;
  },
  listen: function (http_port, https_port, cb) {
    http_port = http_port || 80;

    if (typeof https_port == "function") {
      cb = https_port;
      https_port = null;
    }

    var self = this;

    require("flex-hosts")(this.hostsMap, this.config_dir, function (err, hosts) {
      if (err) {
        console.log(chalk.red("DNS lookup Error!"));
        console.log("You need to set the %s field by yourself!\n", chalk.yellow("hosts"));
        hosts = {};
      }

      var util = require("util");
      var defaultHost = "127.0.0.1";

      self.middlewares.forEach(function (middleware) {
        if (util.isArray(middleware)) {
          self.app.use.apply(self.app, middleware);
        }
        else if (typeof middleware.module == "function") {
          middleware.params.hosts = hosts;
          middleware.params.rootdir = middleware.params.rootdir || self.rootdir;
          self.app.use(middleware.module(middleware.params, self.config_dir));
        }
      });

      self.app
        .use(require("serve-index")(self.rootdir, {icons: true}))
        .use(require("serve-static")(self.rootdir, {
          index: false,
          setHeaders: function (res, path) {
            res.setHeader("Content-Type", mime.lookup(path));
          }
        }))
        .listen(http_port, function () {
          console.log("HTTP Server running at", chalk.cyan("http://" + defaultHost + ':' + http_port));
          typeof cb == "function" && cb(http_port);
        });

      if (https_port) {
        var exec = require("child_process").exec;
        var platform = require("os").platform();

        var HTTPS_DIR = path.join(__dirname, "https");
        var rootCA = path.join(HTTPS_DIR, "rootCA.crt");
        var serverPath = path.join(HTTPS_DIR, ".sni");
        var genCert = HTTPS_DIR + "/gen-cer.sh";

        if (!fs.existsSync(serverPath)) {
          fs.mkdirSync(serverPath);
          fs.chmod(serverPath, 0777);
        }

        // init CMD

        var InstallRootCA;
        if (platform.match(/^win/i)) {
          InstallRootCA = "certutil -addstore -f \"ROOT\" new-root-certificate.crt";
          genCert = HTTPS_DIR + "/gen-cer.bat";
        }
        else if (platform.match(/darwin/i)) {
          InstallRootCA = "sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain " + rootCA;
        }
        else {
          // TODO: Linux
        }
        InstallRootCA && exec(InstallRootCA, function () {
          console.log(chalk.green("The rootCA is installed!"));
        });

        exec([genCert, defaultHost, serverPath].join(' '), function (err) {
          if (!err) {
            var default_key = path.join(serverPath, defaultHost + ".key");
            var default_crt = path.join(serverPath, defaultHost + ".crt");

            fs.chmod(default_key, 0777);
            fs.chmod(default_crt, 0777);

            function log(domain) {
              console.log("HTTPS Server running at", chalk.yellow("https://" + domain + ':' + https_port));
            }

            require("https")
              .createServer({
                SNICallback: function (domain, SNICallback) {
                  var createSecureContext = require("tls").createSecureContext;

                  if (!(typeof SNICallback == "function" && createSecureContext)) {
                    console.log(
                      "Your Node.js %s support %s, please %s your Node.js >= 0.11",
                      chalk.yellow("IS NOT"),
                      chalk.magenta("Async SNI"),
                      chalk.green("UPDATE")
                    );
                    return;
                  }

                  var certPath = path.join(serverPath, domain);
                  var key = certPath + ".key";
                  var crt = certPath + ".crt";

                  if (fs.existsSync(key) && fs.existsSync(crt)) {
                    SNICallback(null, createSecureContext({
                      key: fs.readFileSync(key, "utf-8"),
                      cert: fs.readFileSync(crt, "utf-8")
                    }));
                  }
                  else {
                    exec([genCert, domain, serverPath].join(' '), function (err) {
                      if (!err) {
                        SNICallback(null, createSecureContext({
                          key: fs.readFileSync(key, "utf-8"),
                          cert: fs.readFileSync(crt, "utf-8")
                        }));
                        fs.chmod(key, 0777);
                        fs.chmod(crt, 0777);
                        log(domain);
                      }
                      else {
                        SNICallback(err);
                      }
                    });
                  }
                },
                key: fs.readFileSync(default_key, "utf-8"),
                cert: fs.readFileSync(default_crt, "utf-8"),
                ca: fs.readFileSync(rootCA, "utf-8")
              }, self.app)
              .listen(https_port, function () {
                typeof cb == "function" && cb(https_port);
                log(defaultHost);
              });

            var domains = Object.keys(hosts);
            domains.push("localhost");
            domains.forEach(function (domain) {
              exec([genCert, domain, serverPath].join(' '), function () {
                fs.chmod(path.join(serverPath, domain + ".key"), 0777);
                fs.chmod(path.join(serverPath, domain + ".crt"), 0777);
                log(domain);
              });
            });
          }
          else {
            console.log(err);
          }
        });
      }
    });
  }
};

exports = module.exports = new PlugBase();
