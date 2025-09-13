import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { LabelService } from '../services/label.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-quick-label',
  templateUrl: './quick-label.component.html',
  styleUrls: ['./quick-label.component.css'],
  standalone: true,
  imports: [
    FormsModule,
    MatInputModule,
    MatButtonModule,
    MatCardModule,
    CommonModule
  ],
})
export class QuickLabelComponent {
  label_text: string = '';

  constructor(private labelService: LabelService) {}

  setOpenedOn(): void {
    const today = new Date();
    this.label_text = `Opened on ${today.toLocaleDateString()}`;
  }

  printLabel(): void {
    this.labelService.printQuickLabel(this.label_text).subscribe(() => {
      console.log('Label printed successfully');
    });
  }
}
