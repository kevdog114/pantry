import { Id, Params } from "@feathersjs/feathers";
import { KnexService } from "@feathersjs/knex";
import { Static, Type } from "@feathersjs/typebox";

const productSchema = Type.Object(
    {
        id: Type.Number(),
        title: Type.String({ maxLength: 255 })
    }
)

export type Product = Static<typeof productSchema>;
export type ProductEditable = Omit<Product, "id">;

export class ProductsService extends KnexService<Product, ProductEditable> {

}
