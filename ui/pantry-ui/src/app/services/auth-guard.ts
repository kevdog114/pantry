import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth';
import { KioskService } from './kiosk.service';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private authService: AuthService, private router: Router, private kioskService: KioskService) { }

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean> {
    return this.authService.getUser().pipe(
      map(response => {
        if (response.user) {
          return true;
        } else {
          this.router.navigate(['/login']);
          return false;
        }
      }),
      catchError((error) => {
        const kioskToken = localStorage.getItem('kiosk_auth_token');
        const kioskId = localStorage.getItem('kiosk_id');

        if (kioskToken) {
          return this.kioskService.kioskLogin(kioskToken, kioskId ? parseInt(kioskId) : undefined).pipe(
            map(() => true),
            catchError(() => {
              this.router.navigate(['/login']);
              return of(false);
            })
          );
        }

        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }
}
