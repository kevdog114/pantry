import { productsService } from './products/products'
// For more information about this file see https://dove.feathersjs.com/guides/cli/application.html#configure-functions
import type { Application } from '../declarations'

export const services = (app: Application) => {
  app.configure(productsService)
  // All services will be registered here
}
