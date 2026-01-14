import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { EquipmentService } from '../../services/equipment.service';
import { Equipment } from '../../types/equipment';
import { MatCardModule } from '@angular/material/card';
import { environment } from '../../../environments/environment';

@Component({
    selector: 'app-equipment-list',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, MatCardModule],
    templateUrl: './equipment-list.component.html',
    styleUrls: ['./equipment-list.component.css']
})
export class EquipmentListComponent implements OnInit {
    items: Equipment[] = [];

    constructor(private equipmentService: EquipmentService) { }

    ngOnInit(): void {
        this.equipmentService.getAll().subscribe(data => this.items = data);
    }

    hasImage(item: Equipment): boolean {
        return item.files !== undefined && item.files.length > 0;
    }

    getImageUrl(item: Equipment): string {
        if (this.hasImage(item)) {
            return `${environment.apiUrl}/files/${item.files![0].id}`;
        }
        return '';
    }
}
