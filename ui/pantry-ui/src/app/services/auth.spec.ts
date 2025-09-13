import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send a login request', () => {
    const credentials = { username: 'admin', password: 'password' };
    service.login(credentials).subscribe(response => {
      expect(response).toBeTruthy();
    });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });
  });

  it('should send a logout request', () => {
    service.logout().subscribe(response => {
      expect(response).toBeTruthy();
    });

    const req = httpMock.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });
  });

  it('should send a change password request', () => {
    const passwords = { oldPassword: 'old', newPassword: 'new' };
    service.changePassword(passwords).subscribe(response => {
      expect(response).toBeTruthy();
    });

    const req = httpMock.expectOne('/api/auth/password');
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });
  });

  it('should send a get user request', () => {
    service.getUser().subscribe(response => {
      expect(response).toBeTruthy();
    });

    const req = httpMock.expectOne('/api/auth/user');
    expect(req.request.method).toBe('GET');
    req.flush({ user: { username: 'admin' } });
  });
});
