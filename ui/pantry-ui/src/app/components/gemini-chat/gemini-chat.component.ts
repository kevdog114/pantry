import { Component, OnInit } from '@angular/core';
import { GeminiService } from '../../services/gemini.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { RecipeService } from '../../services/recipe.service';
import { ChatInterfaceComponent, ChatMessage, ChatContentItem } from '../chat-interface/chat-interface.component';

// Re-export types for backward compatibility if needed, or update consumers
export type { ChatMessage, ChatContentItem };

@Component({
  selector: 'app-gemini-chat',
  templateUrl: './gemini-chat.component.html',
  styleUrls: ['./gemini-chat.component.css'],
  imports: [CommonModule, FormsModule, MatSnackBarModule, ChatInterfaceComponent],
  standalone: true,
})
export class GeminiChatComponent implements OnInit {
  showSidebar: boolean = true;
  isMobile: boolean = window.innerWidth <= 768;

  messages: ChatMessage[] = [];
  isLoading: boolean = false;

  sessions: any[] = [];
  currentSessionId: number | null = null;

  constructor(
    private geminiService: GeminiService,
    private snackBar: MatSnackBar,
    private recipeService: RecipeService
  ) {
    this.checkScreenSize();
    window.addEventListener('resize', () => this.checkScreenSize());
  }

  checkScreenSize() {
    this.isMobile = window.innerWidth <= 768;
    if (!this.isMobile) {
      this.showSidebar = true;
    }
  }

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

    if (this.isMobile) {
      this.showSidebar = false;
    }

    this.geminiService.getSession(sessionId).subscribe(response => {
      this.isLoading = false;
      const session = response.data;
      this.messages = [];

      let currentMessage: ChatMessage | null = null;
      // Reconstruct messages from DB history
      if (session.messages) {
        session.messages.forEach((msg: any) => {
          const sender = msg.sender === 'user' ? 'You' : 'Gemini';
          const contents: ChatContentItem[] = [];

          if (msg.content) {
            contents.push({
              type: 'chat',
              text: msg.content
            });
          }

          if (msg.imageUrl) {
            contents.push({
              type: 'image',
              imageUrl: '/api/uploads/' + msg.imageUrl
            });
          }

          if (msg.type === 'recipe' && msg.recipeData) {
            let recipeObj;
            try {
              recipeObj = JSON.parse(msg.recipeData);
            } catch (e) {
              console.error("Failed to parse recipe data", e);
            }

            if (recipeObj) {
              contents.push({
                type: 'recipe',
                recipe: recipeObj,
                expanded: false
              });
            }
          }

          if (contents.length > 0) {
            if (currentMessage && currentMessage.sender === sender) {
              currentMessage.contents.push(...contents);
            } else {
              currentMessage = {
                sender,
                contents: contents
              };
              this.messages.push(currentMessage);
            }
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

  handleSend(event: { text: string, image?: File }) {
    this.sendMessage(event.text, event.image);
  }

  sendMessage(prompt: string, image?: File) {
    if (prompt.trim() === '' && !image) {
      return;
    }

    const userContents: ChatContentItem[] = [];
    if (image) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.messages.push({
          sender: 'You',
          contents: [
            { type: 'image', imageUrl: e.target.result },
            { type: 'chat', text: prompt }
          ]
        });
        this.executeSend(prompt, image);
      };
      reader.readAsDataURL(image);
    } else {
      if (prompt) {
        userContents.push({ type: 'chat', text: prompt });
      }
      this.messages.push({ sender: 'You', contents: userContents });
      this.executeSend(prompt, undefined);
    }
  }

  executeSend(prompt: string, image?: File) {
    this.isLoading = true;

    this.geminiService.sendMessage(prompt, [], this.currentSessionId || undefined, image).subscribe(response => {
      this.isLoading = false;

      // Update current session ID if this was a new chat
      if (response.sessionId) {
        if (this.currentSessionId !== response.sessionId) {
          this.currentSessionId = response.sessionId;
          this.loadSessions();
        }
      }

      const data = response.data;
      const geminiContents: ChatContentItem[] = [];

      // Check for the new list structure
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.type === 'recipe' && item.recipe) {
            geminiContents.push({
              type: 'recipe',
              recipe: item.recipe,
              expanded: false
            });
          } else {
            // Chat item
            geminiContents.push({
              type: 'chat',
              text: item.content || JSON.stringify(item)
            });
          }
        });
      } else {
        // Fallback logic
        const isRecipe = (data.type && data.type.toLowerCase() === 'recipe') || (data.recipe && typeof data.recipe === 'object');

        if (isRecipe && data.recipe) {
          geminiContents.push({
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

          geminiContents.push({
            type: 'chat',
            text: content
          });
        }
      }

      if (geminiContents.length > 0) {
        this.messages.push({
          sender: 'Gemini',
          contents: geminiContents
        });
      }

      if (response.warning) {
        this.snackBar.open(response.warning, 'Close', { duration: 5000 });
      }
    });
  }

  newChat() {
    this.messages = [];
    this.currentSessionId = null;
    if (this.isMobile) {
      this.showSidebar = false;
    }
  }

  backToSessions() {
    this.showSidebar = true;
  }
}


