
import { feathers } from "@feathersjs/feathers";
import { ProductsService } from "./services/products-service";
import { koa, rest } from "@feathersjs/koa";
import { KnexAdapterOptions } from "@feathersjs/knex";

const port = 4300;

type ServiceTypes = {
    products: ProductsService
};

const app = koa<ServiceTypes>(feathers())

const sqlOptions: KnexAdapterOptions = {
    paginate: app.get("paginate"),
    Model: app.get("sqlClient"),
    name: "products"
};

app.configure(rest());
app.use("products", new ProductsService(sqlOptions));

app.listen(port)
.then(() => {
    console.log(`Listening on port ${port}`);
});
