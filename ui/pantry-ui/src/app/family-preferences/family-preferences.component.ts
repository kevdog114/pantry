import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FamilyService, FamilyMember } from '../services/family.service';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-family-preferences',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MatCardModule,
        MatButtonModule,
        MatInputModule,
        MatFormFieldModule,
        MatIconModule,
        MatDatepickerModule,
        MatNativeDateModule,
        MatTooltipModule
    ],
    templateUrl: './family-preferences.component.html',
    styleUrls: ['./family-preferences.component.css']
})
export class FamilyPreferencesComponent implements OnInit {
    members: FamilyMember[] = [];
    generalPreferences = '';
    memberForm: FormGroup;
    editingMemberId: number | null = null;
    showForm = false;
    savingGeneral = false;

    constructor(
        private familyService: FamilyService,
        private fb: FormBuilder
    ) {
        this.memberForm = this.fb.group({
            name: ['', Validators.required],
            dateOfBirth: [''],
            preferences: ['']
        });
    }

    ngOnInit(): void {
        this.loadData();
    }

    loadData(): void {
        this.familyService.getGeneralPreferences().subscribe(res => {
            this.generalPreferences = res.preferences;
        });
        this.familyService.getMembers().subscribe(members => {
            this.members = members;
        });
    }

    saveGeneralPreferences(): void {
        this.savingGeneral = true;
        this.familyService.saveGeneralPreferences(this.generalPreferences).subscribe(() => {
            this.savingGeneral = false;
        });
    }

    startAddMember(): void {
        this.editingMemberId = null;
        this.memberForm.reset();
        this.showForm = true;
    }

    editMember(member: FamilyMember): void {
        this.editingMemberId = member.id;
        this.memberForm.patchValue({
            name: member.name,
            dateOfBirth: member.dateOfBirth ? member.dateOfBirth.split('T')[0] : '',
            preferences: member.preferences
        });
        this.showForm = true;
    }

    cancelEdit(): void {
        this.showForm = false;
        this.editingMemberId = null;
    }

    saveMember(): void {
        if (this.memberForm.invalid) return;

        const data = this.memberForm.value;
        if (this.editingMemberId) {
            this.familyService.updateMember(this.editingMemberId, data).subscribe(() => {
                this.loadData();
                this.cancelEdit();
            });
        } else {
            this.familyService.createMember(data).subscribe(() => {
                this.loadData();
                this.cancelEdit();
            });
        }
    }

    deleteMember(id: number): void {
        if (confirm('Are you sure you want to delete this family member?')) {
            this.familyService.deleteMember(id).subscribe(() => {
                this.loadData();
            });
        }
    }
}
