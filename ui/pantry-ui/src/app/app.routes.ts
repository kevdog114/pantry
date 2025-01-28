import { Routes } from '@angular/router';
import { ProductEditComponent } from './product-edit/product-edit.component';
import { ProductViewComponent } from './product-view/product-view.component';
import { StockEditComponent } from './stock-edit/stock-edit.component';
import { ProductListComponent } from './components/product-list/product-list.component';
import { SettingsComponent } from './settings/settings.component';
import { BarcodeScannerComponent } from './barcode-scanner/barcode-scanner.component';
import { SearchComponent } from './search/search.component';

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
        path: "settings",
        component: SettingsComponent
    },
    {
        path: "search",
        component: SearchComponent
    },
    {
        path: "**",
        redirectTo: "home"
    }
];
