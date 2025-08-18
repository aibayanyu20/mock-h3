# Mock H3

A mock server plugin for Vite.

## Usage

```shell
pnpm add mock-h3 h3@beta -D
```

Import in `vite.config.ts`:

```ts
import { mockH3 } from 'mock-h3/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    mockH3()
  ]
})
```

## Structure

By default, create a `servers` folder in the same directory as your `vite.config`. A typical layout:

```
servers/                            # Project root
├── middleware/                     # Middlewares
│   ├── test1.ts                    # Middleware 1
│   ├── test2.ts                    # Middleware 2
│   └── ...                         # More middlewares
├── plugins/                        # Plugins
│   ├── plugin1.ts                  # Plugin 1
│   ├── plugin2.ts                  # Plugin 2
│   └── ...                         # More plugins
└── routes/                         # Routes
    ├── index.ts                    # Main page
    ├── user.get.ts                 # GET request
    ├── edit.post.ts                # POST request
    └── ...                         # More request handlers
```

### Middleware

Middlewares run in the same order as their file order. Ensure file names/order match the expected execution order.

See h3 middleware docs: https://h3.dev/guide/basics/middleware

### Plugins

Plugins follow h3’s plugin system. See: https://h3.dev/guide/advanced/plugins

It’s recommended to import `definePlugin` from `mock-h3`:

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

## Options

- `prefix` - Request prefix. Default: `/api`.
- `srcDir` - Directory to scan for resources. Default: `servers`.
- `build` - Bundle mock server in production. Default: `true`.
- `outputDir` - Build output dir. Default: `dist/servers`. Effective only when `build` is `true`.
