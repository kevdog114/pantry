import { AfterViewInit, Component, input, Input } from '@angular/core';
import { TagsComponent } from '../tags/tags.component';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FileMeta, Product, ProductBarcode } from '../types/product';
import { ProductListService } from '../components/product-list/product-list.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { EnvironmentService } from '../services/environment.service';
import { MatTabsModule } from '@angular/material/tabs';
import { GeminiService } from '../services/gemini.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';


@Component({
  selector: 'app-product-edit',
  imports: [FormsModule,
    MatFormFieldModule,
    CommonModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatTabsModule,
    TagsComponent,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSelectModule,
    MatTooltipModule
  ],
  templateUrl: './product-edit.component.html',
  styleUrl: './product-edit.component.css'
})
export class ProductEditComponent implements AfterViewInit {

  public isCreate: boolean = false;
  public product: Product | undefined = undefined;
  public isAskingAi: boolean = false;
  public isGeneratingImage: boolean = false;
  public isAnalyzingPhoto: boolean = false;
  public isLookingUpBarcode: boolean = false;
  public showBarcodeInput: boolean = false;
  public barcodeInput: string = '';

  private queryData = {
    productTitle: <string | undefined>"",
    barcodes: <string[] | undefined>[],
    brand: <string | undefined>""
  };

  @Input("productName")
  set productTitleQuery(newProductTitle: string | undefined) {
    console.log("product title", newProductTitle);
    this.queryData.productTitle = newProductTitle;
  }

  @Input("barcodes")
  set barcodeQuery(newBarcodes: string[] | string | undefined) {
    console.log("Barcodes", newBarcodes);
    if (newBarcodes !== undefined) {
      if ((newBarcodes as string[]).forEach)
        this.queryData.barcodes = newBarcodes as string[];
      else
        this.queryData.barcodes = [newBarcodes as string];
    }
  }

  @Input("brand")
  set brandQuery(newBrand: string | undefined) {
    this.queryData.brand = newBrand;
  }

  @Input()
  set id(productId: number) {
    if (productId !== undefined) {
      this.svc.Get(productId).subscribe(p => {
        this.product = p;
      });
    }
    else {
      this.isCreate = true;
      this.product = {
        fileIds: [],
        files: [],
        tags: [],
        id: 0,
        barcodes: [],
        stockItems: [],
        title: ""
      }
    }
  }

  constructor(private svc: ProductListService, private router: Router, private geminiService: GeminiService, private snackBar: MatSnackBar, private env: EnvironmentService) {
  }

  public askGeminiProductDetails() {
    if (this.product && this.product.title) {
      this.isAskingAi = true;
      this.geminiService.getProductDetailsSuggestion(this.product.title)
        .subscribe({
          next: (response) => {
            this.isAskingAi = false;
            if (response.message === 'success' && response.data) {
              const data = response.data;
              if (this.product) {
                if (data.freezerLifespanDays) this.product.freezerLifespanDays = data.freezerLifespanDays;
                if (data.refrigeratorLifespanDays) this.product.refrigeratorLifespanDays = data.refrigeratorLifespanDays;
                if (data.openedLifespanDays) this.product.openedLifespanDays = data.openedLifespanDays;
                if (data.pantryLifespanDays) this.product.pantryLifespanDays = data.pantryLifespanDays;
                if (data.trackCountBy) this.product.trackCountBy = data.trackCountBy;
              }
              if (response.warning) {
                this.snackBar.open(response.warning, 'Close', { duration: 5000 });
              }
            }
          },
          error: (err) => {
            console.error('Error fetching details suggestion:', err);
            this.isAskingAi = false;
          }
        });
    }
  }

  ngAfterViewInit(): void {
    if (this.isCreate) {
      if (this.queryData.productTitle)
        this.product!.title = this.queryData.productTitle;
      if (this.queryData.barcodes) {
        this.queryData.barcodes.forEach(barcode => {
          this.product?.barcodes.push({
            barcode: barcode,
            ProductId: this.product!.id,
            brand: this.queryData.brand || "",
            description: "",
            id: 0,
            quantity: 0,
            tags: []
          });
        })
      }
    }
  }

