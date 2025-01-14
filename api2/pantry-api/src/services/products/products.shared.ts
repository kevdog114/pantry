// For more information about this file see https://dove.feathersjs.com/guides/cli/service.shared.html
import type { Params } from '@feathersjs/feathers'
import type { ClientApplication } from '../../client'
import type {
  ProductsService,
  ProductsServiceData,
  ProductsServicePatch,
  ProductsServiceQuery,
  ProductsServiceService
} from './products.class'

export type { ProductsService, ProductsServiceData, ProductsServicePatch, ProductsServiceQuery }

export type ProductsServiceClientService = Pick<
  ProductsServiceService<Params<ProductsServiceQuery>>,
  (typeof productsServiceMethods)[number]
>

export const productsServicePath = 'products'

export const productsServiceMethods: Array<keyof ProductsServiceService> = [
  'find',
  'get',
  'create',
  'patch',
  'remove'
]

export const productsServiceClient = (client: ClientApplication) => {
  const connection = client.get('connection')

  client.use(productsServicePath, connection.service(productsServicePath), {
    methods: productsServiceMethods
  })
}

// Add this service to the client service type index
declare module '../../client' {
  interface ServiceTypes {
    [productsServicePath]: ProductsServiceClientService
  }
}
