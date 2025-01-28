import { TestBed } from '@angular/core/testing';

import { HardwareBarcodeScannerService } from './hardware-barcode-scanner.service';

describe('HardwareBarcodeScannerService', () => {
  let service: HardwareBarcodeScannerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HardwareBarcodeScannerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
