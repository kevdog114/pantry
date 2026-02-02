import { AfterViewInit, Component } from "@angular/core";
import { ProductListService } from "./product-list.service";
import { Product, Location } from "../../types/product";
import { LocationService } from "../../services/location.service";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { EnvironmentService } from "../../services/environment.service";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatDividerModule } from "@angular/material/divider";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { MatOptionModule } from "@angular/material/core";
import { LocalStorageService } from "../../local-storage.service";
import { MatListModule } from "@angular/material/list";
import { MatInputModule } from "@angular/material/input";
import { MatDialog } from "@angular/material/dialog";
import { PhotoUploadComponent } from "../photo-upload/photo-upload.component";
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { QuickSnackComponent } from '../quick-snack/quick-snack.component';
import { MatTooltipModule } from '@angular/material/tooltip';

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
        MatInputModule,
        PhotoUploadComponent,
        MatBottomSheetModule,
        MatTooltipModule,
        MatOptionModule
    ]
})
export class ProductListComponent implements AfterViewInit {
    public products: Product[] = [];
    public locations: Location[] = [];
    public selectedLocationId: number | undefined;
    public set DisplayMode(val: DisplayModeOption) {
        this.localStorage.setItem("product-list-display-mode", val);
    }
    public get DisplayMode() {
        return this.localStorage.getItem("product-list-display-mode");
    }

    constructor(private svc: ProductListService, private locationService: LocationService, private localStorage: LocalStorageService, private dialog: MatDialog, private bottomSheet: MatBottomSheet, private env: EnvironmentService) {
        console.log("display mode", this.DisplayMode);
        if (this.DisplayMode === null)
            this.DisplayMode = "grid";
    }

    ngAfterViewInit(): void {
        this.locationService.getAll().subscribe(locs => this.locations = locs);
        this.refreshList();
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
        if (this.searchTerm !== null && this.searchTerm !== undefined && this.searchTerm.length > 0) {
            this.svc.searchProducts(this.searchTerm, this.selectedLocationId).subscribe(a => {
                this.products = this.sortItems(a, this.selectedSortOption);
            });
        }
        else {
            this.svc.GetAll(this.selectedLocationId).subscribe(res => {
                this.products = this.sortItems(res, this.selectedSortOption);
            });
        }
    }

    public updateSort = () => {

    }

    private sortItems = (products: Product[], sortOption: SortOption): Product[] => {
        return products.sort((a: Product, b: Product) => {
            let val1 = sortOption == "alphabetical" ? a.title : a.minExpiration;
            let val2 = sortOption == "alphabetical" ? b.title : b.minExpiration;

            if (sortOption == "alphabetical") {
                val1 = val1 ? val1.toString().toLowerCase() : val1;
                val2 = val2 ? val2.toString().toLowerCase() : val2;
            }

            if (val1 === val2) return 0;
            if (val1 === null || val1 === undefined) return 1;
            if (val2 === null || val2 === undefined) return -1;
            else return val1 < val2 ? -1 : 1;
        })
    }

    public GetFileDownloadUrl = (product: Product): string => {
        if (product && product.files && product.files.length > 0)
            return this.env.apiUrl + "/files/" + product.files[0].id + "?size=small";
        else
            return "";
    }

    public openPhotoUploadDialog = () => {
        const dialogRef = this.dialog.open(PhotoUploadComponent, {
            width: '500px'
        });

        dialogRef.componentInstance.uploadComplete.subscribe(() => {
            dialogRef.close();
            this.refreshList();
        });
    }

    public openQuickSnack() {
        this.bottomSheet.open(QuickSnackComponent);
    }
}