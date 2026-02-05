import { Component, OnInit, OnDestroy } from '@angular/core';
import { GeminiService, StreamEvent } from '../../services/gemini.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { RecipeService } from '../../services/recipe.service';
import { SocketService } from '../../services/socket.service';
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
export class GeminiChatComponent implements OnInit, OnDestroy {
  showSidebar: boolean = true;
  isMobile: boolean = window.innerWidth <= 768;

  messages: ChatMessage[] = [];
  isLoading: boolean = false;
  loadingText: string = 'Thinking...';

  sessions: any[] = [];
  currentSessionId: number | null = null;
  currentTab: 'adhoc' | 'recipe' | 'product' = 'adhoc';

  get filteredSessions() {
    return this.sessions.filter(s => {
      if (this.currentTab === 'adhoc') return !s.entityType;
      return s.entityType === this.currentTab;
    });
  }

  setTab(tab: 'adhoc' | 'recipe' | 'product') {
    this.currentTab = tab;
  }

  constructor(
    private geminiService: GeminiService,
    private snackBar: MatSnackBar,
    private recipeService: RecipeService,
    private socketService: SocketService
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

    // Listen for session title updates from backend (async title generation)
    this.socketService.fromEvent<{ sessionId: number; title: string }>('chat_session_updated').subscribe(
      (event) => {
        // Update the session title in our local list
        const session = this.sessions.find(s => s.id === event.sessionId);
        if (session) {
          session.title = event.title;
        }
      }
    );
  }

