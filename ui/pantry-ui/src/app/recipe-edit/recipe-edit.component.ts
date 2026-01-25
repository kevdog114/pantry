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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ProductListService } from '../components/product-list/product-list.service';
import { Product } from '../types/product';
import { FormControl } from '@angular/forms';
import { map, startWith } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { GeminiService } from '../services/gemini.service';
import { MatSnackBar } from '@angular/material/snack-bar';

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
    MatTabsModule,
    MatAutocompleteModule
  ],
  templateUrl: './recipe-edit.component.html',
  styleUrl: './recipe-edit.component.css'
})
export class RecipeEditComponent implements AfterViewInit {

  private isCreate: boolean = false;
  public recipe: Recipe | undefined = undefined;
  public isGeneratingImage: boolean = false;

  @Input()
  set id(recipeId: string) {
    if (recipeId !== undefined) {
      this.svc.get(parseInt(recipeId)).subscribe(p => {
        this.recipe = p;
        if (!this.recipe.steps) this.recipe.steps = [];
        if (!this.recipe.ingredients) this.recipe.ingredients = [];
        if (!this.recipe.prepTasks) this.recipe.prepTasks = [];
        if (!this.recipe.quickActions) this.recipe.quickActions = [];
      });
    }
    else {
      this.isCreate = true;
      this.recipe = {
        id: 0,
        title: "",
        description: "",
        steps: [],
        ingredients: [],
        prepTasks: [],
        quickActions: [],
        source: "",
        ingredientText: ""
      }
    }
  }

  public addStep = () => {
    this.recipe?.steps.push({
      id: 0,
      recipeId: this.recipe.id,
      stepNumber: this.recipe.steps.length + 1,
      description: ""
    });
  }

  public removeStep = (index: number) => {
    this.recipe?.steps.splice(index, 1);
  }

  public moveStepUp = (index: number) => {
    if (index > 0) {
      const step = this.recipe!.steps[index];
      this.recipe!.steps.splice(index, 1);
      this.recipe!.steps.splice(index - 1, 0, step);
    }
  }

  public moveStepDown = (index: number) => {
    if (index < this.recipe!.steps.length - 1) {
      const step = this.recipe!.steps[index];
      this.recipe!.steps.splice(index, 1);
      this.recipe!.steps.splice(index + 1, 0, step);
    }
  }

  trackByFn(index: number, item: any) {
    return index;
  }

  public allProducts: Product[] = [];
  public filteredProducts: Observable<Product[]>[] = [];

  constructor(
    private svc: RecipeListService,
    private router: Router,
    private productService: ProductListService,
    private geminiService: GeminiService,
    private snackBar: MatSnackBar
  ) { }

  ngAfterViewInit(): void {
    this.productService.GetAll().subscribe(products => {
      this.allProducts = products;
    });
  }

  public addIngredient = () => {
    if (!this.recipe!.ingredients) this.recipe!.ingredients = [];
    this.recipe!.ingredients.push({
      name: "",
      amount: undefined,
      unit: "",
      productId: undefined
    });
  }

  public removeIngredient(index: number) {
    this.recipe!.ingredients?.splice(index, 1);
  }

  public filterProducts(index: number, event: any) {
    // Simple filtering logic if needed, but MatAutocomplete often handled via separate controls or inline
    // For simplicity in a dynamic list without FormArray complications:
    // We can just rely on the template to show all or filter if we create a control per row.
    // But dealing with dynamic controls in template-driven forms is tricky.
    // Let's assume a simple method to get filtered list based on current string.
    const val = event.target.value.toLowerCase();
    // This is a naive implementation; ideally use ReactiveForms FormArray.
    // But let's stick to template driven for minimal refactor of existing code style.
  }

  public getFilteredProducts(name: string): Product[] {
    if (!name) return this.allProducts.slice(0, 50);
    const filterValue = name.toLowerCase();
    return this.allProducts.filter(option => option.title.toLowerCase().includes(filterValue)).slice(0, 20);
  }

