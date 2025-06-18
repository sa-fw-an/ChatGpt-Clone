// lib/enhanced-memory.ts - Enhanced Memory System with fallback
interface MemoryContext {
  userId: string;
  chatId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

interface MemoryItem {
  id: string;
  content: string;
  timestamp: Date;
  relevanceScore?: number;
  metadata?: Record<string, any>;
}

export class EnhancedMemoryService {
  private useLocal: boolean = true; // Always start with local fallback

  constructor() {
    // For now, always use local implementation
    // TODO: Enable mem0 when properly configured
    this.useLocal = true;
  }

  /**
   * Add memory from conversation
   */
  async addMemory(
    content: string, 
    context: MemoryContext, 
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (this.useLocal) {
      await this.localAddMemory(content, context, metadata);
    } else {
      try {
        // Attempt mem0 integration when available
        await this.mem0AddMemory(content, context, metadata);
      } catch (error) {
        console.error('Mem0 failed, falling back to local:', error);
        await this.localAddMemory(content, context, metadata);
      }
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
    if (this.useLocal) {
      return await this.localSearchMemories(query, context, limit);
    } else {
      try {
        return await this.mem0SearchMemories(query, context, limit);
      } catch (error) {
        console.error('Mem0 search failed, falling back to local:', error);
        return await this.localSearchMemories(query, context, limit);
      }
    }
  }

  /**
   * Get all memories for a user
   */
  async getUserMemories(
    context: MemoryContext, 
    limit: number = 20
  ): Promise<MemoryItem[]> {
    if (this.useLocal) {
      return await this.localGetUserMemories(context, limit);
    } else {
      try {
        return await this.mem0GetUserMemories(context, limit);
      } catch (error) {
        console.error('Mem0 get memories failed, falling back to local:', error);
        return await this.localGetUserMemories(context, limit);
      }
    }
  }

  /**
   * Get recent memories for context
   */
  async getRecentMemories(
    context: MemoryContext, 
    limit: number = 10
  ): Promise<MemoryItem[]> {
    if (this.useLocal) {
      return await this.localGetRecentMemories(context, limit);
    } else {
      try {
        return await this.mem0GetRecentMemories(context, limit);
      } catch (error) {
        console.error('Mem0 get recent memories failed, falling back to local:', error);
        return await this.localGetRecentMemories(context, limit);
      }
    }
  }

  /**
   * Delete specific memory
   */
  async deleteMemory(memoryId: string, userId: string): Promise<void> {
    await this.localDeleteMemory(memoryId, userId);
  }

  /**
   * Update memory
   */
  async updateMemory(
    memoryId: string, 
    content: string, 
    context: MemoryContext
  ): Promise<void> {
    await this.localUpdateMemory(memoryId, content, context);
  }

  /**
   * Extract and store memories from conversation
   */
  async processConversation(
    messages: Array<{ role: string; content: string }>,
    context: MemoryContext
  ): Promise<void> {
    try {
      // Extract important information from the conversation
      const conversationText = messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      await this.addMemory(conversationText, context, {
        type: 'conversation',
        messageCount: messages.length,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to process conversation:', error);
    }
  }

  /**
   * Get contextual memories for chat
   */
  async getContextualMemories(
    currentMessage: string,
    context: MemoryContext,
    limit: number = 3
  ): Promise<MemoryItem[]> {
    // Search for relevant memories based on current message
    const relevantMemories = await this.searchMemories(currentMessage, context, limit);
    
    // Also get recent memories from this chat
    const recentMemories = await this.getUserMemories(context, 5);
    
    // Combine and deduplicate
    const allMemories = [...relevantMemories, ...recentMemories];
    const uniqueMemories = allMemories.filter((memory, index, self) => 
      index === self.findIndex(m => m.id === memory.id)
    );

    return uniqueMemories.slice(0, limit);
  }

  // Mem0 implementation methods (placeholder for future integration)
  private async mem0AddMemory(
    content: string, 
    context: MemoryContext, 
    metadata: Record<string, any>
  ): Promise<void> {
    // TODO: Implement when mem0 API is properly configured
    throw new Error('Mem0 not configured');
  }

  private async mem0SearchMemories(
    query: string, 
    context: MemoryContext, 
    limit: number
  ): Promise<MemoryItem[]> {
    // TODO: Implement when mem0 API is properly configured
    throw new Error('Mem0 not configured');
  }

  private async mem0GetUserMemories(
    context: MemoryContext, 
    limit: number
  ): Promise<MemoryItem[]> {
    // TODO: Implement when mem0 API is properly configured
    throw new Error('Mem0 not configured');
  }

  private async mem0GetRecentMemories(
    context: MemoryContext, 
    limit: number
  ): Promise<MemoryItem[]> {
    // TODO: Implement when mem0 API is properly configured
    throw new Error('Mem0 not configured');
  }

  // Local MongoDB-based memory implementation
  private async localAddMemory(
    content: string, 
    context: MemoryContext, 
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const { MongoClient } = await import('mongodb');
      const clientPromise = await import('@/lib/mongodb');
      const client = await clientPromise.default;
      
      const db = client.db('chatgpt-clone');
      await db.collection('memories').insertOne({
        content,
        userId: context.userId,
        chatId: context.chatId,
        sessionId: context.sessionId,
        metadata,
        timestamp: new Date(),
        type: 'local'
      });
    } catch (error) {
      console.error('Local memory storage failed:', error);
    }
  }

  private async localSearchMemories(
    query: string, 
    context: MemoryContext, 
    limit: number
  ): Promise<MemoryItem[]> {
    try {
      const clientPromise = await import('@/lib/mongodb');
      const client = await clientPromise.default;
      
      const db = client.db('chatgpt-clone');
      const memories = await db.collection('memories')
        .find({
          userId: context.userId,
          $or: [
            { content: { $regex: query, $options: 'i' } },
            { 'metadata.keywords': { $regex: query, $options: 'i' } }
          ]
        })
        .limit(limit)
        .sort({ timestamp: -1 })
        .toArray();
      
      return memories.map(mem => ({
        id: mem._id.toString(),
        content: mem.content,
        timestamp: mem.timestamp,
        metadata: mem.metadata,
        relevanceScore: this.calculateRelevanceScore(query, mem.content)
      }));
    } catch (error) {
      console.error('Local memory search failed:', error);
      return []; // Return empty array instead of throwing
    }
  }

  private async localGetUserMemories(
    context: MemoryContext, 
    limit: number
  ): Promise<MemoryItem[]> {
    try {
      const clientPromise = await import('@/lib/mongodb');
      const client = await clientPromise.default;
      
      const db = client.db('chatgpt-clone');
      const filter: any = { userId: context.userId };
      if (context.chatId) {
        filter.chatId = context.chatId;
      }
      
      const memories = await db.collection('memories')
        .find(filter)
        .limit(limit)
        .sort({ timestamp: -1 })
        .toArray();
      
      return memories.map(mem => ({
        id: mem._id.toString(),
        content: mem.content,
        timestamp: mem.timestamp,
        metadata: mem.metadata
      }));
    } catch (error) {
      console.error('Local get user memories failed:', error);
      return [];
    }
  }

  private async localGetRecentMemories(
    context: MemoryContext, 
    limit: number
  ): Promise<MemoryItem[]> {
    try {
      const clientPromise = await import('@/lib/mongodb');
      const client = await clientPromise.default;
      
      const db = client.db('chatgpt-clone');
      const filter: any = { userId: context.userId };
      
      // Add recent time filter (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filter.timestamp = { $gte: thirtyDaysAgo };
      
      if (context.sessionId) {
        filter.sessionId = context.sessionId;
      }
      
      const memories = await db.collection('memories')
        .find(filter)
        .limit(limit)
        .sort({ timestamp: -1 })
        .toArray();
      
      return memories.map(mem => ({
        id: mem._id.toString(),
        content: mem.content,
        timestamp: mem.timestamp,
        relevanceScore: 0.8, // Default score for recent memories
        metadata: mem.metadata
      }));
    } catch (error) {
      console.error('Local get recent memories failed:', error);
      return [];
    }
  }

  private async localDeleteMemory(memoryId: string, userId: string): Promise<void> {
    try {
      const { ObjectId } = await import('mongodb');
      const clientPromise = await import('@/lib/mongodb');
      const client = await clientPromise.default;
      
      const db = client.db('chatgpt-clone');
      await db.collection('memories').deleteOne({
        _id: new ObjectId(memoryId),
        userId
      });
    } catch (error) {
      console.error('Local delete memory failed:', error);
    }
  }

  private async localUpdateMemory(
    memoryId: string, 
    content: string, 
    context: MemoryContext
  ): Promise<void> {
    try {
      const { ObjectId } = await import('mongodb');
      const clientPromise = await import('@/lib/mongodb');
      const client = await clientPromise.default;
      
      const db = client.db('chatgpt-clone');
      await db.collection('memories').updateOne(
        { _id: new ObjectId(memoryId), userId: context.userId },
        { $set: { content, updatedAt: new Date() } }
      );
    } catch (error) {
      console.error('Local update memory failed:', error);
    }
  }

  private calculateRelevanceScore(query: string, content: string): number {
    // Simple relevance scoring based on term frequency
    const queryTerms = query.toLowerCase().split(' ');
    const contentLower = content.toLowerCase();
    
    let score = 0;
    queryTerms.forEach(term => {
      const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
      score += matches;
    });
    
    return score / Math.max(content.length, 1);
  }
}

// Export singleton instance
export const memoryService = new EnhancedMemoryService();

// Utility functions
export const addToMemory = async (
  content: string, 
  userId: string, 
  chatId?: string, 
  metadata?: Record<string, any>
) => {
  await memoryService.addMemory(content, { userId, chatId }, metadata);
};

export const searchMemory = async (
  query: string, 
  userId: string, 
  chatId?: string, 
  limit?: number
) => {
  return await memoryService.searchMemories(query, { userId, chatId }, limit);
};

export const getContextualMemory = async (
  message: string,
  userId: string,
  chatId?: string
) => {
  return await memoryService.getContextualMemories(message, { userId, chatId });
};
