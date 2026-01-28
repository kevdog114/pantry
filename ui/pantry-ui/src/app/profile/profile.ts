import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth';
import { KioskService, Kiosk } from '../services/kiosk.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { SwPush } from '@angular/service-worker';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss'],
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    MatIconModule,
    MatDividerModule,
    MatSlideToggleModule
  ]
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
  kiosks: Kiosk[] = [];
  subscriptions: any[] = [];

  notificationsEnabled: boolean = false;
  pushMessage: string = '';

  constructor(
    private authService: AuthService,
    private kioskService: KioskService,
    private swPush: SwPush,
    private http: HttpClient,
    private env: EnvironmentService
  ) { }

  ngOnInit() {
    this.loadTokens();
    this.loadKiosks();
    this.loadSubscriptions();
    this.notificationsEnabled = this.swPush.isEnabled; // Simple check if enabled in browser/SW
    // Better check: is subscribed?
    this.swPush.subscription.subscribe(sub => {
      this.notificationsEnabled = !!sub;
    });
  }

  toggleNotifications() {
    if (this.notificationsEnabled) {
      this.subscribeToPush();
    } else {
      this.unsubscribeFromPush();
    }
  }

  subscribeToPush() {
    this.http.get<{ publicKey: string }>(`${this.env.apiUrl}/push/key`).subscribe(res => {
      this.swPush.requestSubscription({
        serverPublicKey: res.publicKey
      })
        .then(sub => {
          this.http.post(`${this.env.apiUrl}/push/subscribe`, sub).subscribe(() => {
            this.pushMessage = 'Notifications enabled!';
            this.notificationsEnabled = true;
            setTimeout(() => this.pushMessage = '', 3000);
          });
        })
        .catch(err => {
          console.error("Could not subscribe to notifications", err);
          this.pushMessage = 'Failed to enable notifications. Blocked by browser?';
          this.notificationsEnabled = false;
        });
    }, err => {
      console.error("Could not get public key", err);
      this.notificationsEnabled = false;
    });
  }

  unsubscribeFromPush() {
    this.swPush.unsubscribe().then(() => {
      this.pushMessage = 'Notifications disabled.';
      this.notificationsEnabled = false;
    }).catch(err => {
      console.error("Failed to unsubscribe", err);
    });
  }

  testNotification() {
    this.http.post(`${this.env.apiUrl}/push/test`, {}).subscribe(res => {
      this.pushMessage = 'Test notification sent!';
      setTimeout(() => this.pushMessage = '', 3000);
    }, err => {
      this.pushMessage = 'Failed to send test.';
    });
  }

  loadKiosks() {
    this.kioskService.getKiosks().subscribe((data) => this.kiosks = data);
  }

  removeKiosk(id: number) {
    if (confirm('Are you sure you want to remove this kiosk? It will be logged out.')) {
      this.kioskService.deleteKiosk(id).subscribe(() => {
        this.loadKiosks();
      });
    }
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

  loadSubscriptions() {
    this.http.get<any[]>(`${this.env.apiUrl}/push/subscriptions`).subscribe(subs => {
      this.subscriptions = subs;
    });
  }

  deleteSubscription(id: number) {
    if (confirm('Are you sure you want to remove this device?')) {
      this.http.delete(`${this.env.apiUrl}/push/subscriptions/${id}`).subscribe(() => {
        this.loadSubscriptions();
      });
    }
  }
}
