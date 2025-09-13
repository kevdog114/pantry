import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthGuard } from './auth-guard';
import { AuthService } from './auth';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: AuthService;
  let router: Router;
  let route: ActivatedRouteSnapshot;
  let state: RouterStateSnapshot;

  beforeEach(() => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['getUser']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });

    guard = TestBed.inject(AuthGuard);
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    route = new ActivatedRouteSnapshot();
    state = { url: '/test', root: route };
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('should allow activation if user is authenticated', () => {
    (authService.getUser as jasmine.Spy).and.returnValue(of({ user: { username: 'admin' } }));
    guard.canActivate(route, state).subscribe(result => {
      expect(result).toBe(true);
    });
  });

  it('should deny activation and navigate to login if user is not authenticated', () => {
    (authService.getUser as jasmine.Spy).and.returnValue(of({}));
    guard.canActivate(route, state).subscribe(result => {
      expect(result).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  it('should deny activation and navigate to login on error', () => {
    (authService.getUser as jasmine.Spy).and.returnValue(throwError(() => new Error('error')));
    guard.canActivate(route, state).subscribe(result => {
      expect(result).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
