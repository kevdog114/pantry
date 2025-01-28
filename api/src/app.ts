import express from "express";
import * as ProductsController from "./controllers/ProductsController";
import * as ImageController from "./controllers/ImageController";
import * as StockItemController from "./controllers/StockItemController";
import cors from "cors";
import fileUpload from "express-fileupload";

const app = express();

var corsOptions = {
    origin: process.env.ALLOW_ORIGIN || 'http://localhost:4200',
    //optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
  }

app.use(cors(corsOptions))
app.use(fileUpload({
  useTempFiles: true
}));
app.use(express.json());

app.set("port", process.env.PORT || "4300");

app.get("/products/:id", ProductsController.getById);
app.get("/products", ProductsController.getAll);
app.post("/products", ProductsController.create);
app.put("/products/:id", ProductsController.updateById);
app.post("/files", ImageController.create);
app.get("/files/:id", ImageController.getById);
app.delete("/files/:id", ImageController.deleteById);
app.get("/stock-items/:id", StockItemController.getById);
app.post("/stock-items", StockItemController.create);
app.delete("/stock-items/:id", StockItemController.deleteById);
app.put("/stock-items/:id", StockItemController.update);

app.get("/barcodes/products", ProductsController.searchProductByBarcode);


export default app;