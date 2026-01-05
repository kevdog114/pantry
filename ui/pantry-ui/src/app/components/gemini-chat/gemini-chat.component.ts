import { Component } from '@angular/core';
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
export class GeminiChatComponent {
  messages: ChatMessage[] = [];
  newMessage: string = '';

  constructor(private geminiService: GeminiService, private snackBar: MatSnackBar) { }

  sendMessage() {
    if (this.newMessage.trim() === '') {
      return;
    }

    const prompt = this.newMessage;
    this.messages.push({ sender: 'You', type: 'chat', content: this.newMessage });
    this.newMessage = '';

    const history = this.messages.slice(0, -1).map(message => {
      // For history, we need to serialize back to text for the model context if possible, 
      // or just send the text content if it was a chat. 
      // If it was a recipe, we might want to send a summary or just the title to save tokens,
      // but for now let's just send the text content if available or a placeholder for recipe.
      // Actually, standard practice is to send what the model outputted. 
      // But the model outputted JSON. Ideally we send that back.
      let partText = '';
      if (message.type === 'chat') {
        partText = message.content || '';
      } else if (message.type === 'recipe' && message.recipe) {
        partText = JSON.stringify({ type: 'recipe', recipe: message.recipe });
      }

      return {
        role: message.sender === 'You' ? 'user' : 'model',
        parts: [{ text: partText }]
      };
    });

    this.geminiService.sendMessage(prompt, history).subscribe(response => {
      const data = response.data; // This is now a generic object { type, content?, recipe? }

      if (data.type === 'recipe') {
        this.messages.push({
          sender: 'Gemini',
          type: 'recipe',
          recipe: data.recipe,
          expanded: false
        });
      } else {
        // Default to chat
        this.messages.push({
          sender: 'Gemini',
          type: 'chat',
          content: data.content || JSON.stringify(data) // Fallback
        });
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
  }
}
