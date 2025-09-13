import { Component } from '@angular/core';
import { RouterModule, RouterOutlet } from '@angular/router';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { TestComponentComponent } from './test-component/test-component.component';
import { ProductListComponent } from './components/product-list/product-list.component';
import { environment } from '../environments/environment';
import { MatSidenavModule } from '@angular/material/sidenav';
import { SideMenuComponent } from './side-menu/side-menu.component';
import { HardwareBarcodeScannerService } from './hardware-barcode-scanner.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatIconModule, MatToolbarModule, MatButtonModule, MatDividerModule,
    TestComponentComponent,
    ProductListComponent,
    RouterModule,
    MatSidenavModule,
    SideMenuComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = "Pantry"

  /**
   *
   */
  constructor(private hardwareScanner: HardwareBarcodeScannerService, iconRegistry: MatIconRegistry) {
    this.title = "kev test"; //environment.siteTitle
    hardwareScanner.ListenForScanner();

    iconRegistry.setDefaultFontSetClass("material-symbols-outlined");
  }
}
