import { Component, OnInit } from '@angular/core';
import { RouterModule, Router, RouterOutlet, NavigationEnd } from '@angular/router';
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
import { KioskService } from './services/kiosk.service';
import { SocketService } from './services/socket.service';
import { HardwareService } from './services/hardware.service';
import { Observable, of } from 'rxjs';
import { catchError, map, filter } from 'rxjs/operators';
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
  isFullWidth = false;

  /**
   *
   */
  constructor(
    private hardwareScanner: HardwareBarcodeScannerService,
    iconRegistry: MatIconRegistry,
    private authService: AuthService,
    private kioskService: KioskService,
    private socketService: SocketService, // Injected SocketService
    private hardwareService: HardwareService,
    private router: Router) {
    this.title = environment.siteTitle;
    this.isSocketConnected$ = this.socketService.connected$;
    hardwareScanner.ListenForScanner();

    iconRegistry.setDefaultFontSetClass("material-symbols-outlined");

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.isFullWidth = event.urlAfterRedirects.includes('/gemini-chat') || event.urlAfterRedirects.includes('/home');
    });
  }

  scannerClaimedBy: string | null = null; // Property for UI
  isSocketConnected$: Observable<boolean>; // Property for UI

  ngOnInit() {
    // Subscribe to claimed status
    this.hardwareScanner.claimedBy$.subscribe(claimer => {
      this.scannerClaimedBy = claimer;
    });

    // If we are a Kiosk, refresh settings and identify regardless of current auth state
    const kioskToken = localStorage.getItem('kiosk_auth_token');
    const kioskId = localStorage.getItem('kiosk_id');
    const kioskName = localStorage.getItem('kiosk_name');

    let isScannerKiosk = false;

    if (kioskToken) {
      this.kioskService.kioskLogin(kioskToken, kioskId ? parseInt(kioskId) : undefined).subscribe({
        next: (res) => {
          console.log("Kiosk settings refreshed", res);
          if (res.kioskSettings && res.kioskSettings.hasKeyboardScanner !== undefined) {
            console.log("Setting scanner enabled:", res.kioskSettings.hasKeyboardScanner);
            this.hardwareScanner.setEnabled(res.kioskSettings.hasKeyboardScanner);

            isScannerKiosk = res.kioskSettings.hasKeyboardScanner;
            if (isScannerKiosk) {
              this.socketService.emit('identify_kiosk_scanner');
            }

            // Update Bridge with new settings
            this.hardwareService.connectBridge(kioskToken, kioskName || undefined, res.kioskSettings.hasKeyboardScanner).subscribe();
          }
        },
        error: (err) => console.error("Kiosk settings refresh failed", err)
      });

      // Re-identify on socket reconnection
      this.socketService.connected$.pipe(
        filter(connected => connected === true)
      ).subscribe(() => {
        if (isScannerKiosk) {
          console.log("Socket reconnected, re-identifying as scanner...");
          this.socketService.emit('identify_kiosk_scanner');
        }
      });

      // Listen for remote setting updates
      this.socketService.on('refresh_kiosk_settings', (settings: any) => {
        console.log('Received remote settings update', settings);
        if (settings.hasKeyboardScanner !== undefined) {
          console.log("Applying remote scanner setting:", settings.hasKeyboardScanner);
          this.hardwareScanner.setEnabled(settings.hasKeyboardScanner);
          isScannerKiosk = settings.hasKeyboardScanner;

          if (isScannerKiosk) {
            this.socketService.emit('identify_kiosk_scanner');
          }

          // Update Bridge
          this.hardwareService.connectBridge(kioskToken, kioskName || undefined, settings.hasKeyboardScanner).subscribe();
        }
      });
    }

    this.isAuthenticated = this.authService.getUser().pipe(
      map(response => !!response.user),
      catchError(() => {
        // Try kiosk login
        if (kioskToken) {
          console.log("Session lost, attempting kiosk auto-login...");
          return this.kioskService.kioskLogin(kioskToken, kioskId ? parseInt(kioskId) : undefined).pipe(
            map(res => {
              console.log("Kiosk auto-login successful", res);
              if (res.kioskSettings && res.kioskSettings.hasKeyboardScanner !== undefined) {
                console.log("Setting scanner enabled:", res.kioskSettings.hasKeyboardScanner);
                this.hardwareScanner.setEnabled(res.kioskSettings.hasKeyboardScanner);

                // Identify as scanner to backend
                if (res.kioskSettings.hasKeyboardScanner) {
                  this.socketService.emit('identify_kiosk_scanner');
                }
              }
              if (this.router.url === '/login' || this.router.url === '/kiosk-login') {
                this.router.navigate(['/']);
              }
              return true;
            }),
            catchError(err => {
              console.error("Kiosk auto-login failed", err);
              return of(false);
            })
          );
        }
        return of(false);
      })
    );

    // Apply Kiosk Mode if enabled
    if (localStorage.getItem('kiosk_mode') === 'true') {
      document.body.classList.add('kiosk-mode');
    }
  }

  logout() {
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
      this.isAuthenticated = of(false);
    });
  }

  forceReleaseScanner() {
    this.hardwareScanner.forceReleaseScanner();
  }
}
