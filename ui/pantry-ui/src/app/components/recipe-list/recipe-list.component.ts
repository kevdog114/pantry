import { AfterViewInit, Component } from "@angular/core";
import { RecipeService } from "../../services/recipe.service";
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
    ]
})
export class RecipeListComponent implements AfterViewInit {
    public recipes: Recipe[] = [];

    constructor(private svc: RecipeService, private localStorage: LocalStorageService) {
    }

    ngAfterViewInit(): void {
        this.svc.getAll().subscribe(res => {
            this.recipes = res;
        });
    }
}
