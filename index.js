var fs = require("fs");
var urlLib = require("url");
var path = require("path");
var https = require("https");
var QUERY = require("querystring");
var app = require("connect")();
var timeout = require("connect-timeout");
var serveIndex = require("serve-index");

var tls = require("tls");
var exec = require("child_process").exec;

var platform = require("os").platform();
var rootCA = path.join(__dirname, "cert/rootCA.crt");
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

exports = module.exports = function (param, dir) {
  require("flex-hosts")({}, dir).once("refreshed", function (hosts) {
    param.hosts = hosts;

    app
      .use(timeout("1s"))
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

          console.log("Request Fields:", JSON.stringify(req.query, null, 2));

          next();
        });
      })
      .use(serveIndex("src", {'icons': true}))
      .listen(80, function () {
        console.log("HTTP Server running at http://127.0.0.1:80");
      });

    https
      .createServer({
        SNICallback: function (domain, SNICallback) {
          var serverPath = path.join(__dirname, "cert/.sni/");
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
            exec(__dirname + "/cert/gen-cer " + domain + ' ' + serverPath, function (err) {
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
      }, app)
      .listen(443, function () {
        console.log("HTTPS Server running at https://127.0.0.1:443");
      });
  });
};
