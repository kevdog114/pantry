import { AfterViewInit, Component, input, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Recipe } from '../types/recipe';
import { RecipeListService } from '../components/recipe-list/recipe-list.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-recipe-edit',
  standalone: true,
  imports: [FormsModule,
    MatFormFieldModule,
    CommonModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatTabsModule
  ],
  templateUrl: './recipe-edit.component.html',
  styleUrl: './recipe-edit.component.css'
})
export class RecipeEditComponent implements AfterViewInit {

  private isCreate: boolean = false;
  public recipe: Recipe | undefined = undefined;

  @Input()
  set id(recipeId: string) {
    if(recipeId !== undefined)
    {
      this.svc.get(parseInt(recipeId)).subscribe(p => {
        this.recipe = p;
      });
    }
    else {
      this.isCreate = true;
      this.recipe = {
        id: 0,
        title: "",
        description: ""
      }
    }
  }

  constructor(private svc: RecipeListService, private router: Router) {
  }

  ngAfterViewInit(): void {
  }

  public save = () => {
    if(this.recipe === undefined)
      return;

    if(this.isCreate)
    {
      this.svc.create(this.recipe).subscribe(p => {
        this.recipe = p;
        this.router.navigate(["recipes"]);
      });
    }
    else {
      this.svc.update(this.recipe).subscribe(p => {
        this.recipe = p;
        this.router.navigate(["recipes"]);
      });
    }

  }
}
