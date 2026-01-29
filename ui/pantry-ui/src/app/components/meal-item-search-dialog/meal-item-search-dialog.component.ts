import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

export interface MealItemSearchData {
  type: 'recipe' | 'product';
  items: any[]; // List of recipes or products
}

@Component({
  selector: 'app-meal-item-search-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatAutocompleteModule,
    MatInputModule,
    MatButtonModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    FormsModule
  ],
  template: `
    <h2 mat-dialog-title>Add {{ data.type | titlecase }}</h2>
    <mat-dialog-content>
        <mat-form-field appearance="fill" class="w-full" style="width: 100%; min-width: 300px;">
            <mat-label>Search {{ data.type }}</mat-label>
            <input type="text"
                   placeholder="Pick one"
                   matInput
                   [formControl]="searchControl"
                   [matAutocomplete]="auto">
            <mat-autocomplete #auto="matAutocomplete" [displayWith]="displayFn" (optionSelected)="onSelected($event)">
                <mat-option *ngFor="let item of filteredItems | async" [value]="item">
                    {{ item.title || item.name }}
                </mat-option>
            </mat-autocomplete>
        </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Cancel</button>
    </mat-dialog-actions>
  `,
  styles: []
})
export class MealItemSearchDialogComponent implements OnInit {
  searchControl = new FormControl('');
  filteredItems!: Observable<any[]>;

  constructor(
    public dialogRef: MatDialogRef<MealItemSearchDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MealItemSearchData
  ) { }

  ngOnInit() {
    this.filteredItems = this.searchControl.valueChanges.pipe(
      startWith(''),
      map(value => {
        const name = typeof value === 'string' ? value : (value as any)?.title;
        return name ? this._filter(name as string) : this.data.items.slice();
      })
    );
  }

  displayFn(item: any): string {
    return item && (item.title || item.name) ? (item.title || item.name) : '';
  }

  private _filter(name: string): any[] {
    const filterValue = name.toLowerCase();
    return this.data.items.filter(option =>
      (option.title || option.name).toLowerCase().includes(filterValue)
    );
  }

  onSelected(event: any) {
    this.dialogRef.close(event.option.value);
  }

  cancel() {
    this.dialogRef.close();
  }
}
