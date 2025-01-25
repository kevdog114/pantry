import { Routes } from '@angular/router';
import { ProductEditComponent } from './product-edit/product-edit.component';
import { ProductViewComponent } from './product-view/product-view.component';
import { StockEditComponent } from './stock-edit/stock-edit.component';

export const routes: Routes = [
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
    }
];
