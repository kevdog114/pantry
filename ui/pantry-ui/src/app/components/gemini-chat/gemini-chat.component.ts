import { Component, OnInit } from '@angular/core';
import { GeminiService } from '../../services/gemini.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PhotoUploadComponent } from '../photo-upload/photo-upload.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { MarkdownModule } from 'ngx-markdown';

export interface Recipe {
  title: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  time: {
    prep: string;
    cook: string;
    total: string;
  };
}

export interface ChatMessage {
  sender: string;
  type: 'chat' | 'recipe';
  content?: string; // For text/markdwon
  recipe?: Recipe;
  expanded?: boolean; // For recipe card toggle
}

@Component({
  selector: 'app-gemini-chat',
  templateUrl: './gemini-chat.component.html',
  styleUrls: ['./gemini-chat.component.css'],
  imports: [CommonModule, FormsModule, PhotoUploadComponent, MatSnackBarModule, MarkdownModule],
  standalone: true,
})
export class GeminiChatComponent implements OnInit {
  messages: ChatMessage[] = [];
  newMessage: string = '';
  isLoading: boolean = false;

  sessions: any[] = [];
  currentSessionId: number | null = null;

  constructor(private geminiService: GeminiService, private snackBar: MatSnackBar) { }

  ngOnInit() {
    this.loadSessions();
  }

  loadSessions() {
    this.geminiService.getSessions().subscribe(response => {
      this.sessions = response.data;
    });
  }

  loadSession(sessionId: number) {
    this.currentSessionId = sessionId;
    this.isLoading = true;
    this.geminiService.getSession(sessionId).subscribe(response => {
      this.isLoading = false;
      const session = response.data;
      this.messages = []; // Clear existing

      // Reconstruct messages from DB history
      if (session.messages) {
        session.messages.forEach((msg: any) => {
          if (msg.type === 'recipe' && msg.recipeData) {
            let recipeObj;
            try {
              recipeObj = JSON.parse(msg.recipeData);
            } catch (e) { console.error("Failed to parse recipe data", e); }

            if (recipeObj) {
              this.messages.push({
                sender: msg.sender === 'user' ? 'You' : 'Gemini',
                type: 'recipe',
                recipe: recipeObj,
                expanded: false
              });
            }
          } else {
            this.messages.push({
              sender: msg.sender === 'user' ? 'You' : 'Gemini',
              type: 'chat',
              content: msg.content
            });
          }
        });
      }
    });
  }

  deleteSession(sessionId: number, event: Event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this chat?')) {
      this.geminiService.deleteSession(sessionId).subscribe(() => {
        this.loadSessions();
        if (this.currentSessionId === sessionId) {
          this.newChat();
        }
      });
    }
  }

  sendMessage() {
    if (this.newMessage.trim() === '') {
      return;
    }

    const prompt = this.newMessage;
    this.messages.push({ sender: 'You', type: 'chat', content: this.newMessage });
    this.newMessage = '';
    this.isLoading = true;

    // We no longer need to construct history manually for the API, 
    // we just pass sessionId and let backend handle it.
    // However, if we are starting a new chat (no sessionId), we send empty history implicitely.

    this.geminiService.sendMessage(prompt, [], this.currentSessionId || undefined).subscribe(response => {
      this.isLoading = false;

      // Update current session ID if this was a new chat
      if (response.sessionId) {
        if (this.currentSessionId !== response.sessionId) {
          this.currentSessionId = response.sessionId;
          this.loadSessions(); // Refresh list to show new chat
        }
      }

      const data = response.data;

      // Check for the new list structure
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.type === 'recipe' && item.recipe) {
            this.messages.push({
              sender: 'Gemini',
              type: 'recipe',
              recipe: item.recipe,
              expanded: false
            });
          } else {
            // Chat item
            this.messages.push({
              sender: 'Gemini',
              type: 'chat',
              content: item.content || JSON.stringify(item)
            });
          }
        });
      } else {
        // Fallback logic
        const isRecipe = (data.type && data.type.toLowerCase() === 'recipe') || (data.recipe && typeof data.recipe === 'object');

        if (isRecipe && data.recipe) {
          this.messages.push({
            sender: 'Gemini',
            type: 'recipe',
            recipe: data.recipe,
            expanded: false
          });
        } else {
          let content = data.content;
          if (typeof content === 'object') {
            content = JSON.stringify(content, null, 2);
          } else if (!content) {
            content = JSON.stringify(data, null, 2);
          }

          this.messages.push({
            sender: 'Gemini',
            type: 'chat',
            content: content
          });
        }
      }

      if (response.warning) {
        this.snackBar.open(response.warning, 'Close', { duration: 5000 });
      }
    });
  }

  toggleRecipe(message: ChatMessage) {
    if (message.type === 'recipe') {
      message.expanded = !message.expanded;
    }
  }

  newChat() {
    this.messages = [];
    this.currentSessionId = null;
  }
}
