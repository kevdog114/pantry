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
import { LoginComponent } from './login/login';
import { ProfileComponent } from './profile/profile';
import { AuthGuard } from './services/auth-guard';
import { QuickLabelComponent } from './quick-label/quick-label.component';
import { RecipeListComponent } from './components/recipe-list/recipe-list.component';
import { RecipeEditComponent } from './recipe-edit/recipe-edit.component';

export const routes: Routes = [
    {
        path: "recipes",
        component: RecipeListComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "recipes/create",
        component: RecipeEditComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "recipes/:id/edit",
        component: RecipeEditComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "login",
        component: LoginComponent
    },
    {
        path: "profile",
        component: ProfileComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "home",
        component: ProductListComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "products/create",
        component: ProductEditComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "products/:id/edit",
        component: ProductEditComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "products/:id",
        component: ProductViewComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "products/:productId/stock-items",
        component: StockEditComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "products/:productId/stock-items/:stockId",
        component: StockEditComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "barcode/scanner",
        component: BarcodeScannerComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "barcode/lookup",
        component: MissingBarcodeComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "settings",
        component: SettingsComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "settings/tags",
        component: TagsComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "search",
        component: SearchComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "roadmap",
        component: RoadmapComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "gemini-chat",
        component: GeminiChatComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "quick-label",
        component: QuickLabelComponent
    },
    {
        path: "**",
        redirectTo: "home"
    }
];
