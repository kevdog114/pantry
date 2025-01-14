// // For more information about this file see https://dove.feathersjs.com/guides/cli/service.schemas.html
import { resolve } from '@feathersjs/schema'
import { Type, getValidator, querySyntax } from '@feathersjs/typebox'
import type { Static } from '@feathersjs/typebox'

import type { HookContext } from '../../declarations'
import { dataValidator, queryValidator } from '../../validators'
import type { ProductsServiceService } from './products.class'

// Main data model schema
export const productsServiceSchema = Type.Object(
  {
    id: Type.Number(),
    text: Type.String()
  },
  { $id: 'ProductsService', additionalProperties: false }
)
export type ProductsService = Static<typeof productsServiceSchema>
export const productsServiceValidator = getValidator(productsServiceSchema, dataValidator)
export const productsServiceResolver = resolve<ProductsService, HookContext<ProductsServiceService>>({})

export const productsServiceExternalResolver = resolve<ProductsService, HookContext<ProductsServiceService>>(
  {}
)

// Schema for creating new entries
export const productsServiceDataSchema = Type.Pick(productsServiceSchema, ['text'], {
  $id: 'ProductsServiceData'
})
export type ProductsServiceData = Static<typeof productsServiceDataSchema>
export const productsServiceDataValidator = getValidator(productsServiceDataSchema, dataValidator)
export const productsServiceDataResolver = resolve<ProductsService, HookContext<ProductsServiceService>>({})

// Schema for updating existing entries
export const productsServicePatchSchema = Type.Partial(productsServiceSchema, {
  $id: 'ProductsServicePatch'
})
export type ProductsServicePatch = Static<typeof productsServicePatchSchema>
export const productsServicePatchValidator = getValidator(productsServicePatchSchema, dataValidator)
export const productsServicePatchResolver = resolve<ProductsService, HookContext<ProductsServiceService>>({})

// Schema for allowed query properties
export const productsServiceQueryProperties = Type.Pick(productsServiceSchema, ['id', 'text'])
export const productsServiceQuerySchema = Type.Intersect(
  [
    querySyntax(productsServiceQueryProperties),
    // Add additional query properties here
    Type.Object({}, { additionalProperties: false })
  ],
  { additionalProperties: false }
)
export type ProductsServiceQuery = Static<typeof productsServiceQuerySchema>
export const productsServiceQueryValidator = getValidator(productsServiceQuerySchema, queryValidator)
export const productsServiceQueryResolver = resolve<
  ProductsServiceQuery,
  HookContext<ProductsServiceService>
>({})
