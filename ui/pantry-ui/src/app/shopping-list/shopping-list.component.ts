
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { ShoppingListService, ShoppingList, ShoppingListItem } from '../services/shopping-list.service';

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
        MatListModule
    ],
    templateUrl: './shopping-list.component.html',
    styleUrl: './shopping-list.component.css'
})
export class ShoppingListComponent implements OnInit {
    shoppingList: ShoppingList | null = null;
    newItemName: string = '';

    constructor(private shoppingListService: ShoppingListService) { }

    ngOnInit(): void {
        this.loadList();
    }

    loadList() {
        this.shoppingListService.getShoppingList().subscribe(list => {
            this.shoppingList = list;
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
}
