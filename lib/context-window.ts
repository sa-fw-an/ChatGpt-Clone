// lib/context-window.ts - Context window management utilities

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  type?: 'text' | 'file';
  file?: any;
}

interface ModelConfig {
  id: string;
  contextWindow: number;
  reserveTokens?: number; // Tokens to reserve for response
}

// Approximate token counting (rough estimation: 1 token ≈ 4 characters)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// Model configurations with context windows
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'gpt-4o': {
    id: 'gpt-4o',
    contextWindow: 128000,
    reserveTokens: 4000
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    contextWindow: 128000,
    reserveTokens: 4000
  },
  'gpt-4-turbo': {
    id: 'gpt-4-turbo',
    contextWindow: 128000,
    reserveTokens: 4000
  },
  'gpt-3.5-turbo': {
    id: 'gpt-3.5-turbo',
    contextWindow: 16385,
    reserveTokens: 2000
  },
  'claude-3.5-sonnet': {
    id: 'claude-3.5-sonnet',
    contextWindow: 200000,
    reserveTokens: 4000
  }
};

// Context window management strategies
export type ContextStrategy = 'truncate' | 'summarize' | 'sliding-window';

interface ContextWindowOptions {
  modelId: string;
  strategy?: ContextStrategy;
  systemPrompt?: string;
  fileData?: any;
  preserveRecentMessages?: number; // Always keep the N most recent messages
}

export class ContextWindowManager {
  private modelConfig: ModelConfig;
  private strategy: ContextStrategy;
  private preserveRecentMessages: number;

  constructor(modelId: string, strategy: ContextStrategy = 'sliding-window', preserveRecentMessages: number = 10) {
    this.modelConfig = MODEL_CONFIGS[modelId] || MODEL_CONFIGS['gpt-4o'];
    this.strategy = strategy;
    this.preserveRecentMessages = preserveRecentMessages;
  }

  /**
   * Prepare messages for API call with context window management
   */
  prepareMessages(
    messages: Message[],
    systemPrompt: string,
    fileData?: any,
    currentMessage?: string
  ): any[] {
    const availableTokens = this.modelConfig.contextWindow - (this.modelConfig.reserveTokens || 4000);
    
    let totalTokens = 0;
    const processedMessages: any[] = [];

    // Add system prompt (always included)
    const systemMessage = { role: 'system', content: systemPrompt };
    totalTokens += estimateTokens(systemPrompt);
    processedMessages.push(systemMessage);

    // Add file context if present (high priority)
    if (fileData && fileData.extractedText) {
      const fileContext = this.formatFileContext(fileData);
      const fileTokens = estimateTokens(fileContext);
      
      if (totalTokens + fileTokens < availableTokens) {
        processedMessages.push({ role: 'system', content: fileContext });
        totalTokens += fileTokens;
      } else {
        // Truncate file content if too large
        const maxFileTokens = Math.floor(availableTokens * 0.4); // Use up to 40% for file content
        const truncatedContent = this.truncateText(fileContext, maxFileTokens);
        processedMessages.push({ role: 'system', content: truncatedContent });
        totalTokens += estimateTokens(truncatedContent);
      }
    }

    // Add current message if provided
    if (currentMessage) {
      const currentTokens = estimateTokens(currentMessage);
      totalTokens += currentTokens;
    }

    // Process conversation history based on strategy
    const historyMessages = this.processConversationHistory(
      messages,
      availableTokens - totalTokens
    );

    processedMessages.push(...historyMessages);

    // Add current message at the end
    if (currentMessage) {
      processedMessages.push({ role: 'user', content: currentMessage });
    }

    return processedMessages;
  }

  private processConversationHistory(messages: Message[], availableTokens: number): any[] {
    switch (this.strategy) {
      case 'truncate':
        return this.truncateMessages(messages, availableTokens);
      case 'sliding-window':
        return this.slidingWindowMessages(messages, availableTokens);
      case 'summarize':
        return this.summarizeMessages(messages, availableTokens);
      default:
        return this.slidingWindowMessages(messages, availableTokens);
    }
  }

  private truncateMessages(messages: Message[], availableTokens: number): any[] {
    const result: any[] = [];
    let totalTokens = 0;

    // Process messages from most recent backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageContent = this.formatMessage(message);
      const messageTokens = Array.isArray(messageContent) 
        ? estimateTokens(JSON.stringify(messageContent)) 
        : estimateTokens(messageContent);

      if (totalTokens + messageTokens <= availableTokens) {
        result.unshift({ role: message.role, content: messageContent });
        totalTokens += messageTokens;
      } else {
        break;
      }
    }