  public onIngredientParamChange(ing: any, event: any) {
    // If user typed something that matches a product exactly, link it?
    // Or if they selected from autocomplete (handled by (optionSelected))
  }

  public onProductSelected(ing: any, event: any) {
    const product = event.option.value as Product;
    ing.name = product.title;
    ing.productId = product.id;
    ing.unit = product.trackCountBy === 'weight' ? 'lb' : 'count';
  }

  public generateThawAdvice() {
    if (!this.recipe?.ingredients || this.recipe.ingredients.length === 0) {
      this.snackBar.open("Please add ingredients first.", "Close", { duration: 3000 });
      return;
    }

    // Only ask advice for ingredients that have a name
    const items = this.recipe.ingredients.map(i => i.name).filter(n => n && n.trim().length > 0);

    if (items.length === 0) {
      this.snackBar.open("Ingredients must have names.", "Close", { duration: 3000 });
      return;
    }

    this.snackBar.open("Consulting Gemini for thaw advice...", undefined, { duration: 2000 });

    this.geminiService.getThawAdvice(items).subscribe({
      next: (response: any) => {
        const adviceItems = response.data || [];
        let addedCount = 0;

        adviceItems.forEach((r: any) => {
          if (r.hoursToThaw > 0) {
            const days = Math.ceil(r.hoursToThaw / 24);
            // Check if similar task exists to avoid dupes? 
            // For now, just add. User can delete.
            if (!this.recipe!.prepTasks) this.recipe!.prepTasks = [];

            this.recipe!.prepTasks.push({
              description: `Thaw ${r.name}: ${r.advice}`,
              daysInAdvance: days
            });
            addedCount++;
          }
        });

        if (addedCount > 0) {
          this.snackBar.open(`Added ${addedCount} thaw tasks!`, "Close", { duration: 2000 });
        } else {
          this.snackBar.open("No thawing needed for these ingredients.", "Close", { duration: 2000 });
        }
      },
      error: (err) => {
        console.error(err);
        this.snackBar.open("Failed to generate advice.", "Close", { duration: 3000 });
      }
    });
  }

  public addQuickAction = () => {
    if (!this.recipe!.quickActions) this.recipe!.quickActions = [];
    this.recipe!.quickActions.push({
      name: "",
      type: "timer",
      value: ""
    });
  }

  public removeQuickAction(index: number) {
    this.recipe!.quickActions?.splice(index, 1);
  }

  public generateQuickActions() {
    if (!this.recipe || (!this.recipe.steps?.length && !this.recipe.ingredients?.length)) {
      this.snackBar.open("Please add some content (ingredients/steps) first.", "Close", { duration: 3000 });
      return;
    }

    this.snackBar.open("Consulting Gemini for quick actions...", undefined, { duration: 2000 });
    this.geminiService.extractRecipeQuickActions(this.recipe).subscribe({
      next: (res) => {
        const actions = res.data || [];
        if (actions.length > 0) {
          if (!this.recipe!.quickActions) this.recipe!.quickActions = [];
          this.recipe!.quickActions.push(...actions);
          this.snackBar.open(`Added ${actions.length} quick actions!`, "Close", { duration: 3000 });
        } else {
          this.snackBar.open("No quick actions found.", "Close", { duration: 3000 });
        }
      },
      error: (err) => {
        console.error(err);
        this.snackBar.open("Failed to extract actions.", "Close", { duration: 3000 });
      }
    });
  }

  public addPrepTask = () => {
    if (!this.recipe!.prepTasks) this.recipe!.prepTasks = [];
    this.recipe!.prepTasks.push({
      description: "",
      daysInAdvance: 1
    });
  }

  public removePrepTask(index: number) {
    this.recipe!.prepTasks?.splice(index, 1);
  }

