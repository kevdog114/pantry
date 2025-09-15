import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.html',
  styleUrls: ['./profile.css'],
  standalone: true,
  imports: [ FormsModule, CommonModule ]
})
export class ProfileComponent implements OnInit {
  passwords = {
    oldPassword: '',
    newPassword: ''
  };

  message: string = '';

  tokens: any[] = [];
  newTokenName: string = '';
  generatedToken: string = '';

  constructor(private authService: AuthService) { }

  ngOnInit() {
    this.loadTokens();
  }

  loadTokens() {
    this.authService.getPersonalAccessTokens().subscribe((tokens) => {
      this.tokens = tokens;
    });
  }

  createToken() {
    this.authService.createPersonalAccessToken(this.newTokenName).subscribe((res) => {
      this.generatedToken = res.token;
      this.loadTokens();
      this.newTokenName = '';
    });
  }

  deleteToken(id: number) {
    this.authService.deletePersonalAccessToken(id).subscribe(() => {
      this.loadTokens();
    });
  }

  changePassword() {
    this.authService.changePassword(this.passwords).subscribe(() => {
      this.message = 'Password changed successfully';
    }, (err) => {
        this.message = err.error.message;
    });
  }
}
