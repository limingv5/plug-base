var fs = require("fs");
var path = require("path");
var mime = require("mime");
var net = require("net");
var chalk = require("chalk");
var ipLib = require("ip");

function PlugBase() {
  this.app = require("connect")();
  this.confdir = null;
  this.rootdir = null;
  this.hostsMap = {};
  this.hostsFlag = true;
  this.webFlag = true;
  this.middlewares = [];

  this.HTTPS_DIR = path.join(__dirname, "https");
  this.serverPath = path.join(this.HTTPS_DIR, ".sni");
  this.rootCA = path.join(this.HTTPS_DIR, "rootCA.crt");

  this.root(__dirname);
  this.app.use(require("connect-timeout")("60s"));
}
PlugBase.prototype = {
  constructor: PlugBase,
  dir: function (dir) {
    dir = dir || '';
    if (dir.indexOf('/') == 0 || /^\w{1}:[\\/].*$/.test(dir)) {
      return path.normalize(dir);
    }
    else {
      return path.normalize(path.join(process.cwd(), dir));
    }
  },
  config: function (confdir) {
    this.confdir = this.dir(confdir);
  },
  root: function (rootdir) {
    this.rootdir = this.dir(rootdir);
  },
  hosts: function (hosts) {
    this.hostsMap = hosts || {};
  },
  clearCerts: function () {
    var self = this;
    fs.readdir(this.serverPath, function(err, lists) {
      lists.forEach(function (i) {
        fs.unlink(path.join(self.serverPath, i));
      });
    });
  },
  enableHosts: function (hosts) {
    this.hostsFlag = true;
    if (hosts) {
      this.hosts(hosts);
    }
  },
  disableHosts: function () {
    this.hostsFlag = false;
  },
  enableWeb: function () {
    this.webFlag = true;
  },
  disableWeb: function () {
    this.webFlag = false;
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

    var rootca = path.basename(this.rootCA);
    this.app
      .use("/~https", function (req, res) {
        res.writeHead(200, {
          "Content-Type": "text/html;charset=utf-8"
        });
        res.write(
          "<meta charset='utf-8'><style>body{text-align: center}</style>" +
          "<h1>Scan && Install the Root-CA in your devices:</h1>"
        );

        var Url = "http://" + ipLib.address() + ':' + http_port + "/~" + rootca;
        var qr = require("qrcode-npm").qrcode(4, 'M');
        qr.addData(Url);
        qr.make();
        res.write(qr.createImgTag(4));
        res.end("<p><a href='" + Url + "'>" + Url + "</a></p>");
      }.bind(this))
      .use("/~" + rootca, function (req, res) {
        console.log("Downloading " + this.rootCA);

        res.writeHead(200, {
          "Content-Type": mime.lookup(rootca),
          "Content-Disposition": "attachment;filename=" + rootca
        });
        res.end(fs.readFileSync(this.rootCA, {encoding: null}));
      }.bind(this));

    if (this.webFlag) {
      var favicon = "favicon.ico";
      this.app
        .use('/' + favicon, function (req, res) {
          res.writeHead(200, {
            "Content-Type": mime.lookup(favicon)
          });
          res.end(fs.readFileSync(path.join(__dirname, "assets", favicon), {encoding: null}));
        })
        .use(function (req, res, next) {
          try {
            req.url = decodeURI(req.url);
          }
          catch (e) {
          }

          var serverIP = ipLib.address();
          var clientIP = req.connection.remoteAddress.replace(/.+\:/, '');
          clientIP = (net.isIP(clientIP) && clientIP != "127.0.0.1") ? clientIP : serverIP;
          req.serverIP = serverIP;
          req.clientIP = clientIP;

          var urlLib = require("url");
          var QUERY = require("qs");

          req.query = {};
          var _get = urlLib.parse(req.url).path.match(/([^\?])\?[^\?].*$/);
          if (_get && _get[0]) {
            req.query = QUERY.parse(_get[0].slice(2));
          }

          next();
        })
        .use(require("body-parser").urlencoded({extended: true}))
        .use(require("multer")());
    }

    function startServer(hosts) {
      var util = require("util");
      var defaultHost = ipLib.address();

      self.middlewares.forEach(function (middleware) {
        var module = middleware.module;
        if (module && typeof module == "function") {
          middleware.params.hosts = hosts;
          middleware.params.rootdir = middleware.params.rootdir || self.rootdir;

          self.app.use(module(middleware.params, self.confdir));
        }
        else if (util.isArray(middleware)) {
          self.app.use.apply(self.app, middleware);
        }
      });

      if (self.webFlag) {
        self.app
          .use(require("serve-index")(self.rootdir, {icons: true}))
          .use(require("serve-static")(self.rootdir, {
            index: false,
            setHeaders: function (res, path) {
              res.setHeader("Content-Type", mime.lookup(path));
            }
          }));
      }

      var http = require("http").createServer(self.app).listen(http_port, function () {
        console.log("HTTP Server running at", chalk.cyan("http://" + defaultHost + ':' + http_port));
        typeof cb == "function" && cb(http_port);
      });
      self.app.emit("http", http);

      if (https_port) {
        var exec = require("child_process").exec;
        var platform = require("os").platform();

        var rootCA = self.rootCA;
        var serverPath = self.serverPath;
        var HTTPS_DIR = self.HTTPS_DIR;
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

            var https = require("https")
              .createServer({
                SNICallback: function (domain, SNICallback) {
                  var createSecureContext = require("tls").createSecureContext;

                  if (!(typeof SNICallback == "function" && createSecureContext)) {
                    console.log(
                      "Your Node.js %s support %s, please %s your Node.js >= 0.12",
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
            self.app.emit("https", https);

            var domains = Object.keys(hosts);
            domains.push("localhost", "127.0.0.1");
            domains.forEach(function (domain) {
              exec([genCert, domain, serverPath].join(' '), function () {
                fs.chmod(path.join(serverPath, domain + ".key"), 0777);
                fs.chmod(path.join(serverPath, domain + ".crt"), 0777);
              });
            });
          }
          else {
            console.log(err);
          }
        });
      }
    }

    if (this.hostsFlag) {
      require("flex-hosts")(this.hostsMap, this.confdir, function (err, hosts) {
        if (err) {
          console.log(chalk.red("DNS lookup Error!"));
          console.log("You need to set the %s field by yourself!\n", chalk.yellow("hosts"));
          hosts = {};
        }

        startServer(hosts);
      });
    }
    else {
      startServer({});
    }
  }
};

module.exports = new PlugBase();
