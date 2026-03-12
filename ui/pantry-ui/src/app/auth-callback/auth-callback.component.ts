import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
    selector: 'app-auth-callback',
    standalone: true,
    imports: [CommonModule, MatProgressSpinnerModule],
    template: `
    <div class="callback-container">
      <mat-spinner diameter="48"></mat-spinner>
      <p>Completing login...</p>
    </div>
  `,
    styles: [`
    .callback-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      gap: 1rem;
    }
    p {
      color: rgba(255, 255, 255, 0.7);
      font-size: 1.1rem;
    }
  `]
})
export class AuthCallbackComponent implements OnInit {
    constructor(private authService: AuthService, private router: Router) { }

    ngOnInit() {
        // The session cookie was set by the backend redirect.
        // Verify the session is valid, then navigate to the app.
        this.authService.getUser().subscribe({
            next: (response) => {
                if (response.user) {
                    this.router.navigate(['/home']);
                } else {
                    this.router.navigate(['/login']);
                }
            },
            error: () => {
                this.router.navigate(['/login']);
            }
        });
    }
}
