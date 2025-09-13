import { Component, OnInit } from '@angular/core';
import { RouterModule, Router, RouterOutlet } from '@angular/router';
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
import { AuthService } from './services/auth';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatIconModule, MatToolbarModule, MatButtonModule, MatDividerModule,
    TestComponentComponent,
    ProductListComponent,
    RouterModule,
    MatSidenavModule,
    SideMenuComponent,
    CommonModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  standalone: true
})
export class AppComponent implements OnInit {
  title = "Pantry"
  isAuthenticated: Observable<boolean> = of(false);

  /**
   *
   */
  constructor(
    private hardwareScanner: HardwareBarcodeScannerService,
    iconRegistry: MatIconRegistry,
    private authService: AuthService,
    private router: Router) {
    this.title = environment.siteTitle;
    hardwareScanner.ListenForScanner();

    iconRegistry.setDefaultFontSetClass("material-symbols-outlined");
  }

  ngOnInit() {
    this.isAuthenticated = this.authService.getUser().pipe(
        map(response => !!response.user),
        catchError(() => of(false))
    );
  }

  logout() {
    this.authService.logout().subscribe(() => {
        this.router.navigate(['/login']);
        this.isAuthenticated = of(false);
    });
  }
}
