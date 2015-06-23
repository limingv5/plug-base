# Plug Base

## QuickStart

```
var server = require("plug-base");
// 设置根目录
server.root("src");

// 设置配置文件目录
server.config(".config");

// 设置hosts映射关系（将修改hosts）
server.enableHosts({
  "127.0.0.1": [
    "g.cdn.com",
    "a.cdn.com"
  ]
});

// 不修改hosts
server.disableHosts();

server
  // 普通中间件
  .use([router,] function (req, res, next) {
    ...
    next();
  })
  // 支持启动后传入统一配置的中间件
  .plug(require("flex-combo")[, {...}])
  .plug(require("essi")[, {...}])
  // 收尾处理逻辑
  .end(function (req, res, next) {
    // res.buffer
    // res.error
  })
  .listen([80,] [443,] [function (port) {
    ...
  }]);
```

## new Instance

```
var PlugBase = require("plug-base").PlugBase;

var server = new PlugBase();

// 获取rootCA文件地址
server.getRootCAPath();
```

## 根证书生效

> 访问`http://127.0.0.1/~https`，该页面中显示了一个根证书二维码以及根证书下载地址。

### Mobile Support

使用移动设备扫描二维码并下载根证书安装于设备中，以支持移动设备调试HTTPs页面。

### Firefox Support

Firefox有其自身的根证书信任机制，需要另行导入根证书。
通过点击下载地址或直接访问`http://127.0.0.1/~rootCA.crt`进行下载并导入Firefox。


## HTTPs

HTTPs调试需要异步SNI的支持，如需开启HTTPs服务，请将Node.js升级至0.12.x及以上。


## OS Support

Mac OS X, Windows, Linux


## Issues & Bugs

Tell me Via limingv5[#]gmail.com