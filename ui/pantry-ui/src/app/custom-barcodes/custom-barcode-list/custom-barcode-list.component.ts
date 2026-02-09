import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { CustomBarcodeService, CustomBarcode } from '../../services/custom-barcode.service';

@Component({
    selector: 'app-custom-barcode-list',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, MatCardModule],
    templateUrl: './custom-barcode-list.component.html',
    styleUrls: ['./custom-barcode-list.component.css']
})
export class CustomBarcodeListComponent implements OnInit {
    barcodes: CustomBarcode[] = [];

    constructor(private barcodeService: CustomBarcodeService) { }

    ngOnInit(): void {
        this.barcodeService.getAll().subscribe(data => this.barcodes = data);
    }

    getDisplayTitle(barcode: CustomBarcode): string {
        return barcode.title?.trim() ? barcode.title : '(Untitled)';
    }

    getPreviewData(barcode: CustomBarcode): string {
        if (barcode.data.length > 60) {
            return barcode.data.substring(0, 60) + '…';
        }
        return barcode.data;
    }
}
