import { Component } from '@angular/core';
import { RouterModule, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { TestComponentComponent } from './test-component/test-component.component';
import { ProductListComponent } from './components/product-list/product-list.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatIconModule, MatToolbarModule, MatButtonModule, MatDividerModule,
    TestComponentComponent,
    ProductListComponent,
    RouterModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Kevin\'s Pantry';
}
