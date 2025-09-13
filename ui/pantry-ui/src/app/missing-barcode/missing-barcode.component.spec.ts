import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MissingBarcodeComponent } from './missing-barcode.component';

describe('MissingBarcodeComponent', () => {
  let component: MissingBarcodeComponent;
  let fixture: ComponentFixture<MissingBarcodeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MissingBarcodeComponent, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MissingBarcodeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
