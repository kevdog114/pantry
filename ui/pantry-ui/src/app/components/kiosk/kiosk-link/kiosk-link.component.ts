import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { KioskService } from '../../../services/kiosk.service';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
    selector: 'app-kiosk-link',
    standalone: true,
    imports: [CommonModule, FormsModule, MatButtonModule, MatInputModule, MatFormFieldModule],
    templateUrl: './kiosk-link.component.html',
    styleUrls: ['./kiosk-link.component.css']
})
export class KioskLinkComponent implements OnInit {
    token: string | null = null;
    kioskName: string = 'Kitchen iPad';
    status: string = '';
    loading: boolean = false;
    success: boolean = false;

    constructor(
        private route: ActivatedRoute,
        private kioskService: KioskService,
        private router: Router
    ) { }

    ngOnInit() {
        this.token = this.route.snapshot.queryParamMap.get('token');
        if (!this.token) {
            this.status = "No token provided.";
        }
    }

    confirmLink() {
        if (!this.token) return;

        this.loading = true;
        this.kioskService.linkKiosk(this.token, this.kioskName).subscribe({
            next: (res) => {
                this.success = true;
                this.loading = false;
                this.status = "Kiosk successfully linked!";
            },
            error: (err) => {
                this.loading = false;
                this.status = "Error linking kiosk. Token may be expired.";
                console.error(err);
            }
        });
    }

    goToProfile() {
        this.router.navigate(['/profile']);
    }
}
