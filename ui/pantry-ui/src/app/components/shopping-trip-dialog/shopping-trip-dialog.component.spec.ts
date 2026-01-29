import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShoppingTripDialogComponent } from './shopping-trip-dialog.component';

describe('ShoppingTripDialogComponent', () => {
  let component: ShoppingTripDialogComponent;
  let fixture: ComponentFixture<ShoppingTripDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingTripDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShoppingTripDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
