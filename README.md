# Plug Base

```
var server = require("plug-base");
  server.root("src");
  server.config("config_dir");
  server.hosts({
    "127.0.0.1": [
      "g.cdn.com",
      "a.cdn.com"
    ]
  });

  getVer(function(version) {
    var params = {
      cdnPath: cdnPath,
      version: version
    };

    server
      .use(require("flex-combo"), params)
      .use(require("essi"), params)
      .listen(80, 443);
  });
```
