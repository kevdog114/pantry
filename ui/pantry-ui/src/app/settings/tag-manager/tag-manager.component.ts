import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Tag, TagsService } from '../../tags.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
    selector: 'app-tag-manager',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatTableModule,
        MatButtonModule,
        MatIconModule,
        MatSnackBarModule
    ],
    templateUrl: './tag-manager.component.html',
    styleUrls: ['./tag-manager.component.css']
})
export class TagManagerComponent implements OnInit {
    displayedColumns: string[] = ['name', 'group', 'count', 'actions'];
    dataSource: Tag[] = [];

    constructor(private tagsService: TagsService, private snackBar: MatSnackBar) { }

    ngOnInit(): void {
        this.refresh();
    }

    refresh() {
        this.tagsService.GetAll().subscribe(tags => {
            this.dataSource = tags;
        });
    }

    edit(tag: Tag) {
        const newName = window.prompt("Enter new name for tag:", tag.name);
        if (newName && newName !== tag.name) {
            tag.name = newName;
            this.tagsService.UpdateById(tag.id, tag).subscribe(() => {
                this.snackBar.open("Tag updated", "Close", { duration: 3000 });
                this.refresh();
            });
        }
    }

    delete(tag: Tag) {
        if (confirm(`Are you sure you want to delete tag '${tag.name}'?`)) {
            this.tagsService.Delete(tag.id).subscribe(() => {
                this.snackBar.open("Tag deleted", "Close", { duration: 3000 });
                this.refresh();
            });
        }
    }
}
