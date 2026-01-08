import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { Tag, TagsService } from '../tags.service';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { ENTER, COMMA } from '@angular/cdk/keycodes';

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

  @Input() category!: string;
  @Input() selectedTags: Tag[] = [];
  @Output() selectionChange = new EventEmitter<Tag[]>();

  tagCtrl = new FormControl();
  allTags: Tag[] = [];
  filteredTags: Observable<Tag[]>;
  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  @ViewChild('tagInput') tagInput!: ElementRef<HTMLInputElement>;

  constructor(private svc: TagsService) {
    this.filteredTags = this.tagCtrl.valueChanges.pipe(
      startWith(null),
      map((tag: string | null) => tag ? this._filter(tag) : this.allTags.slice()));
  }

  ngOnInit(): void {
    this.svc.GetAll().subscribe(tags => {
      this.allTags = tags.filter(t => t.group === this.category);
    });
    if (!this.selectedTags) {
      this.selectedTags = [];
    }
  }

  add(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value;
    if (value && !this.selectedTags.find((t: Tag) => t.id === value.id)) {
      this.selectedTags.push(value);
      this.selectionChange.emit(this.selectedTags);
    }
    this.tagInput.nativeElement.value = '';
    this.tagCtrl.setValue(null);
  }

  addTag(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();

    if (value) {
      // Check if it exists in allTags (which are filtered by category/group)
      let existingTag = this.allTags.find(t => t.name.toLowerCase() === value.toLowerCase());

      if (existingTag) {
        if (!this.selectedTags.find(t => t.id === existingTag.id)) {
          this.selectedTags.push(existingTag);
          this.selectionChange.emit(this.selectedTags);
        }
      } else {
        // Create new tag
        const newTag: Tag = { id: 0, name: value, group: this.category };
        this.svc.Create(newTag).subscribe(createdTag => {
          this.allTags.push(createdTag);
          // Only add to selected if it matches the current category, which it should since we just created it with that category
          this.selectedTags.push(createdTag);
          this.selectionChange.emit(this.selectedTags);
        });
      }
    }

    event.chipInput!.clear();
    this.tagCtrl.setValue(null);
  }

  remove(tag: Tag): void {
    const index = this.selectedTags.indexOf(tag);

    if (index >= 0) {
      this.selectedTags.splice(index, 1);
      this.selectionChange.emit(this.selectedTags);
    }
  }

  private _filter(value: string): Tag[] {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : '';
    // Use 'name' instead of 'tagname'
    return this.allTags.filter(tag => tag.name.toLowerCase().includes(filterValue));
  }
}
