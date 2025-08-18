import { definePlugin } from 'h3'

export default definePlugin((h3, _options) => {
  if (h3.config.debug) {
    h3.use((req) => {
      console.log(`[${req.method}] ${req.url}`)
    })
  }
})
