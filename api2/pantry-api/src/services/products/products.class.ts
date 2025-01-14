// For more information about this file see https://dove.feathersjs.com/guides/cli/service.class.html#database-services
import type { Params } from '@feathersjs/feathers'
import { KnexService } from '@feathersjs/knex'
import type { KnexAdapterParams, KnexAdapterOptions } from '@feathersjs/knex'

import type { Application } from '../../declarations'
import type {
  ProductsService,
  ProductsServiceData,
  ProductsServicePatch,
  ProductsServiceQuery
} from './products.schema'

export type { ProductsService, ProductsServiceData, ProductsServicePatch, ProductsServiceQuery }

export interface ProductsServiceParams extends KnexAdapterParams<ProductsServiceQuery> {}

// By default calls the standard Knex adapter service methods but can be customized with your own functionality.
export class ProductsServiceService<ServiceParams extends Params = ProductsServiceParams> extends KnexService<
  ProductsService,
  ProductsServiceData,
  ProductsServiceParams,
  ProductsServicePatch
> {}

export const getOptions = (app: Application): KnexAdapterOptions => {
  return {
    paginate: app.get('paginate'),
    Model: app.get('postgresqlClient'),
    name: 'products'
  }
}
