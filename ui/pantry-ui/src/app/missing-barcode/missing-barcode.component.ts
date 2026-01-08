import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NavigationExtras, Router, RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { ProductListService } from '../components/product-list/product-list.service';
import { TagsService } from '../tags.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-missing-barcode',
  imports: [
    MatButtonModule,
    CommonModule,
    RouterModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './missing-barcode.component.html',
  styleUrl: './missing-barcode.component.css'
})
export class MissingBarcodeComponent {

  public ProductName: string = "";
  public ProductBrand: string = "";
  public foundProduct: boolean = false;
  public searchingProducts: boolean = true;

  public checkingMatch: boolean = false;
  public matchFound: boolean = false;
  public matchedProductTitle: string = "";
  public matchedProductId: number | null = null;
  public addingToExisting: boolean = false;

  private _barcode: string | undefined;

  @Input()
  set barcode(newBarcode: string | undefined) {
    this._barcode = newBarcode;
    this.checkBarcode(newBarcode);
  }
  get barcode() {
    return this._barcode;
  }

  constructor(
    private http: HttpClient,
    private router: Router,
    private productService: ProductListService,
    private tagsService: TagsService
  ) { }

  private checkBarcode(newBarcode: string | undefined) {
    if (!newBarcode) return;

    this.searchingProducts = true;
    this.foundProduct = false;
    this.checkingMatch = false;
    this.matchFound = false;

    this.http.get<any>("https://world.openfoodfacts.org/api/v2/product/" + newBarcode).subscribe(result => {
      console.log(result);
      if (result && result.product) {
        this.ProductName = result.product.product_name;
        this.ProductBrand = result.product.brands;
        this.foundProduct = true;

        // Check for variation match
        this.checkGeminiMatch();
      }

      this.searchingProducts = false;
    }, () => {
      this.searchingProducts = false;
    })
  }

  private checkGeminiMatch() {
    this.checkingMatch = true;
    this.http.post<any>(`${environment.apiUrl}/gemini/product-match`, {
      productName: this.ProductName,
      brand: this.ProductBrand
    }).subscribe(res => {
      this.checkingMatch = false;
      if (res.matchId) {
        this.matchFound = true;
        this.matchedProductId = res.matchId;
        this.matchedProductTitle = res.matchTitle;
      }
    }, err => {
      this.checkingMatch = false;
      console.error(err);
    });
  }

  public createProduct = () => {
    var queryOptions: NavigationExtras | undefined = undefined;

    if (this.foundProduct) {
      queryOptions = {
        queryParams: {
          productName: this.ProductName,
          barcodes: [
            this.barcode
          ],
          brand: this.ProductBrand
        }
      };
    }

    this.router.navigate(["products", "create"], queryOptions);
  }

  public addToExisting = async () => {
    if (!this.matchedProductId) return;
    this.addingToExisting = true;

    try {
      // 1. Get Suggestion
      const suggestionRes = await firstValueFrom(this.http.post<any>(`${environment.apiUrl}/gemini/barcode-details`, {
        productName: this.ProductName,
        brand: this.ProductBrand,
        existingProductTitle: this.matchedProductTitle
      }));

      const suggestion = suggestionRes.data.data ? suggestionRes.data.data : suggestionRes.data; // Handle potential wrapping (response.data vs response)
      // controller returns res.json({ data, warning });
      // Angular HttpClient returns parsed JSON. so result is { data: {...}, warning: ... }
      // so suggestion is result.data

      // 2. Process Tags
      const allTags = await firstValueFrom(this.tagsService.GetAll());
      const tagIds: number[] = [];

      if (suggestion.tags && Array.isArray(suggestion.tags)) {
        for (const tagName of suggestion.tags) {
          const existingTag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
          if (existingTag) {
            tagIds.push(existingTag.id);
          } else {
            // Create new tag
            const newTag = await firstValueFrom(this.tagsService.Create({ name: tagName, group: 'General' } as any));
            tagIds.push(newTag.id);
          }
        }
      }

      // 3. Update Product
      const product = await firstValueFrom(this.productService.Get(this.matchedProductId));

      const updatedBarcodes = product.barcodes.map(b => ({
        barcode: b.barcode,
        brand: b.brand,
        description: b.description,
        tareWeight: b.tareWeight,
        tags: b.tags.map(t => ({ id: t.id }))
      }));

      updatedBarcodes.push({
        barcode: this.barcode!,
        brand: this.ProductBrand,
        description: suggestion.description,
        tareWeight: undefined,
        tags: tagIds.map(id => ({ id }))
      });

      const updatePayload: any = {
        ...product,
        barcodes: updatedBarcodes
      };

      await firstValueFrom(this.productService.Update(updatePayload));

      // Navigate
      this.router.navigate(['products', this.matchedProductId]);

    } catch (e) {
      console.error("Error adding to existing", e);
      this.addingToExisting = false;
    }
  }
}
