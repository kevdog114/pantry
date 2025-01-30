import { AfterViewInit, Component } from "@angular/core";
import { ProductListService } from "./product-list.service";
import { Product } from "../../types/product";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { environment } from "../../../environments/environment";
import { MatCardModule } from "@angular/material/card";


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
        MatButtonModule,
        MatCardModule
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

    public GetFileDownloadUrl = (product: Product): string => {
        if(product && product.Files && product.Files.length > 0)
            return environment.apiUrl + "/files/" + product.Files[0].id + "?size=small";
        else
            return "";
    }
}