// lib/memory-client.ts - Client-side memory service wrapper
export interface MemoryContext {
  userId: string;
  chatId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface MemoryItem {
  id: string;
  content: string;
  timestamp: Date;
  relevanceScore?: number;
  metadata?: Record<string, any>;
}

export class MemoryClient {
  /**
   * Add memory from conversation
   */
  async addMemory(
    content: string, 
    context: MemoryContext, 
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add',
          content,
          context,
          metadata
        })
      });

      if (!response.ok) {
        throw new Error(`Memory add failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('Failed to add memory:', error);
      // Fail silently for better UX
    }
  }

  /**
   * Search memories by content
   */
  async searchMemories(
    query: string, 
    context: MemoryContext,
    limit: number = 5
  ): Promise<MemoryItem[]> {
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'search',
          query,
          context,
          limit
        })
      });

      if (!response.ok) {
        throw new Error(`Memory search failed: ${response.status}`);
      }

      const data = await response.json();
      return data.memories || [];
    } catch (error) {
      console.warn('Failed to search memories:', error);
      return [];
    }
  }

  /**
   * Get recent memories for context
   */
  async getRecentMemories(
    context: MemoryContext,
    limit: number = 10
  ): Promise<MemoryItem[]> {
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'recent',
          context,
          limit
        })
      });

      if (!response.ok) {
        throw new Error(`Recent memories fetch failed: ${response.status}`);
      }

      const data = await response.json();
      return data.memories || [];
    } catch (error) {
      console.warn('Failed to get recent memories:', error);
      return [];
    }
  }

  /**
   * Delete specific memory
   */
  async deleteMemory(
    memoryId: string, 
    context: MemoryContext
  ): Promise<void> {
    try {
      const response = await fetch('/api/memory', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memoryId,
          context
        })
      });

      if (!response.ok) {
        throw new Error(`Memory delete failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('Failed to delete memory:', error);
    }
  }
}
