// app/api/memory/route.ts - Memory API endpoint
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { EnhancedMemoryService } from '@/lib/enhanced-memory';

const memoryService = new EnhancedMemoryService();

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, content, context, metadata, query, limit = 5 } = body;

    // Ensure context includes userId
    const enhancedContext = {
      ...context,
      userId
    };

    switch (action) {
      case 'add':
        if (!content || !context) {
          return NextResponse.json({ error: 'Content and context are required for add action' }, { status: 400 });
        }
        await memoryService.addMemory(content, enhancedContext, metadata || {});
        return NextResponse.json({ success: true });

      case 'search':
        if (!query) {
          return NextResponse.json({ error: 'Query is required for search action' }, { status: 400 });
        }
        const searchResults = await memoryService.searchMemories(query, enhancedContext, limit);
        return NextResponse.json({ memories: searchResults });

      case 'recent':
        const recentMemories = await memoryService.getRecentMemories(enhancedContext, limit);
        return NextResponse.json({ memories: recentMemories });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Memory API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { memoryId, context } = body;

    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID is required' }, { status: 400 });
    }

    const enhancedContext = {
      ...context,
      userId
    };

    await memoryService.deleteMemory(memoryId, enhancedContext);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Memory API delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