  ngOnDestroy() {
    this.socketService.removeListener('chat_session_updated');
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
          const contents: ChatContentItem[] = [];

          // Handle tool_call type separately - display as system message
          if (msg.type === 'tool_call') {
            const toolCallMessage: ChatMessage = {
              sender: 'Gemini',
              contents: [{
                type: 'tool_call',
                toolCall: msg.toolCallData ? JSON.parse(msg.toolCallData) : { name: 'unknown' },
                durationMs: msg.toolCallDurationMs
              }],
              timestamp: msg.createdAt ? new Date(msg.createdAt) : undefined
            };
            this.messages.push(toolCallMessage);
            return;
          }

          const sender = msg.sender === 'user' ? 'You' : 'Gemini';

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
                contents: contents,
                timestamp: msg.createdAt ? new Date(msg.createdAt) : undefined
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
          ],
          timestamp: new Date()
        });
        this.executeSend(prompt, image);
      };
      reader.readAsDataURL(image);
    } else {
      if (prompt) {
        userContents.push({ type: 'chat', text: prompt });
      }
      this.messages.push({ sender: 'You', contents: userContents, timestamp: new Date() });
      this.executeSend(prompt, undefined);
    }
  }

  executeSend(prompt: string, image?: File) {
    this.isLoading = true;
    this.loadingText = 'Thinking...';

    // If image is present, fall back to non-streaming endpoint
    if (image) {
      this.executeNonStreamingSend(prompt, image);
      return;
    }

    // We'll create the streaming message when the first chunk arrives
    let streamingMessage: ChatMessage | null = null;
    let accumulatedText = '';
    let earlyMeta: ChatMessage['meta'] = undefined;

    this.geminiService.sendMessageStream(
      prompt,
      this.currentSessionId || undefined
    ).subscribe({
      next: (event: StreamEvent) => {
        if (event.type === 'session' && event.sessionId) {
          if (this.currentSessionId !== event.sessionId) {
            this.currentSessionId = event.sessionId;
            this.loadSessions();
          }
        } else if (event.type === 'meta') {
          // Early metadata event - store it to apply when message is created
          // The backend sends modelName and usingCache as top-level properties
          earlyMeta = {
            modelName: event.modelName,
            usingCache: event.usingCache
          };
          // If streaming message already exists, apply immediately
          if (streamingMessage) {
            streamingMessage.meta = { ...streamingMessage.meta, ...earlyMeta };
          }
        } else if (event.type === 'tool_call' && event.toolCall) {
          if (!streamingMessage) {
            streamingMessage = {
              sender: 'Gemini',
              contents: [],
              timestamp: new Date(),
              meta: earlyMeta // Apply early metadata if available
            };
            this.messages.push(streamingMessage);
          }
          streamingMessage.contents.push({
            type: 'tool_call',
            toolCall: event.toolCall
          });
          // Use displayName from backend if available, otherwise fallback to tool name
          this.loadingText = (event as any).displayName || `Using tool: ${event.toolCall.name}...`;
        } else if (event.type === 'chunk' && event.text) {
          accumulatedText += event.text;
          const displayText = this.extractDisplayText(accumulatedText);

          // Update loading text based on what's being generated
          this.updateLoadingText(accumulatedText);

          // Only show the message once we have real content to display
          const hasRealContent = displayText && displayText !== '...' && displayText.trim().length > 0;

          if (!streamingMessage && hasRealContent) {
            // Create streaming message when we have real content
            streamingMessage = {
              sender: 'Gemini',
              contents: [{ type: 'chat', text: displayText }],
              timestamp: new Date(),
              meta: earlyMeta // Apply early metadata if available
            };
            this.messages.push(streamingMessage);
            // Keep isLoading = true so the loading indicator stays visible
          } else if (streamingMessage) {
            // Find or create chat content
            const chatContent = streamingMessage.contents.find(c => c.type === 'chat');
            if (chatContent) {
              chatContent.text = displayText;
            } else if (hasRealContent) {
              streamingMessage.contents.push({ type: 'chat', text: displayText });
            }
          }
        } else if (event.type === 'done' && event.data) {
          // Replace streaming content with final parsed content
          this.isLoading = false;
          this.loadingText = 'Thinking...';
          if (streamingMessage) {
            streamingMessage.contents = this.parseGeminiResponse(event.data);
            // Merge early meta with final meta (final has usageMetadata)
            if (event.meta) {
              streamingMessage.meta = { ...streamingMessage.meta, ...event.meta };
            }
          } else {
            // No chunks received, create final message directly
            // Merge early meta with final meta
            const finalMessage: ChatMessage = {
              sender: 'Gemini',
              contents: this.parseGeminiResponse(event.data),
              timestamp: new Date(),
              meta: { ...earlyMeta, ...event.meta }
            };
            this.messages.push(finalMessage);
          }
        } else if (event.type === 'error') {
          this.isLoading = false;
          const errorMessage: ChatMessage = {
            sender: 'Gemini',
            contents: [{
              type: 'chat',
              text: `Error: ${event.message || 'An error occurred'}`
            }],
            timestamp: new Date()
          };
          if (streamingMessage) {
            streamingMessage.contents = errorMessage.contents;
          } else {
            this.messages.push(errorMessage);
          }
          this.snackBar.open(event.message || 'Streaming error', 'Close', { duration: 5000 });
        }
      },
      error: (err) => {
        this.isLoading = false;
        const errorMessage: ChatMessage = {
          sender: 'Gemini',
          contents: [{
            type: 'chat',
            text: `Error: ${err.message || 'Connection failed'}`
          }],
          timestamp: new Date()
        };
        if (streamingMessage) {
          streamingMessage.contents = errorMessage.contents;
        } else {
          this.messages.push(errorMessage);
        }
        this.snackBar.open('Connection error', 'Close', { duration: 5000 });
      },
      complete: () => {
        this.isLoading = false;
        this.loadingText = 'Thinking...';
      }
    });
  }

  /**
   * Update the loading indicator text based on what's being generated.
   */
  private updateLoadingText(accumulatedText: string): void {
    // Check if a recipe is being generated
    const hasRecipe = accumulatedText.includes('"recipe"') ||
      accumulatedText.includes('"type": "recipe"') ||
      accumulatedText.includes('"type":"recipe"');

    if (hasRecipe) {
      // Try to extract recipe title
      const titleMatch = accumulatedText.match(/"title"\s*:\s*"([^"]*)"/);
      if (titleMatch && titleMatch[1]) {
        this.loadingText = `Creating recipe: ${titleMatch[1]}...`;
      } else {
        this.loadingText = 'Creating recipe...';
      }
    } else if (accumulatedText.length > 50) {
      // Once we have some content, show a different message
      this.loadingText = 'Generating response...';
    }
  }

  /**
   * Extract displayable text from the raw Gemini stream.
   * Handles both JSON-wrapped content and plain text.
   * Properly extracts multiple chat contents and shows recipe placeholders.
   */
  private extractDisplayText(rawText: string): string {
    if (!rawText || rawText.trim().length === 0) {
      return '';
    }

    let text = rawText.trim();

    // Remove markdown code block wrappers
    if (text.startsWith('```json')) {
      text = text.substring(7);
    } else if (text.startsWith('```')) {
      text = text.substring(3);
    }
    if (text.endsWith('```')) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    // Try to parse as complete JSON first
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        // If it's our expected structure, extract all chat contents
        if (parsed.items && Array.isArray(parsed.items)) {
          const displayParts: string[] = [];
          parsed.items.forEach((item: any) => {
            if (item.type === 'chat' && item.content) {
              displayParts.push(item.content);
            } else if (item.type === 'recipe' && item.recipe) {
              // Indicate a recipe will appear here
              displayParts.push(`🍳 *Recipe: ${item.recipe.title || 'Loading...'}*`);
            }
          });
          if (displayParts.length > 0) {
            return displayParts.join('\n\n');
          }
        }
        // Single item with content
        if (parsed.content) {
          return parsed.content;
        }
      } catch (e) {
        // JSON not complete yet, try to extract partial content
      }
    }

    // For partial JSON, we need to extract content more intelligently
    // Strategy: Find all complete "content": "value" pairs AND any partial one at the end
    const displayParts: string[] = [];

    // Find all complete content fields
    const contentMatches = text.matchAll(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
    for (const match of contentMatches) {
      if (match[1]) {
        const content = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        if (content.trim().length > 0) {
          displayParts.push(content);
        }
      }
    }

    // Check if there's a partial content at the end (still being written)
    // Find the last "content": " that doesn't have a closing quote
    const lastContentIndex = text.lastIndexOf('"content"');
    if (lastContentIndex !== -1) {
      const afterContent = text.substring(lastContentIndex);
      // Check if this content field is incomplete (no closing quote after the opening)
      const partialMatch = afterContent.match(/^"content"\s*:\s*"((?:[^"\\]|\\.)*?)$/);
      if (partialMatch && partialMatch[1]) {
        const partialContent = partialMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        if (partialContent.trim().length > 0) {
          // Only add if it's not already included in the complete matches
          displayParts.push(partialContent);
        }
      }
    }

    // If we have content to display, show it directly (recipes will appear on final parse)
    if (displayParts.length > 0) {
      return displayParts.join('\n\n');
    }

    // No text content found - check if there's a recipe being generated
    const hasRecipeInProgress = text.includes('"type"') &&
      (text.includes('"recipe"') || text.includes('"type": "recipe"') || text.includes('"type":"recipe"'));

    if (hasRecipeInProgress) {
      const titleMatch = text.match(/"title"\s*:\s*"([^"]*)"/);
      if (titleMatch && titleMatch[1]) {
        return `🍳 Creating recipe: **${titleMatch[1]}**...`;
      }
      return '🍳 Creating recipe...';
    }

    // If it looks like JSON but we couldn't extract anything useful
    if (text.startsWith('{')) {
      return '...';
    }

    return text || '...';
  }

  /**
   * Parse the final Gemini response into ChatContentItems.
   */
  private parseGeminiResponse(data: any): ChatContentItem[] {
    const geminiContents: ChatContentItem[] = [];

    if (data.items && Array.isArray(data.items)) {
      data.items.forEach((item: any) => {
        if (item.type === 'recipe' && item.recipe) {
          geminiContents.push({
            type: 'recipe',
            recipe: item.recipe,
            expanded: false
          });
        } else if (item.type === 'tool_call' && item.toolCall) {
          geminiContents.push({
            type: 'tool_call',
            toolCall: item.toolCall
          });
        } else {
          geminiContents.push({
            type: 'chat',
            text: item.content || JSON.stringify(item)
          });
        }
      });
    } else {
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

    return geminiContents.length > 0 ? geminiContents : [{ type: 'chat', text: '' }];
  }

  /**
   * Non-streaming fallback for when images are attached.
   */
  private executeNonStreamingSend(prompt: string, image: File) {
    this.geminiService.sendMessage(prompt, [], this.currentSessionId || undefined, image).subscribe(response => {
      this.isLoading = false;

      if (response.sessionId) {
        if (this.currentSessionId !== response.sessionId) {
          this.currentSessionId = response.sessionId;
          this.loadSessions();
        }
      }

      const geminiContents = this.parseGeminiResponse(response.data);

      if (geminiContents.length > 0) {
        this.messages.push({
          sender: 'Gemini',
          contents: geminiContents,
          timestamp: new Date(),
          meta: response.meta
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

  openDebugLog() {
    if (this.currentSessionId) {
      window.open('/gemini/logs/' + this.currentSessionId, '_blank');
    }
  }
}
