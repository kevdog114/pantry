import { Component } from '@angular/core';
import { GeminiService } from '../../services/gemini.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-gemini-chat',
  templateUrl: './gemini-chat.component.html',
  styleUrls: ['./gemini-chat.component.css'],
  imports: [CommonModule, FormsModule],
  standalone: true,
})
export class GeminiChatComponent {
  messages: { sender: string, text: string }[] = [];
  newMessage: string = '';

  constructor(private geminiService: GeminiService) { }

  sendMessage() {
    if (this.newMessage.trim() === '') {
      return;
    }

    const prompt = this.newMessage;
    this.messages.push({ sender: 'You', text: this.newMessage });
    this.newMessage = '';

    const history = this.messages.slice(0, -1).map(message => {
      return {
        role: message.sender === 'You' ? 'user' : 'model',
        parts: [{ text: message.text }]
      };
    });

    this.geminiService.sendMessage(prompt, history).subscribe(response => {
      this.messages.push({ sender: 'Gemini', text: response.data });
    });
  }

  newChat() {
    this.messages = [];
  }
}
