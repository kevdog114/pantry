
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MealPlanService } from '../../services/meal-plan.service';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-upcoming-tasks-widget',
    standalone: true,
    imports: [CommonModule, MatCardModule, MatIconModule, MatCheckboxModule, MatButtonModule, FormsModule],
    templateUrl: './upcoming-tasks-widget.component.html',
    styleUrls: ['./upcoming-tasks-widget.component.css']
})
export class UpcomingTasksWidgetComponent implements OnInit {
    tasks: any[] = [];
    loading = true;

    constructor(private mealPlanService: MealPlanService) { }

    ngOnInit(): void {
        this.loadTasks();
    }

    loadTasks() {
        this.loading = true;
        this.mealPlanService.getUpcomingTasks().subscribe({
            next: (tasks) => {
                this.tasks = tasks;
                this.loading = false;
            },
            error: (err) => {
                console.error("Failed to load tasks", err);
                this.loading = false;
            }
        });
    }

    completeTask(task: any) {
        // Optimistic UI update
        // We don't remove it immediately so user sees check animation, or we strikethrough
        task.completed = true;

        // Call backend
        this.mealPlanService.completeTask(task.id, true).subscribe({
            error: () => {
                // Revert on error
                task.completed = false;
            }
        });
    }

    // Get icon based on type
    getIcon(type: string): string {
        switch (type) {
            case 'FREEZE': return 'ac_unit';
            case 'THAW': return 'water_drop';
            case 'SHOP': return 'shopping_cart';
            case 'PREP': return 'content_cut';
            default: return 'task';
        }
    }

    getIconClass(type: string): string {
        switch (type) {
            case 'FREEZE': return 'text-primary';
            case 'THAW': return 'text-info';
            case 'SHOP': return 'text-success';
            default: return 'text-muted';
        }
    }
}
