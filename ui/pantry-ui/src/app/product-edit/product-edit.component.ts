import { AfterViewInit, Component, Input } from '@angular/core';
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

interface IndexedBarcode {
  index: number,
  id?: number,
  ProductId: number,
  barcode: string
}

@Component({
  selector: 'app-product-edit',
  imports: [FormsModule,
    MatFormFieldModule,
    CommonModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule
  ],
  templateUrl: './product-edit.component.html',
  styleUrl: './product-edit.component.css'
})
export class ProductEditComponent {

  private isCreate: boolean = false;
  public product: Product | undefined = undefined;
  private barcodeIndex = 0;
  public barcodes: Array<IndexedBarcode> = [
  ];

  @Input()
  set id(productId: number) {
    if(productId !== undefined)
    {
      this.svc.Get(productId).subscribe(p => {
        this.product = p;
        this.barcodes = p.ProductBarcodes.map(a => {
          return <IndexedBarcode>{
            id: a.id,
            barcode: a.barcode,
            index: this.barcodeIndex++,
            ProductId: a.ProductId
          }
        })
      });
    }
    else {
      this.isCreate = true;
      this.product = {
        fileIds: [],
        Files: [],
        id: 0,
        ProductBarcodes: [],
        StockItems: [],
        title: ""
      }
    }
  }

  constructor(private svc: ProductListService, private router: Router) {
  }

  public GetFileDownloadUrl = (fileId: number): string => {
    return environment.apiUrl + "/files/" + fileId;
  }

  public removeBarcode = (a: any) => {
    this.barcodes.splice(this.barcodes.indexOf(a), 1);
  }

  public addBarcode = () => {
    this.barcodes.push({
      index: this.barcodeIndex,
      barcode: "",
      ProductId: this.product!.id
    });
    this.barcodeIndex++;
  }

  public removeImage = (file: FileMeta) => {
    var index = this.product!.Files.findIndex(a => a.id == file.id);

    if(index >= 0)
      this.product!.Files.splice(index, 1);

    console.log(this.product!.Files);
  }

  public save = () => {
    if(this.product === undefined)
      return;

    console.log(this.product);

    this.product.fileIds = this.product.Files.map(a => a.id);
    this.product.ProductBarcodes = this.barcodes.map(a => <ProductBarcode>{
      barcode: a.barcode,
      id: a.id,
      ProductId: this.product!.id
    });

    if(this.isCreate)
    {
      
    }
    this.svc.Update(this.product).subscribe(p => {
      this.product = p;
      this.router.navigate(["products", p.id]);
    });
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
          this.product!.Files.push(result);
        });
    }

    this.inputValue = undefined;
  }
}
