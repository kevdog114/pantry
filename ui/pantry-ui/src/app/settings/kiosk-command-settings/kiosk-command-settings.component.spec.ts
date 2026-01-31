import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { KioskCommandSettingsComponent } from './kiosk-command-settings.component';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('KioskCommandSettingsComponent', () => {
  let component: KioskCommandSettingsComponent;
  let fixture: ComponentFixture<KioskCommandSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KioskCommandSettingsComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(KioskCommandSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