    return result;
  }

  private slidingWindowMessages(messages: Message[], availableTokens: number): any[] {
    const result: any[] = [];
    let totalTokens = 0;

    // Always preserve the most recent messages
    const recentMessages = messages.slice(-this.preserveRecentMessages);
    
    // Process recent messages first
    for (const message of recentMessages.reverse()) {
      const messageContent = this.formatMessage(message);
      const messageTokens = Array.isArray(messageContent) 
        ? estimateTokens(JSON.stringify(messageContent)) 
        : estimateTokens(messageContent);

      if (totalTokens + messageTokens <= availableTokens) {
        result.unshift({ role: message.role, content: messageContent });
        totalTokens += messageTokens;
      } else if (result.length === 0) {
        // If even the most recent message is too long, truncate it
        if (Array.isArray(messageContent)) {
          // For multimodal content, just include it as is
          result.push({ role: message.role, content: messageContent });
        } else {
          const truncatedContent = this.truncateText(messageContent, availableTokens);
          result.push({ role: message.role, content: truncatedContent });
        }
        break;
      } else {
        break;
      }
    }

    // Fill remaining space with older messages if possible
    const olderMessages = messages.slice(0, -this.preserveRecentMessages);
    for (let i = olderMessages.length - 1; i >= 0; i--) {
      const message = olderMessages[i];
      const messageContent = this.formatMessage(message);
      const messageTokens = Array.isArray(messageContent) 
        ? estimateTokens(JSON.stringify(messageContent)) 
        : estimateTokens(messageContent);

      if (totalTokens + messageTokens <= availableTokens) {
        result.unshift({ role: message.role, content: messageContent });
        totalTokens += messageTokens;
      } else {
        break;
      }
    }

    return result;
  }

  private summarizeMessages(messages: Message[], availableTokens: number): any[] {
    // For now, fall back to sliding window
    // In a full implementation, this would use AI to summarize older messages
    return this.slidingWindowMessages(messages, availableTokens);
  }

  private formatMessage(message: Message): string | any[] {
    if (message.type === 'file' && message.file) {
      // For images, return multimodal content if URL is available
      if (message.file.metadata?.isImage && message.file.url) {
        return [
          {
            type: 'text',
            text: `${message.content}${message.file.analysis ? ` - ${message.file.analysis}` : ''}`
          },
          {
            type: 'image_url',
            image_url: {
              url: message.file.url
            }
          }
        ];
      }
      
      // For text files, return text content
      let content = `[File: ${message.file.name}]`;
      if (message.file.extractedText) {
        content += `\n${message.file.extractedText}`;
      }
      return content;
    }
    return message.content;
  }

  private formatFileContext(fileData: any): string {
    if (!fileData.extractedText) return '';

    return `[DOCUMENT CONTEXT]
File: ${fileData.fileName}
Type: ${fileData.fileType}
Size: ${fileData.fileSize ? Math.round(fileData.fileSize / 1024 / 1024 * 100) / 100 + ' MB' : 'unknown'}

Content:
${fileData.extractedText}

[END DOCUMENT CONTEXT]`;
  }

  private truncateText(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4; // Rough conversion
    if (text.length <= maxChars) return text;

    const truncated = text.substring(0, maxChars - 100); // Leave room for truncation notice
    return truncated + '\n\n[Content truncated due to length limits...]';
  }

  /**
   * Get context window info for the current model
   */
  getContextInfo(): { modelId: string; contextWindow: number; reserveTokens: number } {
    return {
      modelId: this.modelConfig.id,
      contextWindow: this.modelConfig.contextWindow,
      reserveTokens: this.modelConfig.reserveTokens || 4000
    };
  }

  /**
   * Estimate if a conversation will fit in context window
   */
  willFitInContext(messages: Message[], systemPrompt: string, currentMessage?: string): boolean {
    let totalTokens = estimateTokens(systemPrompt);
    
    if (currentMessage) {
      totalTokens += estimateTokens(currentMessage);
    }

    for (const message of messages) {
      const messageContent = this.formatMessage(message);
      const messageTokens = Array.isArray(messageContent) 
        ? estimateTokens(JSON.stringify(messageContent)) 
        : estimateTokens(messageContent);
      totalTokens += messageTokens;
    }

    return totalTokens <= (this.modelConfig.contextWindow - (this.modelConfig.reserveTokens || 4000));
  }
}

// Export utility functions
export const createContextManager = (modelId: string): ContextWindowManager => {
  return new ContextWindowManager(modelId);
};

export const getModelConfig = (modelId: string): ModelConfig => {
  return MODEL_CONFIGS[modelId] || MODEL_CONFIGS['gpt-4o'];
};
