import { AfterViewInit, Component } from "@angular/core";
import { ProductListService } from "./product-list.service";
import { Product } from "../../types/product";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";


@Component({
    selector: 'product-list',
    styleUrls: [
        "product-list.component.css"
    ],
    templateUrl: "product-list.component.html",
    imports: [
        CommonModule,
        FormsModule
    ]
})
export class ProductListComponent implements AfterViewInit
{
    public products: Product[] = [];
    /**
     *
     */
    constructor(private svc: ProductListService) {
    }

    ngAfterViewInit(): void {
        this.svc.GetAll().subscribe(res => {
            this.products = res;
        });
    }
}