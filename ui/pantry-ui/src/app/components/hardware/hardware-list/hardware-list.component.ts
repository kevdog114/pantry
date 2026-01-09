import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KioskService, Kiosk } from '../../../services/kiosk.service';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-hardware-list',
    standalone: true,
    imports: [CommonModule, MatCardModule, MatListModule, MatIconModule, MatButtonModule],
    templateUrl: './hardware-list.component.html',
    styleUrls: ['./hardware-list.component.css']
})
export class HardwareListComponent implements OnInit {
    kiosks: Kiosk[] = [];

    constructor(private kioskService: KioskService) { }

    ngOnInit() {
        this.kioskService.getKiosks().subscribe(kiosks => {
            this.kiosks = kiosks;
        });
    }
}
