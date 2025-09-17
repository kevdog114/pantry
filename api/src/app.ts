import express, { Request, Response } from "express";
import * as ProductsController from "./controllers/ProductsController";
import * as RecipeController from "./controllers/RecipeController";
import * as ProductSearchController from "./controllers/ProductSearchController";
import * as ImageController from "./controllers/ImageController";
import * as StockItemController from "./controllers/StockItemController";
import * as TagsController from "./controllers/TagsController";
import * as GeminiController from "./controllers/GeminiController";
import * as AuthController from "./controllers/AuthController";
import { PersonalAccessTokenController } from "./controllers/PersonalAccessTokenController";
import { isAuthenticated } from "./middleware/auth";
import * as LabelPrinterController from "./controllers/labelPrinterController";
import cors from "cors";
import fileUpload from "express-fileupload";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import * as bcrypt from 'bcryptjs';
import prisma from './lib/prisma';

const app = express();

var corsOptions = {
    origin: process.env.ALLOW_ORIGIN || 'http://localhost:4200',
    credentials: true,
    //optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
  }

app.use(cors(corsOptions))
app.use(fileUpload({
  useTempFiles: true
}));
app.use(express.json());
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
});
app.use(session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(async (username, password, done) => {
    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return done(null, false, { message: 'Incorrect username.' });
        }
        if (!bcrypt.compareSync(password, user.password)) {
            return done(null, false, { message: 'Incorrect password.' });
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, (user as any).id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: id as number } });
        done(null, user);
    } catch (err) {
        done(err);
    }
});

app.use(express.static('../ui/pantry-ui/dist/pantry-ui'));

app.set("port", process.env.PORT || "4300");

app.post("/auth/login", passport.authenticate('local'), AuthController.login);
app.get("/auth/user", AuthController.getCurrentUser);
// All routes below this are protected
app.use(isAuthenticated);

app.post("/auth/logout", AuthController.logout);
app.post("/auth/password", AuthController.changePassword);

const patController = new PersonalAccessTokenController();
const patRouter = express.Router();
patController.routes(patRouter);
app.use('/auth', patRouter);

app.get("/products/:id", ProductsController.getById);
app.delete("/products/:id", ProductsController.deleteById);
app.get("/products", ProductsController.getAll);
app.post("/products", ProductsController.create);
app.put("/products/:id", ProductsController.updateById);

app.get("/recipes", RecipeController.getAll);
app.post("/recipes", RecipeController.create);
app.get("/recipes/:id", RecipeController.getById);
app.put("/recipes/:id", RecipeController.update);
app.delete("/recipes/:id", RecipeController.deleteById);

app.post("/files", ImageController.create);
app.get("/files/:id", ImageController.getById);
app.delete("/files/:id", ImageController.deleteById);
app.get("/stock-items/:id", StockItemController.getById);
app.post("/stock-items", StockItemController.create);
app.delete("/stock-items/:id", StockItemController.deleteById);
app.put("/stock-items/:id", StockItemController.update);

app.get("/barcodes/products", ProductsController.searchProductByBarcode);

app.get("/tags", TagsController.getAll);
app.get("/tags/:id", TagsController.getById);
app.post("/tags", TagsController.create);
app.put("/tags/:id", TagsController.updateById);
app.get("/tag-groups", TagsController.getGroups);
app.get("/tag-groups/:group", TagsController.getAllForGroup);

app.get("/product-search", ProductSearchController.search);
app.get("/product-search-all", ProductSearchController.getall);

app.post("/gemini/chat", GeminiController.post);
app.post("/gemini/image", GeminiController.postImage);

app.post("/labels/quick-print", LabelPrinterController.printQuickLabel);

app.get('/*', (req: Request, res: Response) => {
    res.sendFile('index.html', { root: '../ui/pantry-ui/dist/pantry-ui' });
});

export default app;
