import { TestBed } from '@angular/core/testing';

import { KitchenLogisticsService } from './kitchen-logistics.service';

describe('KitchenLogisticsService', () => {
  let service: KitchenLogisticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(KitchenLogisticsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
