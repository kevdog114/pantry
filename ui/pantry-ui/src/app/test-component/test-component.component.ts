import { Component } from '@angular/core';
import { ProductListComponent } from '../components/product-list/product-list.component';

@Component({
  selector: 'app-test-component',
  imports: [ProductListComponent],
  templateUrl: './test-component.component.html',
  styleUrl: './test-component.component.css'
})
export class TestComponentComponent {

}
