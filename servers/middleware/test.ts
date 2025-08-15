import { defineMiddleware } from 'h3'

export default defineMiddleware(() => {
  console.log('Test middleware executed')
})
