import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface GitInfo {
  latest_commit: string;
  merges: string[][];
}

@Component({
  selector: 'app-git-info',
  templateUrl: './git-info.component.html',
  styleUrls: ['./git-info.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class GitInfoComponent implements OnInit {
  gitInfo: GitInfo | null = null;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.http.get<GitInfo>('/api/git-info').subscribe(data => {
      this.gitInfo = data;
    });
  }
}
