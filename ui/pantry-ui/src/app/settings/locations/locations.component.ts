import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { MatListModule } from '@angular/material/list';
import { LocationService } from '../../services/location.service';
import { Location } from '../../types/product';

@Component({
    selector: 'app-locations',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatListModule,
        FormsModule
    ],
    templateUrl: './locations.component.html',
    styleUrl: './locations.component.css'
})
export class LocationsComponent implements OnInit {
    locations: Location[] = [];
    newLocationName: string = '';
    newLocationDescription: string = '';

    constructor(private locationService: LocationService) { }

    ngOnInit() {
        this.refresh();
    }

    refresh() {
        this.locationService.getAll().subscribe(locs => {
            this.locations = locs;
        });
    }

    add() {
        if (!this.newLocationName) return;
        this.locationService.create({
            name: this.newLocationName,
            description: this.newLocationDescription
        }).subscribe(() => {
            this.refresh();
            this.newLocationName = '';
            this.newLocationDescription = '';
        });
    }

    delete(id: number) {
        if (confirm('Are you sure you want to delete this location?')) {
            this.locationService.delete(id).subscribe(() => this.refresh());
        }
    }
}
