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
  .use(function (req, res, next) {
    ...
    next();
  })
  // 支持启动后传入统一配置的中间件
  .plug(require("flex-combo"), {...})
  .plug(require("essi"), {...})
  .listen([80,] [443,] [function (port) {
    ...
  }]);
```
