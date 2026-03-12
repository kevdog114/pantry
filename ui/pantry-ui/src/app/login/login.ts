import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { EnvironmentService } from '../services/environment.service';

import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
  standalone: true,
  imports: [FormsModule, CommonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDividerModule, MatIconModule, RouterModule]
})
export class LoginComponent implements OnInit {
  credentials = {
    username: '',
    password: ''
  };

  oauthEnabled = false;
  oauthButtonText = 'Login with SSO';
  localLoginEnabled = true;
  configLoaded = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private env: EnvironmentService
  ) { }

  ngOnInit() {
    this.authService.getAuthConfig().subscribe({
      next: (config) => {
        this.oauthEnabled = config.oauthEnabled;
        this.oauthButtonText = config.oauthButtonText;
        this.localLoginEnabled = config.localLoginEnabled;
        this.configLoaded = true;
      },
      error: () => {
        // If config endpoint fails, fall back to local login only
        this.configLoaded = true;
      }
    });
  }

  login() {
    this.authService.login(this.credentials).subscribe(() => {
      this.router.navigate(['/']);
    });
  }

  loginWithOAuth() {
    window.location.href = `${this.env.apiUrl}/auth/oauth/login`;
  }
}
