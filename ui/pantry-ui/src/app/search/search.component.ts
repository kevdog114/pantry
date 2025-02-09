import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ProductListService } from '../components/product-list/product-list.service';
import { Product } from '../types/product';

@Component({
  selector: 'app-search',
  imports: [
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    CommonModule,
    FormsModule,
    MatInputModule,
    MatCardModule
  ],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css'
})
export class SearchComponent {

  public searchTerm: string = "";
  public results: Product[] = [];

  constructor(private svc: ProductListService) {
    
  }

  public doSearch = () => {
    this.svc.searchProducts(this.searchTerm).subscribe(a => {
      this.results = a;
    })
  }
}
