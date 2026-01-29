import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MealItemSearchDialogComponent } from './meal-item-search-dialog.component';

describe('MealItemSearchDialogComponent', () => {
  let component: MealItemSearchDialogComponent;
  let fixture: ComponentFixture<MealItemSearchDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MealItemSearchDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MealItemSearchDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
