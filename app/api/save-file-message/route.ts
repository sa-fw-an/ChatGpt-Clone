// app/api/save-file-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(req: NextRequest) {
  try {
    console.log('Save file message endpoint called');
    
    const { userId } = await auth();
    if (!userId) {
      console.log('No user ID found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('User authenticated:', userId);

    const body = await req.json();
    const { chatId, fileData } = body;

    console.log('Request body:', { chatId, fileData: fileData ? 'present' : 'missing' });

    if (!chatId) {
      console.log('Missing chat ID');
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    if (!fileData) {
      console.log('Missing file data');
      return NextResponse.json({ error: 'File data is required' }, { status: 400 });
    }

    console.log('Saving file message for chat:', chatId);

    // Connect to database using same method as chat creation
    const client = await clientPromise;
    const db = client.db('chatgpt-clone');
    
    console.log('Database connected');
    
    let chat;
    try {
      chat = await db.collection('chats').findOne({ _id: new ObjectId(chatId) });
      console.log('Chat lookup result:', chat ? 'found' : 'not found');
      console.log('Chat ID being searched:', chatId);
    } catch (dbError) {
      console.error('Database error during chat lookup:', dbError);
      return NextResponse.json({ 
        error: 'Database error', 
        details: dbError instanceof Error ? dbError.message : 'Unknown database error' 
      }, { status: 500 });
    }
    
    if (!chat) {
      console.log('Chat not found in database');
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Create file message
    const fileMessage = {
      id: Date.now().toString(),
      content: `Uploaded file: ${fileData.fileName}`,
      role: 'user' as const,
      timestamp: new Date(),
      type: 'file' as const,
      file: {
        url: fileData.url,
        name: fileData.fileName,
        fileType: fileData.fileType,
        size: fileData.fileSize,
        extractedText: fileData.extractedText
      }
    };

    // Add AI analysis message if available
    const messages: any[] = [fileMessage];
    if (fileData.analysis) {
      const analysisMessage = {
        id: (Date.now() + 1).toString(),
        content: fileData.analysis,
        role: 'assistant' as const,
        timestamp: new Date(),
        type: 'text' as const
      };
      messages.push(analysisMessage);
    }

    // Add messages to chat using MongoDB client
    const updateResult = await db.collection('chats').updateOne(
      { _id: new ObjectId(chatId) },
      {
        $push: { messages: { $each: messages } },
        $set: { 
          updatedAt: new Date(),
          lastMessage: `File: ${fileData.fileName}`
        }
      }
    );

    if (!updateResult.modifiedCount) {
      console.log('Failed to update chat');
      return NextResponse.json({ error: 'Failed to update chat' }, { status: 500 });
    }

    console.log('File message saved to chat');

    return NextResponse.json({
      success: true,
      messages: messages
    });

  } catch (error) {
    console.error('Save file message error:', error);
    return NextResponse.json({
      error: 'Failed to save file message',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
