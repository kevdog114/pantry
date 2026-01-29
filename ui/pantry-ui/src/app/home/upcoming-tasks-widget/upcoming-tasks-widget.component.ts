
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { MealPlanService } from '../../services/meal-plan.service';
import { FormsModule } from '@angular/forms';
import { ShoppingTripService, ShoppingTrip } from '../../services/shopping-trip.service';

@Component({
    selector: 'app-upcoming-tasks-widget',
    standalone: true,
    imports: [CommonModule, MatCardModule, MatIconModule, MatCheckboxModule, MatButtonModule, FormsModule, MatTooltipModule, RouterModule],
    templateUrl: './upcoming-tasks-widget.component.html',
    styleUrls: ['./upcoming-tasks-widget.component.css']
})
export class UpcomingTasksWidgetComponent implements OnInit {
    tasks: any[] = [];
    groupedTasks: { date: string, tasks: any[] }[] = [];
    loading = true;

    constructor(
        private mealPlanService: MealPlanService,
        private shoppingTripService: ShoppingTripService
    ) { }

    ngOnInit(): void {
        this.loadTasks();
    }

    loadTasks() {
        this.loading = true;
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        this.mealPlanService.getUpcomingTasks().subscribe({
            next: (tasks) => {
                this.shoppingTripService.getShoppingTrips(today.toISOString(), nextWeek.toISOString()).subscribe({
                    next: (trips) => {
                        const shoppingTasks = trips.map(trip => ({
                            id: `trip_${trip.id}`,
                            date: trip.date,
                            type: 'SHOP',
                            description: `Shopping Trip (${trip.items?.length || 0} items)`,
                            completed: false, // Shopping trips might need a different completion logic, or manual toggle
                            isShoppingTrip: true,
                            originalTrip: trip
                        }));

                        this.tasks = [...tasks, ...shoppingTasks];
                        this.groupTasks();
                        this.loading = false;
                    },
                    error: (err) => {
                        console.error("Failed to load shopping trips", err);
                        this.tasks = tasks; // Show at least the regular tasks
                        this.groupTasks();
                        this.loading = false;
                    }
                });
            },
            error: (err) => {
                console.error("Failed to load tasks", err);
                this.loading = false;
            }
        });
    }

    groupTasks() {
        const groups: { [key: string]: any[] } = {};
        this.tasks.forEach(task => {
            const dateStr = new Date(task.date).toDateString();
            if (!groups[dateStr]) {
                groups[dateStr] = [];
            }
            groups[dateStr].push(task);
        });

        // Convert to array
        this.groupedTasks = Object.keys(groups).map(date => ({
            date: date,
            tasks: groups[date]
        })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    completeTask(task: any) {
        if (task.isShoppingTrip) {
            // Can't complete a shopping trip here, maybe navigate to shopping list?
            return;
        }

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
