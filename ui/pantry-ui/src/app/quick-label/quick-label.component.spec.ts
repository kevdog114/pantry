import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { QuickLabelComponent } from './quick-label.component';

describe('QuickLabelComponent', () => {
  let component: QuickLabelComponent;
  let fixture: ComponentFixture<QuickLabelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickLabelComponent, HttpClientTestingModule, NoopAnimationsModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuickLabelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
