import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';

@Component({
    selector: 'app-maintenance',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        MatButtonModule,
        MatCardModule,
        MatIconModule,
        MatRippleModule
    ],
    templateUrl: './maintenance.component.html',
    styleUrls: ['./maintenance.component.css']
})
export class MaintenanceComponent {
    constructor(
        private router: Router,
        private http: HttpClient,
        private env: EnvironmentService
    ) { }

    launchDuplicateFinder(): void {
        // Create a new chat session with a system prompt for duplicate finding
        this.http.post<any>(`${this.env.apiUrl}/gemini/chat/sessions`, {
            title: 'Duplicate Recipe Finder',
            entityType: null,
            entityId: null
        }).subscribe({
            next: (session: any) => {
                // Navigate to chat with the new session and initial prompt
                this.router.navigate(['/gemini-chat'], {
                    queryParams: {
                        sessionId: session.id,
                        initialPrompt: 'Help me find and resolve duplicate recipes in my recipe collection. Start by listing all recipes and identifying potential duplicates based on similar names and descriptions. For each pair of suspected duplicates, show me the details side by side so I can decide which to keep. When I confirm which recipe is the duplicate, use the setDuplicateOfRecipeId tool to mark it as a duplicate of the parent recipe.'
                    }
                });
            },
            error: (err) => {
                // Fallback: just navigate to chat with the prompt
                this.router.navigate(['/gemini-chat'], {
                    queryParams: {
                        initialPrompt: 'Help me find and resolve duplicate recipes in my recipe collection. Start by listing all recipes and identifying potential duplicates based on similar names and descriptions. For each pair of suspected duplicates, show me the details side by side so I can decide which to keep. When I confirm which recipe is the duplicate, use the setDuplicateOfRecipeId tool to mark it as a duplicate of the parent recipe.'
                    }
                });
            }
        });
    }
}
