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
import { EnvironmentService } from '../../services/environment.service';
import { HttpClient } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
    selector: 'app-equipment-edit',
    standalone: true,
    imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatNativeDateModule, MatButtonModule, MatIconModule, RouterModule, MatProgressSpinnerModule, MatSnackBarModule],
    templateUrl: './equipment-edit.component.html',
    styleUrls: ['./equipment-edit.component.css']
})
export class EquipmentEditComponent implements OnInit {
    item: Equipment = { id: 0, name: '', createdAt: new Date(), updatedAt: new Date(), files: [] };
    isNew = true;
    isSaving = false;
    isDeleting = false;

    constructor(
        private equipmentService: EquipmentService,
        private route: ActivatedRoute,
        private router: Router,
        private http: HttpClient,
        private env: EnvironmentService,
        private snackBar: MatSnackBar
    ) { }

    ngOnInit(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (id && id !== 'add') {
            this.isNew = false;
            this.equipmentService.getById(parseInt(id)).subscribe(data => this.item = data);
        }
    }

    save() {
        this.isSaving = true;
        if (this.isNew) {
            this.equipmentService.create(this.item).subscribe({
                next: (saved) => {
                    this.snackBar.open('Equipment saved successfully', 'Close', { duration: 3000 });
                    this.router.navigate(['/equipment']);
                },
                error: (err) => {
                    this.isSaving = false;
                    console.error('Error saving equipment:', err);
                    this.snackBar.open('Failed to save equipment', 'Close', { duration: 3000 });
                }
            });
        } else {
            this.equipmentService.update(this.item.id, this.item).subscribe({
                next: () => {
                    this.snackBar.open('Equipment saved successfully', 'Close', { duration: 3000 });
                    this.router.navigate(['/equipment']);
                },
                error: (err) => {
                    this.isSaving = false;
                    console.error('Error saving equipment:', err);
                    this.snackBar.open('Failed to save equipment', 'Close', { duration: 3000 });
                }
            });
        }
    }

    delete() {
        if (confirm("Are you sure?")) {
            this.isDeleting = true;
            this.equipmentService.delete(this.item.id).subscribe({
                next: () => {
                    this.snackBar.open('Equipment deleted', 'Close', { duration: 3000 });
                    this.router.navigate(['/equipment']);
                },
                error: (err) => {
                    this.isDeleting = false;
                    console.error('Error deleting equipment:', err);
                    this.snackBar.open('Failed to delete equipment', 'Close', { duration: 3000 });
                }
            });
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
        this.http.post(`${this.env.apiUrl}/labels/asset/${this.item.id}`, {}).subscribe({
            next: () => alert("Label printed!"),
            error: (err) => alert("Failed to print label")
        });
    }

    getFileUrl(file: any) {
        return `${this.env.apiUrl}/files/${file.id}`;
    }
}
