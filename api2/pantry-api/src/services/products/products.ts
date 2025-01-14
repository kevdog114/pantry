// For more information about this file see https://dove.feathersjs.com/guides/cli/service.html
import { authenticate } from '@feathersjs/authentication'

import { hooks as schemaHooks } from '@feathersjs/schema'

import {
  productsServiceDataValidator,
  productsServicePatchValidator,
  productsServiceQueryValidator,
  productsServiceResolver,
  productsServiceExternalResolver,
  productsServiceDataResolver,
  productsServicePatchResolver,
  productsServiceQueryResolver
} from './products.schema'

import type { Application } from '../../declarations'
import { ProductsServiceService, getOptions } from './products.class'
import { productsServicePath, productsServiceMethods } from './products.shared'

export * from './products.class'
export * from './products.schema'

// A configure function that registers the service and its hooks via `app.configure`
export const productsService = (app: Application) => {
  // Register our service on the Feathers application
  app.use(productsServicePath, new ProductsServiceService(getOptions(app)), {
    // A list of all methods this service exposes externally
    methods: productsServiceMethods,
    // You can add additional custom events to be sent to clients here
    events: []
  })
  // Initialize hooks
  app.service(productsServicePath).hooks({
    around: {
      all: [
        authenticate('jwt'),
        schemaHooks.resolveExternal(productsServiceExternalResolver),
        schemaHooks.resolveResult(productsServiceResolver)
      ]
    },
    before: {
      all: [
        schemaHooks.validateQuery(productsServiceQueryValidator),
        schemaHooks.resolveQuery(productsServiceQueryResolver)
      ],
      find: [],
      get: [],
      create: [
        schemaHooks.validateData(productsServiceDataValidator),
        schemaHooks.resolveData(productsServiceDataResolver)
      ],
      patch: [
        schemaHooks.validateData(productsServicePatchValidator),
        schemaHooks.resolveData(productsServicePatchResolver)
      ],
      remove: []
    },
    after: {
      all: []
    },
    error: {
      all: []
    }
  })
}

// Add this service to the service type index
declare module '../../declarations' {
  interface ServiceTypes {
    [productsServicePath]: ProductsServiceService
  }
}
