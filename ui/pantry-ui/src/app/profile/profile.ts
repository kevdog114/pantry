import { Component } from '@angular/core';
import { AuthService } from '../services/auth';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.html',
  styleUrls: ['./profile.css'],
  standalone: true,
  imports: [ FormsModule ]
})
export class ProfileComponent {
  passwords = {
    oldPassword: '',
    newPassword: ''
  };

  message: string = '';

  constructor(private authService: AuthService) { }

  changePassword() {
    this.authService.changePassword(this.passwords).subscribe(() => {
      this.message = 'Password changed successfully';
    }, (err) => {
        this.message = err.error.message;
    });
  }
}
