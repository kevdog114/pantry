import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatIconModule, MatToolbarModule, MatButtonModule, MatDividerModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'Kevin\'s Pantry';
}
