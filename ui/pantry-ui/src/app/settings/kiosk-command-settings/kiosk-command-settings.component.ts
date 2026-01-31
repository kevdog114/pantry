import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { FormsModule } from '@angular/forms';
import { KioskCommandService } from '../../services/kiosk-command.service';
import { KioskCommand } from '../../types/kiosk-command';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-kiosk-command-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatListModule,
    MatCardModule,
    FormsModule
  ],
  templateUrl: './kiosk-command-settings.component.html',
  styleUrls: ['./kiosk-command-settings.component.css']
})
export class KioskCommandSettingsComponent implements OnInit {
  commands: KioskCommand[] = [];

  editingId: number | null = null;
  editName: string = '';
  editCommand: string = '';

  constructor(
    private commandService: KioskCommandService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadCommands();
  }

  loadCommands() {
    this.commandService.getAll().subscribe({
      next: (res) => {
        this.commands = res.data;
      },
      error: (err) => console.error(err)
    });
  }

  startEdit(cmd?: KioskCommand) {
    if (cmd) {
      this.editingId = cmd.id;
      this.editName = cmd.name;
      this.editCommand = cmd.command;
    } else {
      this.editingId = 0; // 0 for new
      this.editName = '';
      this.editCommand = '';
    }
  }

  cancelEdit() {
    this.editingId = null;
    this.editName = '';
    this.editCommand = '';
  }

  saveCommand() {
    if (!this.editName || !this.editCommand) {
      this.snackBar.open("Name and Command are required", "Close", { duration: 2000 });
      return;
    }

    if (this.editingId === 0) {
      this.commandService.create({ name: this.editName, command: this.editCommand }).subscribe({
        next: () => {
          this.snackBar.open("Command Created", "Close", { duration: 2000 });
          this.loadCommands();
          this.cancelEdit();
        },
        error: () => this.snackBar.open("Failed to create", "Close")
      });
    } else if (this.editingId) {
      this.commandService.update(this.editingId, { name: this.editName, command: this.editCommand }).subscribe({
        next: () => {
          this.snackBar.open("Command Updated", "Close", { duration: 2000 });
          this.loadCommands();
          this.cancelEdit();
        },
        error: () => this.snackBar.open("Failed to update", "Close")
      });
    }
  }

  deleteCommand(id: number) {
    if (confirm("Are you sure you want to delete this command?")) {
      this.commandService.delete(id).subscribe({
        next: () => {
          this.snackBar.open("Command Deleted", "Close", { duration: 2000 });
          this.loadCommands();
        },
        error: () => this.snackBar.open("Failed to delete", "Close")
      });
    }
  }
}
