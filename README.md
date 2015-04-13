# Plug Base

```
var server = require("plug-base");
// 设置根目录
server.root("src");

// 设置配置文件目录
server.config(".config");

// 设置hosts映射关系
server.hosts({
  "127.0.0.1": [
    "g.cdn.com",
    "a.cdn.com"
  ]
});

server
  // 普通中间件
  .use([router,] function (req, res, next) {
    ...
    next();
  })
  // 支持启动后传入统一配置的中间件
  .plug(require("flex-combo")[, {...}])
  .plug(require("essi")[, {...}])
  .listen([80,] [443,] [function (port) {
    ...
  }]);
```

## Request

`req.query` -- GET Request Fields

`req.body` -- POST Request Fields

## Mobile Support

使用桌面浏览器访问`http://127.0.0.1/~`，其显示了一个二维码。
移动设备扫描该二维码并下载根证书安装于设备中，以支持移动设备调试HTTPs页面。

* `http://127.0.0.1/~rootCA.crt`是根证书的实际下载地址。

## OS Support

Mac OSX, Windows, Linux

Tell me the bugs Via `limingv5[#]gmail.com`