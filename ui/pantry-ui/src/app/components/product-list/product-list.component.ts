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
import { MatInputModule } from "@angular/material/input";

type DisplayModeOption = "grid" | "list";
type SortOption = "alphabetical" | "expire";

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
        MatListModule,
        MatInputModule
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
            this.products = res;
        });
    }

    public searchTerm: string = "";
    private _selectedSortOption: SortOption = "expire";

    public get selectedSortOption() {
        return this._selectedSortOption;
    }
    public set selectedSortOption(sortOp: SortOption) {
        this._selectedSortOption = sortOp;
        this.sortItems(this.products, this._selectedSortOption);
    }

    public refreshList = () => {
        if(this.searchTerm !== null && this.searchTerm !== undefined && this.searchTerm.length > 0)
        {
            this.svc.searchProducts(this.searchTerm).subscribe(a => {
                this.products = a;
            });
        }
        else {
            this.svc.GetAll().subscribe(res => {
                this.products = res;
            });
        }
    }

    public updateSort = () => {

    }

    private sortItems = (products: Product[], sortOption: SortOption): Product[] => {
        return products.sort((a: Product, b: Product) => {
            var val1 = sortOption == "alphabetical" ? a.title : a.minExpiration;
            var val2 = sortOption == "alphabetical" ? b.title : b.minExpiration;

            if(val1 === val2) return 0;
            if(val1 === null || val1 === undefined) return 1;
            if(val2 === null || val2 === undefined) return -1;
            else return val1 < val2 ? -1 : 1;
        })
    }

    public GetFileDownloadUrl = (product: Product): string => {
        if(product && product.Files && product.Files.length > 0)
            return environment.apiUrl + "/files/" + product.Files[0].id + "?size=small";
        else
            return "";
    }
}