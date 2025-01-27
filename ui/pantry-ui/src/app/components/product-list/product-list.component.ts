import { AfterViewInit, Component } from "@angular/core";
import { ProductListService } from "./product-list.service";
import { Product } from "../../types/product";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";


@Component({
    selector: 'product-list',
    styleUrls: [
        "product-list.component.css"
    ],
    templateUrl: "product-list.component.html",
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        MatButtonModule
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