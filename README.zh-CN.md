# Mock H3

这是一个专门为vite实现的一个mock server插件。

## 使用

```shell
pnpm add mock-h3
```

在`vite.config.ts`中导入:

```ts
import { mockH3 } from 'mock-h3/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    mockH3()
  ]
})
```

## 结构

默认情况下，你直接在配置`vite.config`的同级目录下，创建一个`servers`文件夹，其中`servers`文件夹下的目录结构大致如下:

```
servers/                            # 项目根目录
├── middleware/                     # 中间件目录
│   ├── test1.ts                    # 中间件1
│   ├── test2.ts                    # 中间件2
│   └── ...                         # 更多的中间件
├── plugins/                        # 创建目录
│   ├── plugin1.ts                  # 插件1
│   ├── plugin2.ts                  # 插件2
│   └── ...                         # 更多的插件
└── routes/                         # 路由目录
    ├── index.ts                    # 主路页面
    ├── user.get.ts                 # 定义get请求
    ├── edit.post.ts                # 定义post请求
    └── ...                         # 更多的请求方式
```

### 中间件

中间件的调用顺序是与文件的顺序一致的，所以你要保证中间件的加载顺序的话，那么你需要确保你的文件顺序是正确的。

具体使用请参考[h3中间件](https://h3.dev/guide/basics/middleware)部分的文档。

### 插件

插件是h3中的插件功能，具体请参考[H3插件](https://h3.dev/guide/advanced/plugins)部分的文档。

这里需要注意的是，建议使用`mock-h3`来引用插件的定义，如下：

```ts
// logger.ts

import { definePlugin } from 'mock-h3'

export default definePlugin((h3, _options) => {
  if (h3.config.debug) {
    h3.use((req) => {
      console.log(`[${req.method}] ${req.url}`)
    })
  }
})
```

## 属性

* `prefix` - 请求前缀，默认情况下是`/api`。
* `srcDir` - 配置扫描资源的路径，默认是`servers`。
* `build`  - 配置是否启用在生产环境下打包mock服务，默认是`true`。
* `outputDir` - 构建输出的目录，默认是`dist/servers`，这个只会在`build`属性为`true`的时候生效。
