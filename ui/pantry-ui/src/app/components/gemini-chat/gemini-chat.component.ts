import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { GeminiService } from '../../services/gemini.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PhotoUploadComponent } from '../photo-upload/photo-upload.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { MarkdownModule } from 'ngx-markdown';
import { RecipeService } from '../../services/recipe.service';

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

export interface ChatContentItem {
  type: 'chat' | 'recipe' | 'image';
  text?: string;
  recipe?: Recipe;
  expanded?: boolean;
  imageUrl?: string;
}

export interface ChatMessage {
  sender: string;
  contents: ChatContentItem[];
}

@Component({
  selector: 'app-gemini-chat',
  templateUrl: './gemini-chat.component.html',
  styleUrls: ['./gemini-chat.component.css'],
  imports: [CommonModule, FormsModule, PhotoUploadComponent, MatSnackBarModule, MarkdownModule],
  standalone: true,
})
export class GeminiChatComponent implements OnInit {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  showSidebar: boolean = true;
  isMobile: boolean = window.innerWidth <= 768; // Simple initial check

  messages: ChatMessage[] = [];
  newMessage: string = '';
  isLoading: boolean = false;
  selectedImage: File | null = null;
  selectedImagePreview: string | ArrayBuffer | null = null;

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

  onImageSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedImage = file;
      const reader = new FileReader();
      reader.onload = e => this.selectedImagePreview = e.target?.result || null;
      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.selectedImage = null;
    this.selectedImagePreview = null;
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
      this.messages = []; // Clear existing

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
              imageUrl: '/uploads/' + msg.imageUrl
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

      setTimeout(() => this.scrollToBottom(), 100);
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
    if (this.newMessage.trim() === '' && !this.selectedImage) {
      return;
    }

    const prompt = this.newMessage;

    const userContents: ChatContentItem[] = [];
    if (this.selectedImagePreview) {
      userContents.push({ type: 'image', imageUrl: this.selectedImagePreview as string });
    }
    if (prompt) {
      userContents.push({ type: 'chat', text: prompt });
    }

    this.messages.push({ sender: 'You', contents: userContents });

    this.newMessage = '';
    const imageToSend = this.selectedImage ? this.selectedImage : undefined;
    this.clearImage();

    this.isLoading = true;
    setTimeout(() => this.scrollToBottom(), 100);

    // We no longer need to construct history manually for the API, 
    // we just pass sessionId and let backend handle it.
    // However, if we are starting a new chat (no sessionId), we send empty history implicitely.

    this.geminiService.sendMessage(prompt, [], this.currentSessionId || undefined, imageToSend).subscribe(response => {
      this.isLoading = false;

      // Update current session ID if this was a new chat
      if (response.sessionId) {
        if (this.currentSessionId !== response.sessionId) {
          this.currentSessionId = response.sessionId;
          this.loadSessions(); // Refresh list to show new chat
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
      setTimeout(() => this.scrollToBottom(), 100);
    });
  }

  toggleRecipe(item: ChatContentItem) {
    if (item.type === 'recipe') {
      item.expanded = !item.expanded;
    }
  }

  saveRecipe(recipe: any) {
    const newRecipe = {
      title: recipe.title,
      description: recipe.description,
      source: 'gemini-pro-latest',
      ingredients: recipe.ingredients,
      steps: recipe.instructions.map((inst: string) => ({ description: inst }))
    };

    this.recipeService.create(newRecipe).subscribe({
      next: (res) => {
        this.snackBar.open('Recipe saved successfully!', 'Close', { duration: 3000 });
      },
      error: (err) => {
        this.snackBar.open('Failed to save recipe.', 'Close', { duration: 3000 });
        console.error(err);
      }
    });
  }

  newChat() {
    this.messages = [];
    this.currentSessionId = null;
    if (this.isMobile) {
      this.showSidebar = false;
    }
    setTimeout(() => this.scrollToBottom(), 100);
  }

  scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }

  backToSessions() {
    this.showSidebar = true;
  }
}

