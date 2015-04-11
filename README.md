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
  .use(require("flex-combo"), {...})
  .use(require("essi"), {...})
  .listen(80, 443);
```
