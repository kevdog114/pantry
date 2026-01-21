import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../services/socket.service';

@Component({
  selector: 'app-diagnostics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './diagnostics.component.html',
  styleUrl: './diagnostics.component.css'
})
export class DiagnosticsComponent implements OnInit {
  clients: any[] = [];
  loading = false;
  error = '';

  constructor(private socketService: SocketService) { }

  ngOnInit(): void {
    this.refresh();
  }

  refresh() {
    this.loading = true;
    this.error = '';
    this.socketService.getConnectedClients().then(clients => {
      this.clients = clients;
      this.loading = false;
    }).catch(err => {
      console.error(err);
      this.error = 'Failed to fetch clients: ' + err;
      this.loading = false;
    });
  }
}
