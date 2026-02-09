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
import { RecipeViewComponent } from './recipe-view/recipe-view.component';
import { RecipeEditComponent } from './recipe-edit/recipe-edit.component';
import { FamilyPreferencesComponent } from './family-preferences/family-preferences.component';
import { MealPlanComponent } from './components/meal-plan/meal-plan.component';
import { KioskLoginComponent } from './components/kiosk/kiosk-login/kiosk-login.component';

import { KioskLinkComponent } from './components/kiosk/kiosk-link/kiosk-link.component';
import { TagManagerComponent } from './settings/tag-manager/tag-manager.component';
import { KioskPageComponent } from './kiosk-page/kiosk-page.component';
import { ShoppingListComponent } from './shopping-list/shopping-list.component';
import { HardwareListComponent } from './components/hardware/hardware-list/hardware-list.component';
import { HomeComponent } from './home/home.component';



export const routes: Routes = [
    {
        path: "recipes",
        component: RecipeListComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "meal-plan",
        component: MealPlanComponent,
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
        path: "recipes/:id",
        component: RecipeViewComponent,
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
        component: HomeComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "products",
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
        path: "settings/weather",
        loadComponent: () => import('./settings/weather-settings/weather-settings.component').then(m => m.WeatherSettingsComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "settings/tags",
        component: TagManagerComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "settings/family",
        component: FamilyPreferencesComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "settings/locations",
        loadComponent: () => import('./settings/locations/locations.component').then(m => m.LocationsComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "settings/pbx",
        loadComponent: () => import('./settings/pbx-settings/pbx-settings.component').then(m => m.PbxSettingsComponent),
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
        path: "gemini/logs/:sessionId",
        loadComponent: () => import('./components/gemini-chat/gemini-debug-log/gemini-debug-log.component').then(m => m.GeminiDebugLogComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "quick-label",
        component: QuickLabelComponent
    },
    {
        path: "kiosk-login",
        component: KioskLoginComponent
    },

    {
        path: "kiosk/link",
        component: KioskLinkComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "kiosk-mode",
        component: KioskPageComponent
    },
    {
        path: "shopping-list",
        component: ShoppingListComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "hardware",
        component: HardwareListComponent,
        canActivate: [AuthGuard]
    },
    {
        path: "equipment",
        loadComponent: () => import('./equipment/equipment-list/equipment-list.component').then(m => m.EquipmentListComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "equipment/add",
        loadComponent: () => import('./equipment/equipment-edit/equipment-edit.component').then(m => m.EquipmentEditComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "equipment/edit/:id",
        loadComponent: () => import('./equipment/equipment-edit/equipment-edit.component').then(m => m.EquipmentEditComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "diagnostics",
        loadComponent: () => import('./diagnostics/diagnostics.component').then(m => m.DiagnosticsComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "timers",
        loadComponent: () => import('./timers/timers.component').then(m => m.TimersComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "audit",
        loadComponent: () => import('./audit-page/audit-page.component').then(m => m.AuditPageComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "browser",
        loadComponent: () => import('./browser-viewer/browser-viewer.component').then(m => m.BrowserViewerComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "sales",
        loadComponent: () => import('./sales-list/sales-list.component').then(m => m.SalesListComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "custom-barcodes",
        loadComponent: () => import('./custom-barcodes/custom-barcode-list/custom-barcode-list.component').then(m => m.CustomBarcodeListComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "custom-barcodes/create",
        loadComponent: () => import('./custom-barcodes/custom-barcode-edit/custom-barcode-edit.component').then(m => m.CustomBarcodeEditComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "custom-barcodes/:id",
        loadComponent: () => import('./custom-barcodes/custom-barcode-edit/custom-barcode-edit.component').then(m => m.CustomBarcodeEditComponent),
        canActivate: [AuthGuard]
    },
    {
        path: "**",
        redirectTo: "home"
    }
];
