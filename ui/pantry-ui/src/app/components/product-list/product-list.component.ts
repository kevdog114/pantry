import { AfterViewInit, Component } from "@angular/core";
import { ProductListService } from "./product-list.service";
import { Product } from "../../types/product";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { environment } from "../../../environments/environment";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatDividerModule } from "@angular/material/divider";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { LocalStorageService } from "../../local-storage.service";
import { MatListModule } from "@angular/material/list";

type DisplayModeOption = "grid" | "list";

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
        MatCardModule,
        MatFormFieldModule,
        MatDividerModule,
        MatSelectModule,
        MatButtonToggleModule,
        MatIconModule,
        MatListModule
    ]
})
export class ProductListComponent implements AfterViewInit
{
    public products: Product[] = [];
    public set DisplayMode(val: DisplayModeOption) {
        this.localStorage.setItem("product-list-display-mode", val);
    }
    public get DisplayMode() {
        return this.localStorage.getItem("product-list-display-mode");
    }
    
    constructor(private svc: ProductListService, private localStorage: LocalStorageService) {
        console.log("display mode", this.DisplayMode);
        if(this.DisplayMode === null)
            this.DisplayMode = "grid";
    }

    ngAfterViewInit(): void {
        this.svc.GetAll().subscribe(res => {

            /*res.sort((a, b) => {
                if(a.minExpiration === b.minExpiration)
                    return 0;
                else return a.minExpiration! < b.minExpiration!
                    ? -1 : 1;
                //return 0;
            })*/
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