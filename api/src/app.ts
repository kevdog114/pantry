import express, { Request, Response } from "express";
import * as path from 'path';
import * as fs from 'fs';
import * as ProductsController from "./controllers/ProductsController";
import * as RecipeController from "./controllers/RecipeController";
import * as TimerController from "./controllers/TimerController";
import * as ProductSearchController from "./controllers/ProductSearchController";
import * as LeftoverController from "./controllers/LeftoverController";

import * as ImageController from "./controllers/ImageController";
import * as StockItemController from "./controllers/StockItemController";
import * as TagsController from "./controllers/TagsController";
import * as GeminiController from "./controllers/GeminiController";
import * as AuthController from "./controllers/AuthController";
import { PersonalAccessTokenController } from "./controllers/PersonalAccessTokenController";
import * as SettingsController from "./controllers/SettingsController";
import * as ChatController from "./controllers/ChatController"; // Import ChatController
import * as SpeechController from "./controllers/SpeechController";
import { WeatherController } from "./controllers/WeatherController";
import * as FamilyController from "./controllers/FamilyController";

import * as MealPlanController from "./controllers/MealPlanController";
import * as KioskController from "./controllers/KioskController";
import * as KioskCommandController from "./controllers/KioskCommandController";
import * as ShoppingListController from "./controllers/ShoppingListController";
import * as ShoppingTripController from "./controllers/ShoppingTripController";
import { isAuthenticated } from "./middleware/auth";

import * as LabelPrinterController from "./controllers/labelPrinterController";
import * as EquipmentController from "./controllers/EquipmentController";
import * as LocationController from "./controllers/LocationController";
import * as DiagnosticsController from "./controllers/DiagnosticsController";
import cors from "cors";
import fileUpload from "express-fileupload";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import * as bcrypt from 'bcryptjs';
import prisma from './lib/prisma';
import connectSqlite3 from "connect-sqlite3";

