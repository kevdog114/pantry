import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../../services/environment.service';

interface Abbreviation {
  id: number;
  words: string;
  short: string;
}

@Component({
  selector: 'app-abbreviations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule
  ],
  templateUrl: './abbreviations.component.html',
  styleUrls: ['./abbreviations.component.css']
})
export class AbbreviationsComponent implements OnInit {
  displayedColumns: string[] = ['words', 'short', 'actions'];
  dataSource: Abbreviation[] = [];

  newWords = '';
  newShort = '';

  private apiUrl = '';

  constructor(
    private http: HttpClient,
    private env: EnvironmentService,
    private snackBar: MatSnackBar
  ) {
    this.apiUrl = `${this.env.apiUrl}/abbreviations`;
  }

  ngOnInit(): void {
    this.refresh();
  }

  refresh() {
    this.http.get<any>(this.apiUrl).subscribe(res => {
      this.dataSource = res.data || [];
    });
  }

  addAbbreviation() {
    if (!this.newWords.trim() || !this.newShort.trim()) {
      this.snackBar.open('Both fields are required', 'Close', { duration: 2000 });
      return;
    }

    this.http.post<any>(this.apiUrl, {
      words: this.newWords.trim(),
      short: this.newShort.trim()
    }).subscribe(() => {
      this.newWords = '';
      this.newShort = '';
      this.snackBar.open('Abbreviation added', 'Close', { duration: 2000 });
      this.refresh();
    });
  }

  editAbbreviation(abbr: Abbreviation) {
    const newWords = window.prompt('Enter full word(s) (comma-separated for variants):', abbr.words);
    if (newWords === null) return;
    const newShort = window.prompt('Enter abbreviated text:', abbr.short);
    if (newShort === null) return;

    this.http.put<any>(`${this.apiUrl}/${abbr.id}`, {
      words: newWords.trim(),
      short: newShort.trim()
    }).subscribe(() => {
      this.snackBar.open('Abbreviation updated', 'Close', { duration: 2000 });
      this.refresh();
    });
  }

  deleteAbbreviation(abbr: Abbreviation) {
    if (confirm(`Delete abbreviation "${abbr.words}" -> "${abbr.short}"?`)) {
      this.http.delete<any>(`${this.apiUrl}/${abbr.id}`).subscribe(() => {
        this.snackBar.open('Abbreviation deleted', 'Close', { duration: 2000 });
        this.refresh();
      });
    }
  }
}
