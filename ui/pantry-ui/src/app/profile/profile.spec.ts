import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { ProfileComponent } from './profile';
import { AuthService } from '../services/auth';
import { FormsModule } from '@angular/forms';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['changePassword']);

    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        FormsModule,
        ProfileComponent,
      ],
      providers: [
        { provide: AuthService, useValue: authServiceSpy }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call authService.changePassword on changePassword', () => {
    (authService.changePassword as jasmine.Spy).and.returnValue(of({}));
    component.passwords = { oldPassword: 'old', newPassword: 'new' };
    component.changePassword();
    expect(authService.changePassword).toHaveBeenCalledWith(component.passwords);
  });
});