const app = express();
const SQLiteStore = connectSqlite3(session);

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
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: 'data'
    }),
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
    }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(async (username, password, done) => {
    // Check for hardcoded credentials (dev/testing only)
    if (process.env.HARDCODED_AUTH_USERNAME && process.env.HARDCODED_AUTH_PASSWORD) {
        if (username === process.env.HARDCODED_AUTH_USERNAME && password === process.env.HARDCODED_AUTH_PASSWORD) {
            console.log('Using hardcoded auth mechanism');

            // Find or create the user in the database to ensure we have a valid ID for FKs
            let user = await prisma.user.findUnique({ where: { username: process.env.HARDCODED_AUTH_USERNAME } });

            if (!user) {
                console.log('Creating new user for hardcoded auth');
                const salt = bcrypt.genSaltSync(10);
                const hashedPassword = bcrypt.hashSync(process.env.HARDCODED_AUTH_PASSWORD, salt);

                user = await prisma.user.create({
                    data: {
                        username: process.env.HARDCODED_AUTH_USERNAME,
                        password: hashedPassword
                    }
                });
            }

            return done(null, user);
        }
    }

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


app.post("/kiosk/token", KioskController.generateToken);
app.post("/auth/kiosk-login", KioskController.kioskLogin);

app.post("/auth/login", passport.authenticate('local'), AuthController.login);
app.get("/auth/user", AuthController.getCurrentUser);

// All routes below this are protected
app.use(isAuthenticated);

app.get("/auth/socket-token", AuthController.generateSocketToken);
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
app.post("/recipes/:id/leftover", LeftoverController.create);


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
app.delete("/tags/:id", TagsController.deleteById);
app.get("/tag-groups", TagsController.getGroups);
app.get("/tag-groups/:group", TagsController.getAllForGroup);

app.get("/locations", LocationController.getAll);
app.get("/locations/:id", LocationController.getById);
app.post("/locations", LocationController.create);
app.put("/locations/:id", LocationController.updateById);
app.delete("/locations/:id", LocationController.deleteById);

app.get("/product-search", ProductSearchController.search);
app.get("/product-search-all", ProductSearchController.getall);

app.get("/gemini/chat/sessions", ChatController.getSessions);
app.get("/gemini/chat/sessions/:id", ChatController.getSession);
app.delete("/gemini/chat/sessions/:id", ChatController.deleteSession);

app.post("/gemini/chat", GeminiController.post);
app.post("/gemini/image", GeminiController.postImage);
app.post("/gemini/thaw-advice", GeminiController.postThawAdvice);
app.post("/gemini/quick-suggest", GeminiController.postQuickSuggest);
app.post("/gemini/generate-image", GeminiController.generateProductImage);
app.post("/gemini/generate-recipe-image", GeminiController.generateRecipeImage);
app.post("/gemini/recipe-quick-actions", GeminiController.extractRecipeQuickActions);
app.post("/gemini/product-details", GeminiController.postProductDetails);
app.get("/gemini/models", GeminiController.getAvailableModels);

app.post("/gemini/product-match", GeminiController.postProductMatch);
app.post("/gemini/barcode-details", GeminiController.postBarcodeDetails);
app.post("/gemini/shopping-list-sort", GeminiController.postShoppingListSort);
app.post("/gemini/logistics", GeminiController.calculateLogistics);

app.post("/speech/transcribe", SpeechController.transcribe);

app.get("/uploads/:filename", (req: Request, res: Response) => {
    const filename = req.params.filename;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        res.status(400).send('Invalid filename');
        return;
    }
    const filepath = path.join(process.cwd(), 'data', 'upload', filename);
    if (fs.existsSync(filepath)) {
        res.sendFile(filepath);
    } else {
        res.sendStatus(404);
    }
});

app.get("/settings", SettingsController.getSettings);
app.put("/settings", SettingsController.updateSettings);

app.get("/weather/settings", WeatherController.getSettings);
app.post("/weather/settings", WeatherController.updateSettings);
app.get("/weather/forecast", WeatherController.getForecast);

app.get("/family/members", FamilyController.getMembers);
app.post("/family/members", FamilyController.createMember);
app.put("/family/members/:id", FamilyController.updateMember);
app.delete("/family/members/:id", FamilyController.deleteMember);
app.get("/family/preferences", FamilyController.getGeneralPreferences);
app.post("/family/preferences", FamilyController.saveGeneralPreferences);

app.get("/meal-plan", MealPlanController.getMealPlan);
app.post("/meal-plan", MealPlanController.addMealToPlan);
app.put("/meal-plan/:id", MealPlanController.updateMealPlan);
app.delete("/meal-plan/:id", MealPlanController.removeMealFromPlan);

app.post("/meal-plan/tasks", MealPlanController.saveLogisticsTasks);
app.post("/meal-plan/generate-shopping-list", MealPlanController.generateShoppingList);
app.get("/meal-plan/tasks/upcoming", MealPlanController.getUpcomingTasks);
app.put("/meal-plan/tasks/:id/complete", MealPlanController.completeTask);

app.post("/kiosk/link", KioskController.linkKiosk);
app.get("/kiosk", KioskController.getKiosks);
app.delete("/kiosk/:id", KioskController.deleteKiosk);
app.put("/kiosk/:id/settings", KioskController.updateKioskSettings);
app.put("/kiosk/:kioskId/devices/:deviceId/config", KioskController.updateDeviceConfig);
app.post("/kiosk/:id/devices/:deviceId/test-print", KioskController.testReceiptPrinter);
app.get("/kiosk/scanners", KioskController.getAvailableScanners);

app.get("/kiosk-commands", KioskCommandController.getAll);
app.post("/kiosk-commands", KioskCommandController.create);
app.put("/kiosk-commands/:id", KioskCommandController.update);
app.delete("/kiosk-commands/:id", KioskCommandController.deleteById);

app.get("/shopping-list", ShoppingListController.getShoppingList);
app.post("/shopping-list/:id/items", ShoppingListController.addItem);
app.put("/shopping-list/items/:itemId", ShoppingListController.updateItem);
app.delete("/shopping-list/items/:itemId", ShoppingListController.deleteItem);
app.delete("/shopping-list/:id/checked", ShoppingListController.clearChecked);


app.get("/shopping-trips", ShoppingTripController.getShoppingTrips);
app.post("/shopping-trips", ShoppingTripController.createShoppingTrip);
app.put("/shopping-trips/:id", ShoppingTripController.updateShoppingTrip);
app.delete("/shopping-trips/:id", ShoppingTripController.deleteShoppingTrip);
app.post("/shopping-trips/:id/assign-items", ShoppingTripController.assignItemsToTrip);

app.post("/labels/quick-print", LabelPrinterController.printQuickLabel);
app.post("/labels/stock/:id", LabelPrinterController.printStockLabel);
app.post("/labels/modifier", LabelPrinterController.printModifierLabel);
app.post("/labels/recipe/:id", LabelPrinterController.printRecipeLabel);
app.post("/labels/receipt/:id", LabelPrinterController.printReceipt);
app.post("/labels/asset/:id", LabelPrinterController.printAssetLabel);


app.get("/equipment", EquipmentController.getAll);
app.get("/equipment/:id", EquipmentController.getById);
app.post("/equipment", EquipmentController.create);
app.put("/equipment/:id", EquipmentController.update);
app.delete("/equipment/:id", EquipmentController.deleteById);
app.post("/equipment/:id/files", EquipmentController.uploadFile);

app.get("/diagnostics/clients", DiagnosticsController.getConnectedClients);
app.post("/diagnostics/log", DiagnosticsController.logMessage);

app.get("/timers", TimerController.getTimers);
app.post("/timers", TimerController.createTimer);
app.get("/timers", TimerController.getTimers);
app.post("/timers", TimerController.createTimer);
app.delete("/timers/:id", TimerController.deleteTimer);

// Push Notifications
import * as PushController from "./controllers/PushController";
app.get("/push/key", PushController.getPublicKey);
app.post("/push/subscribe", PushController.subscribe);
app.post("/push/test", PushController.sendTestNotification);
app.get("/push/subscriptions", PushController.getSubscriptions);
app.delete("/push/subscriptions/:id", PushController.deleteSubscription);


app.get('/*', (req: Request, res: Response) => {
    res.sendFile('index.html', { root: '../ui/pantry-ui/dist/pantry-ui' });
});

export default app;
