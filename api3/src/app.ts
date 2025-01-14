import express from "express";
import * as ProductsController from "./controllers/ProductsController";

const app = express();

app.set("port", process.env.PORT || "4300");

app.get("/products/:id", ProductsController.getById);
app.get("/products", ProductsController.getAll);
app.get("/product-create", ProductsController.create);


export default app;