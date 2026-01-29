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
