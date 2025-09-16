import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { Tag, TagsService } from '../tags.service';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-tags',
  imports: [
    MatCardModule,
    MatInputModule,
    MatIconModule,
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatAutocompleteModule,
    ReactiveFormsModule
  ],
  standalone: true,
  templateUrl: './tags.component.html',
  styleUrls: ['./tags.component.css']
})
export class TagsComponent implements OnInit {

  @Input() barcode: any;
  
  tagCtrl = new FormControl();
  allTags: Tag[] = [];
  filteredTags: Observable<Tag[]>;

  @ViewChild('tagInput') tagInput!: ElementRef<HTMLInputElement>;

  constructor(private svc: TagsService) {
    this.filteredTags = this.tagCtrl.valueChanges.pipe(
      startWith(null),
      map((tag: string | null) => tag ? this._filter(tag) : this.allTags.slice()));
  }

  ngOnInit(): void {
    this.svc.GetAll().subscribe(tags => {
      this.allTags = tags.filter(t => t.taggroup === 'Category');
    });
    if (!this.barcode.Tags) {
      this.barcode.Tags = [];
    }
  }

  add(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value;
    if (value && !this.barcode.Tags.find((t: Tag) => t.id === value.id)) {
      this.barcode.Tags.push(value);
    }
    this.tagInput.nativeElement.value = '';
    this.tagCtrl.setValue(null);
  }

  remove(tag: Tag): void {
    const index = this.barcode.Tags.indexOf(tag);

    if (index >= 0) {
      this.barcode.Tags.splice(index, 1);
    }
  }

  private _filter(value: string): Tag[] {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : '';
    return this.allTags.filter(tag => tag.tagname.toLowerCase().includes(filterValue));
  }
}
