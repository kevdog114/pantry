import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EquipmentService } from '../../services/equipment.service';
import { Equipment } from '../../types/equipment';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Component({
    selector: 'app-equipment-edit',
    standalone: true,
    imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatNativeDateModule, MatButtonModule, MatIconModule, RouterModule],
    templateUrl: './equipment-edit.component.html',
    styleUrls: ['./equipment-edit.component.css']
})
export class EquipmentEditComponent implements OnInit {
    item: Equipment = { id: 0, name: '', createdAt: new Date(), updatedAt: new Date(), files: [] };
    isNew = true;

    constructor(
        private equipmentService: EquipmentService,
        private route: ActivatedRoute,
        private router: Router,
        private http: HttpClient
    ) { }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id && id !== 'add') {
            this.isNew = false;
            this.equipmentService.getById(parseInt(id)).subscribe(data => this.item = data);
        }
    }

    save() {
        if (this.isNew) {
            this.equipmentService.create(this.item).subscribe(saved => {
                this.router.navigate(['/equipment', 'edit', saved.id]);
            });
        } else {
            this.equipmentService.update(this.item.id, this.item).subscribe(() => {
                this.router.navigate(['/equipment']);
            });
        }
    }

    delete() {
        if (confirm("Are you sure?")) {
            this.equipmentService.delete(this.item.id).subscribe(() => this.router.navigate(['/equipment']));
        }
    }

    onFileSelected(event: any) {
        if (!event.target.files) return;
        const file: File = event.target.files[0];
        if (file && !this.isNew) {
            this.equipmentService.uploadFile(this.item.id, file).subscribe(fileRecord => {
                // refresh
                this.ngOnInit();
            });
        } else {
            alert("Please save the equipment first before uploading files.");
        }
    }

    printLabel() {
        this.http.post(`${environment.apiUrl}/labels/asset/${this.item.id}`, {}).subscribe({
            next: () => alert("Label printed!"),
            error: (err) => alert("Failed to print label")
        });
    }

    getFileUrl(file: any) {
        return `${environment.apiUrl}/files/${file.id}`;
    }
}