  public generateImage() {
    if (this.product && this.product.title) {
      this.isGeneratingImage = true;
      this.geminiService.generateProductImage(this.product.title).subscribe({
        next: (res) => {
          this.isGeneratingImage = false;
          if (res.file) {
            this.product?.files.push(res.file);
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

  public onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.isAnalyzingPhoto = true;

    this.geminiService.analyzeProductImage(file).subscribe({
      next: (res) => {
        this.isAnalyzingPhoto = false;
        if (res.message === 'success' && res.data) {
          const data = res.data;
          if (this.product) {
            if (data.title && data.title !== 'Unknown') this.product.title = data.title;
            if (data.freezerLifespanDays != null) this.product.freezerLifespanDays = data.freezerLifespanDays;
            if (data.refrigeratorLifespanDays != null) this.product.refrigeratorLifespanDays = data.refrigeratorLifespanDays;
            if (data.openedLifespanDays != null) this.product.openedLifespanDays = data.openedLifespanDays;
            if (data.pantryLifespanDays != null) this.product.pantryLifespanDays = data.pantryLifespanDays;
            if (data.trackCountBy) this.product.trackCountBy = data.trackCountBy;
            // Attach the uploaded image file to the product
            if (res.file) {
              this.product.files.push(res.file);
            }
            // Add brand/tags to first barcode if available
            if (data.brand && this.product.barcodes.length > 0) {
              this.product.barcodes[0].brand = data.brand;
            }
            if (data.tags && this.product.barcodes.length > 0) {
              this.product.barcodes[0].tags = data.tags;
            }
            if (data.description && this.product.barcodes.length > 0) {
              this.product.barcodes[0].description = data.description;
            }
          }
          this.snackBar.open('Details extracted from photo!', 'Close', { duration: 3000 });
        }
        // Reset file input so the same file can be re-selected
        input.value = '';
      },
      error: (err) => {
        this.isAnalyzingPhoto = false;
        console.error('Error analyzing photo:', err);
        this.snackBar.open('Failed to analyze photo: ' + (err.error?.data || err.message), 'Close', { duration: 5000 });
        input.value = '';
      }
    });
  }

  public lookupBarcode() {
    if (!this.barcodeInput || !this.product) return;

    this.isLookingUpBarcode = true;
    const barcode = this.barcodeInput.trim();

    // Step 1: Look up on OpenFoodFacts
    this.geminiService.lookupOpenFoodFacts(barcode).subscribe({
      next: (offRes) => {
        if (!offRes?.product?.product_name) {
          this.isLookingUpBarcode = false;
          this.snackBar.open('Product not found in OpenFoodFacts', 'Close', { duration: 4000 });
          return;
        }

        const offProduct = offRes.product;
        const productName = offProduct.product_name || 'Unknown';
        const brand = offProduct.brands || '';

        // Step 2: Send to Gemini for cleaning (same as kiosk restock flow)
        this.geminiService.getBarcodeDetails(productName, brand).subscribe({
          next: (detailsRes) => {
            this.isLookingUpBarcode = false;
            const details = detailsRes.data;

            if (this.product && details) {
              // Populate form fields
              const candidateTitle = details.title || productName;
              if (candidateTitle && candidateTitle !== 'Unknown Product') {
                this.product.title = candidateTitle;
              }
              if (details.freezerLifespanDays != null) this.product.freezerLifespanDays = details.freezerLifespanDays;
              if (details.refrigeratorLifespanDays != null) this.product.refrigeratorLifespanDays = details.refrigeratorLifespanDays;
              if (details.openedLifespanDays != null) this.product.openedLifespanDays = details.openedLifespanDays;
              if (details.pantryLifespanDays != null) this.product.pantryLifespanDays = details.pantryLifespanDays;
              if (details.trackCountBy) this.product.trackCountBy = details.trackCountBy;
              if (details.autoPrintLabel !== undefined) this.product.autoPrintLabel = details.autoPrintLabel;

              // Add barcode entry to the product
              const newBarcode: ProductBarcode = {
                id: 0,
                barcode: barcode,
                brand: details.brand || brand,
                description: details.description || '',
                tags: details.tags || [],
                quantity: 1,
                ProductId: this.product.id || 0
              };
              this.product.barcodes.push(newBarcode);

              if (detailsRes.warning) {
                this.snackBar.open(detailsRes.warning, 'Close', { duration: 5000 });
              } else {
                this.snackBar.open('Details extracted from barcode!', 'Close', { duration: 3000 });
              }

              // Hide barcode input panel
              this.showBarcodeInput = false;
              this.barcodeInput = '';
            }
          },
          error: (err) => {
            this.isLookingUpBarcode = false;
            console.error('Gemini barcode details failed:', err);
            this.snackBar.open('AI analysis failed: ' + (err.error?.data || err.message), 'Close', { duration: 5000 });
          }
        });
      },
      error: (err) => {
        this.isLookingUpBarcode = false;
        console.error('OpenFoodFacts lookup failed:', err);
        this.snackBar.open('Barcode not found — check the number and try again', 'Close', { duration: 4000 });
      }
    });
  }

  public GetFileDownloadUrl = (fileOrId: number | FileMeta): string => {
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

    return this.env.apiUrl + "/files/" + id + "?size=small" + cacheBuster;
  }

  public openImage(file: FileMeta) {
    window.open(this.GetFileDownloadUrl(file), '_blank');
  }

  public removeBarcode = (a: any) => {
    this.product?.barcodes.splice(this.product.barcodes.indexOf(a), 1);
  }

  public delete = () => {
    if (this.product && this.product.id)
      this.svc.Delete(this.product.id).subscribe(() => {
        this.router.navigate(["/"]);
      })
  }

  public addBarcode = () => {
    this.product?.barcodes.push({
      barcode: "",
      ProductId: this.product!.id,
      brand: "",
      description: "",
      id: 0,
      quantity: 0,
      tags: []
    });
  }

  public removeImage = (file: FileMeta) => {
    var index = this.product!.files.findIndex(a => a.id == file.id);

    if (index >= 0)
      this.product!.files.splice(index, 1);

    console.log(this.product!.files);
  }

  public save = () => {
    if (this.product === undefined)
      return;

    console.log(this.product);

    this.product.fileIds = this.product.files.map(a => a.id);

    this.product.freezerLifespanDays = (this.product.freezerLifespanDays === null || this.product.freezerLifespanDays === undefined || (this.product.freezerLifespanDays as any) === '') ? null : Number(this.product.freezerLifespanDays);
    this.product.refrigeratorLifespanDays = (this.product.refrigeratorLifespanDays === null || this.product.refrigeratorLifespanDays === undefined || (this.product.refrigeratorLifespanDays as any) === '') ? null : Number(this.product.refrigeratorLifespanDays);
    this.product.openedLifespanDays = (this.product.openedLifespanDays === null || this.product.openedLifespanDays === undefined || (this.product.openedLifespanDays as any) === '') ? null : Number(this.product.openedLifespanDays);
    this.product.pantryLifespanDays = (this.product.pantryLifespanDays === null || this.product.pantryLifespanDays === undefined || (this.product.pantryLifespanDays as any) === '') ? null : Number(this.product.pantryLifespanDays);

    if (this.product.barcodes) {
      this.product.barcodes.forEach(b => {
        b.tareWeight = (b.tareWeight === null || b.tareWeight === undefined || (b.tareWeight as any) === '') ? undefined : Number(b.tareWeight);
      });
    }

    if (this.isCreate) {
      this.svc.Create(this.product).subscribe(p => {
        this.product = p;
        this.router.navigate(["products", p.id]);
      });
    }
    else {
      this.svc.Update(this.product).subscribe(p => {
        this.product = p;
        this.router.navigate(["products", p.id]);
      });
    }

  }

  browsedFiles = (evt: Event) => {
    const fileList: FileList | null = (evt.target as HTMLInputElement).files;
    if (fileList !== null)
      this.addFiles(fileList);
  }

  public inputValue: any;
  addFiles = (fileList: FileList) => {
    if (this.product === undefined)
      return;

    for (let i = 0; i < fileList.length; i++) {
      const file: File = fileList[i];

      this.svc.UploadFile(file).subscribe(result => {
        console.log("file upload result", result);
        this.product!.files.push(result);
      });
    }

    this.inputValue = undefined;
  }
}
