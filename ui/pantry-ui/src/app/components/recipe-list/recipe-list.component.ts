import { AfterViewInit, Component, OnDestroy } from "@angular/core";
import { RecipeListService } from "./recipe-list.service";
import { Recipe } from "../../types/recipe";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatDividerModule } from "@angular/material/divider";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { LocalStorageService } from "../../local-storage.service";
import { MatListModule } from "@angular/material/list";
import { MatInputModule } from "@angular/material/input";
import { MatRippleModule } from "@angular/material/core";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { Subject } from "rxjs";
import { debounceTime, distinctUntilChanged, takeUntil } from "rxjs/operators";

@Component({
    selector: 'recipe-list',
    templateUrl: "recipe-list.component.html",
    styleUrls: ["recipe-list.component.css"],
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        MatButtonModule,
        MatCardModule,
        MatFormFieldModule,
        MatDividerModule,
        MatSelectModule,
        MatButtonToggleModule,
        MatIconModule,
        MatListModule,
        MatInputModule,
        MatRippleModule,
        MatSlideToggleModule
    ]
})
export class RecipeListComponent implements AfterViewInit, OnDestroy {
    public recipes: Recipe[] = [];
    public searchQuery: string = '';
    public showInstructions: boolean = false;

    private searchSubject = new Subject<string>();
    private destroy$ = new Subject<void>();

    constructor(private svc: RecipeListService, private localStorage: LocalStorageService) {
        this.searchSubject.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            takeUntil(this.destroy$)
        ).subscribe(() => {
            this.loadRecipes();
        });
    }

    ngAfterViewInit(): void {
        this.loadRecipes();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onSearchInput(): void {
        this.searchSubject.next(this.searchQuery);
    }

    clearSearch(): void {
        this.searchQuery = '';
        this.loadRecipes();
    }

    onToggleInstructions(): void {
        this.loadRecipes();
    }

    loadRecipes(): void {
        this.svc.getAll({
            search: this.searchQuery || undefined,
            includeInstructions: this.showInstructions
        }).subscribe(res => {
            this.recipes = res;
        });
    }
}