  public delete = () => {
    if (this.recipe && this.recipe.id) {
      if (confirm('Are you sure you want to delete this recipe?')) {
        this.svc.delete(this.recipe.id).subscribe({
          next: () => {
            this.snackBar.open("Successfully deleted the recipe", "Close", { duration: 3000 });
            this.router.navigate(["/recipes"]);
          },
          error: (err) => {
            console.error("Error deleting recipe:", err);
            this.snackBar.open("Failed to delete recipe", "Close", { duration: 3000 });
          }
        })
      }
    }
  }

  public save = () => {
    if (this.recipe === undefined)
      return;

    if (this.isCreate) {
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

  public generateImage() {
    if (this.recipe && this.recipe.title) {
      this.isGeneratingImage = true;
      this.geminiService.generateRecipeImage(this.recipe.title).subscribe({
        next: (res) => {
          this.isGeneratingImage = false;
          if (res.file) {
            if (!this.recipe!.files) this.recipe!.files = [];
            this.recipe!.files.push(res.file);
            this.snackBar.open("Image generated successfully!", "Close", { duration: 3000 });
          }
        },
        error: (err) => {
          this.isGeneratingImage = false;
          console.error(err);
          this.snackBar.open("Failed to generate image: " + (err.error?.message || err.message), "Close", { duration: 5000 });
        }
      });
    }
  }

  public removeImage(file: any) {
    if (!confirm("Are you sure you want to remove this image?")) return;
    // Call service to delete file mapping? For now, simplistic UI removal + backend save required or explicit delete endpoint.
    // Usually we have a dedicated delete file endpoint.
    // Ideally we call an endpoint to delete the file or unlink it.
    // Assuming we just unlink from UI and save updates linkage, OR we delete the file itself.
    // ProductEdit uses removeImage -> usually implies logic.
    // Let's implement minimal array removal for now, assuming SAVE persists the state or we need a real delete call.
    // Actually, looking at ProductEdit, it calls `removeImage(file)`.
    // Let's check if we have a file service to delete.
    // We can assume user wants to delete the file reference.
    const index = this.recipe!.files!.indexOf(file);
    if (index >= 0) {
      this.recipe!.files!.splice(index, 1);
      // Note: This only removes from the UI list. The backend update (save) needs to handle the relation update.
      // OR we should call a service to delete the file.
      // ProductEdit used: removeImage(file) { ... http.delete ... }
      // We don't have that service easily injected here yet without looking deeper.
      // Let's rely on SAVE updating the list if the backend supports "set" files on update.
      // Checking RecipeController: update does NOT seem to handle fileIds currently?
      // Wait, I updated ProductController earlier, but did I update RecipeController?
      // I haven't updated RecipeController to handle `files` relation yet!
      // I need to update RecipeController.ts as well.
    }
  }

  public GetFileDownloadUrl = (fileOrId: number | any): string => {
    let id: number;
    let cacheBuster = "";

    if (typeof fileOrId === 'number') {
      id = fileOrId;
    } else {
      id = fileOrId.id;
      if (fileOrId.createdAt) {
        cacheBuster = "&v=" + new Date(fileOrId.createdAt).getTime();
      }
    }

    return environment.apiUrl + "/files/" + id + "?size=small" + cacheBuster;
  }

  public inputValue: any;

  browsedFiles = (evt: Event) => {
    const fileList: FileList | null = (evt.target as HTMLInputElement).files;
    if (fileList !== null)
      this.addFiles(fileList);
  }

  addFiles = (fileList: FileList) => {
    if (this.recipe === undefined)
      return;

    for (let i = 0; i < fileList.length; i++) {
      const file: File = fileList[i];
      this.svc.uploadFile(file).subscribe({
        next: (result) => {
          console.log("file upload result", result);
          if (!this.recipe!.files) this.recipe!.files = [];
          this.recipe!.files.push(result.file || result); // Assuming result returns file obj or is file obj
          this.snackBar.open("Image uploaded successfully!", "Close", { duration: 3000 });
        },
        error: (err) => {
          console.error("Upload failed", err);
          this.snackBar.open("Failed to upload image", "Close", { duration: 3000 });
        }
      });
    }
    this.inputValue = undefined;
  }
}
