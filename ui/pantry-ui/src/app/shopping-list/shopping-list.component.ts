
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShoppingListService, ShoppingList, ShoppingListItem } from '../services/shopping-list.service';
import { GeminiService } from '../services/gemini.service';

@Component({
    selector: 'app-shopping-list',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatCheckboxModule,
        MatCheckboxModule,
        MatListModule,
        MatMenuModule,
        MatTooltipModule
    ],
    templateUrl: './shopping-list.component.html',
    styleUrl: './shopping-list.component.css'
})
export class ShoppingListComponent implements OnInit {
    shoppingList: ShoppingList | null = null;
    newItemName: string = '';

    isLoading: boolean = true;
    isSorting: boolean = false;
    error: string | null = null;

    constructor(
        private shoppingListService: ShoppingListService,
        private geminiService: GeminiService
    ) { }

    ngOnInit(): void {
        this.loadList();
    }

    loadList() {
        this.isLoading = true;
        this.error = null;
        this.shoppingListService.getShoppingList().subscribe({
            next: (list) => {
                this.shoppingList = list;
                this.isLoading = false;
            },
            error: (err) => {
                console.error('Failed to load shopping list', err);
                this.error = 'Failed to load shopping list. Please try again later.';
                this.isLoading = false;
            }
        });
    }

    addItem() {
        if (!this.newItemName.trim() || !this.shoppingList) return;

        this.shoppingListService.addItem(this.shoppingList.id, { name: this.newItemName, quantity: 1 })
            .subscribe(item => {
                this.shoppingList?.items.push(item);
                this.newItemName = '';
            });
    }

    toggleCheck(item: ShoppingListItem) {
        this.shoppingListService.updateItem(item.id, { checked: !item.checked })
            .subscribe(updated => {
                item.checked = updated.checked;
            });
    }

    deleteItem(item: ShoppingListItem) {
        this.shoppingListService.deleteItem(item.id).subscribe(() => {
            if (this.shoppingList) {
                this.shoppingList.items = this.shoppingList.items.filter(i => i.id !== item.id);
            }
        });
    }

    clearChecked() {
        if (!this.shoppingList) return;
        this.shoppingListService.clearChecked(this.shoppingList.id).subscribe(() => {
            if (this.shoppingList) {
                this.shoppingList.items = this.shoppingList.items.filter(i => !i.checked);
            }
        });
    }

    sortAlphabetical() {
        if (!this.shoppingList) return;
        this.shoppingList.items.sort((a, b) => a.name.localeCompare(b.name));
    }

    sortSmart() {
        if (!this.shoppingList || this.shoppingList.items.length === 0) return;

        this.isSorting = true;
        const names = this.shoppingList.items.map(item => item.name);

        this.geminiService.sortShoppingList(names).subscribe({
            next: (response) => {
                if (response.sortedItems && this.shoppingList) {
                    const sortedNames = response.sortedItems;
                    this.shoppingList.items.sort((a, b) => {
                        const indexA = sortedNames.indexOf(a.name);
                        const indexB = sortedNames.indexOf(b.name);

                        if (indexA === -1 && indexB === -1) return 0;
                        if (indexA === -1) return 1;
                        if (indexB === -1) return -1;
                        return indexA - indexB;
                    });
                }
                this.isSorting = false;
            },
            error: (err) => {
                console.error("Smart sort failed", err);
                this.isSorting = false;
            }
        });
    }
}
