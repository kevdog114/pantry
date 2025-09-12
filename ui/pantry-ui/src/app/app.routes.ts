import { Routes } from '@angular/router';
import { ProductEditComponent } from './product-edit/product-edit.component';
import { ProductViewComponent } from './product-view/product-view.component';
import { StockEditComponent } from './stock-edit/stock-edit.component';
import { ProductListComponent } from './components/product-list/product-list.component';
import { SettingsComponent } from './settings/settings.component';
import { BarcodeScannerComponent } from './barcode-scanner/barcode-scanner.component';
import { SearchComponent } from './search/search.component';
import { MissingBarcodeComponent } from './missing-barcode/missing-barcode.component';
import { RoadmapComponent } from './roadmap/roadmap.component';
import { TagsComponent } from './tags/tags.component';
import { GeminiChatComponent } from './components/gemini-chat/gemini-chat.component';

export const routes: Routes = [
    {
        path: "home",
        component: ProductListComponent
    },
    {
        path: "products/create",
        component: ProductEditComponent
    },
    {
        path: "products/:id/edit",
        component: ProductEditComponent
    },
    {
        path: "products/:id",
        component: ProductViewComponent
    },
    {
        path: "products/:productId/stock-items",
        component: StockEditComponent
    },
    {
        path: "products/:productId/stock-items/:stockId",
        component: StockEditComponent
    },
    {
        path: "barcode/scanner",
        component: BarcodeScannerComponent
    },
    {
        path: "barcode/lookup",
        component: MissingBarcodeComponent
    },
    {
        path: "settings",
        component: SettingsComponent
    },
    {
        path: "settings/tags",
        component: TagsComponent
    },
    {
        path: "search",
        component: SearchComponent
    },
    {
        path: "roadmap",
        component: RoadmapComponent
    },
    {
        path: "gemini-chat",
        component: GeminiChatComponent
    },
    {
        path: "**",
        redirectTo: "home"
    }
];
