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
import { environment } from '../../environments/environment';
import { MatTabsModule } from '@angular/material/tabs';

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
    TagsComponent
  ],
  templateUrl: './product-edit.component.html',
  styleUrl: './product-edit.component.css'
})
export class ProductEditComponent implements AfterViewInit {

  private isCreate: boolean = false;
  public product: Product | undefined = undefined;

  private queryData = {
    productTitle: <string | undefined>"",
    barcodes: <string[] | undefined>[]
  };

  @Input("productName")
  set productTitleQuery(newProductTitle: string | undefined) {
    console.log("product title", newProductTitle);
    this.queryData.productTitle = newProductTitle;
  }

  @Input("barcodes")
  set barcodeQuery(newBarcodes: string[] | string | undefined) {
    console.log("Barcodes", newBarcodes);
    if(newBarcodes !== undefined) {
      if((newBarcodes as string[]).forEach)
        this.queryData.barcodes = newBarcodes as string[];
      else
        this.queryData.barcodes = [ newBarcodes as string ];
    }
  }

  @Input()
  set id(productId: number) {
    if(productId !== undefined)
    {
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
        productBarcodes: [],
        stockItems: [],
        title: ""
      }
    }
  }

  constructor(private svc: ProductListService, private router: Router) {
  }

  ngAfterViewInit(): void {
    if(this.isCreate)
    {
      if(this.queryData.productTitle)
        this.product!.title = this.queryData.productTitle;
      if(this.queryData.barcodes)
      {
        this.queryData.barcodes.forEach(barcode => {
          this.product?.productBarcodes.push({
            barcode: barcode,
            ProductId: this.product!.id,
            brand: "",
            description: "",
            id: 0,
            quantity: 0,
            tags: []
          });
        })
      }
    }
  }

  public GetFileDownloadUrl = (fileId: number): string => {
    return environment.apiUrl + "/files/" + fileId + "?size=small";
  }

  public removeBarcode = (a: any) => {
    this.product?.productBarcodes.splice(this.product.productBarcodes.indexOf(a), 1);
  }

  public delete = () => {
    if(this.product && this.product.id)
      this.svc.Delete(this.product.id).subscribe(() => {
        this.router.navigate(["/"]);
      })
  }

  public addBarcode = () => {
    this.product?.productBarcodes.push({
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

    if(index >= 0)
      this.product!.files.splice(index, 1);

    console.log(this.product!.files);
  }

  public save = () => {
    if(this.product === undefined)
      return;

    console.log(this.product);

    this.product.fileIds = this.product.files.map(a => a.id);

    if(this.isCreate)
    {
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
    if(fileList !== null)
        this.addFiles(fileList);
}

public inputValue: any;
addFiles = (fileList: FileList) => {
  if(this.product === undefined)
    return;

    for(let i = 0; i < fileList.length; i++)
    {
        const file: File = fileList[i];

        this.svc.UploadFile(file).subscribe(result => {
          console.log("file upload result", result);
          this.product!.files.push(result);
        });
    }

    this.inputValue = undefined;
  }
}
