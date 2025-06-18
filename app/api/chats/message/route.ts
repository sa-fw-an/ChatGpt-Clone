//api/chats/message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { addToMemory, searchMemory } from '@/lib/memory';
import OpenAI from 'openai';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!
});


interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }    const body = await request.json();
    const { message, chatId, fileData, model = 'gpt-4o' } = body;

    if (!message || !chatId) {
      return NextResponse.json({ error: 'Message and chatId are required' }, { status: 400 });
    }

    if (!ObjectId.isValid(chatId)) {
      return NextResponse.json({ error: 'Invalid chat ID' }, { status: 400 });
    }    // Get chat history to include file context
    const client = await clientPromise;
    const db = client.db('chatgpt-clone');
    
    const chat = await db.collection('chats').findOne({ 
      _id: new ObjectId(chatId), 
      userId 
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found or unauthorized' }, { status: 404 });
    }

    // Search memory
    const relevantMemories = await searchMemory(message, userId, { 'metadata.chatId': chatId });

    const contextMessages = relevantMemories.map((mem) => ({
      role: 'system' as const,
      content: mem.content,
    }));

    // Add recent chat history for context (last 10 messages)
    const recentMessages = (chat.messages || []).slice(-10);
    const conversationHistory = [];    // Build conversation context including file content
    for (const msg of recentMessages) {
      if (msg.type === 'file' && msg.file) {
        // Include file content in context
        let fileContext = `File uploaded: ${msg.file.name} (${msg.file.fileType})`;
        if (msg.file.extractedText) {
          fileContext += `\nFile content: ${msg.file.extractedText}`;
        }
        conversationHistory.push({
          role: 'system' as const,
          content: fileContext
        });
        
        // Also include the file message
        conversationHistory.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        });
      } else {
        conversationHistory.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        });
      }
    }    // Add current file data if present
    if (fileData) {
      let fileContext = `Current file uploaded: ${fileData.fileName} (${fileData.fileType}, ${fileData.fileSize ? Math.round(fileData.fileSize / 1024 / 1024 * 100) / 100 + ' MB' : 'unknown size'})`;
      if (fileData.extractedText) {
        fileContext += `\nFile content:\n${fileData.extractedText}`;
      }
      if (fileData.url && fileData.fileType.startsWith('image/')) {
        fileContext += `\nImage URL: ${fileData.url}`;      }
      
      conversationHistory.push({
        role: 'system' as const,
        content: fileContext
      });
    }

    // Generate response with image support if needed
    let openaiMessages: any[] = [      {
        role: 'system',
        content: `You are an advanced AI assistant specialized in document analysis and contextual Q&A. Your primary capabilities include:

DOCUMENT PROCESSING:
- When users upload PDF files, you receive the complete extracted text content
- You can analyze text files, JSON data, CSV files, code files, and other text-based documents
- You have access to the full content of uploaded documents for accurate analysis

RESPONSE GUIDELINES:
1. PRIORITY: Always base your answers on the actual content provided from uploaded files
2. ACCURACY: Quote specific sections from documents when relevant to support your answers
3. CLARITY: If information is not available in the uploaded content, clearly state this limitation
4. STRUCTURE: For complex documents, organize your responses with clear sections and references
5. CONTEXT: Maintain awareness of the document structure, headings, and organization when answering

SPECIAL HANDLING:
- For PDFs: Treat extracted text as the authoritative source for all questions about the document
- For code files: Provide analysis of functionality, structure, and potential improvements
- For data files (JSON/CSV): Offer insights about data structure, patterns, and content analysis
- For text documents: Summarize, analyze, and answer questions based on the actual content

Always prioritize document content over general knowledge when the user asks about uploaded materials. Provide detailed, accurate responses that demonstrate thorough understanding of the uploaded content.`
      },
      ...contextMessages,
      ...conversationHistory,
    ];

    // Handle image files with vision
    if (fileData && fileData.fileType.startsWith('image/')) {
      openaiMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: message },
          { type: 'image_url', image_url: { url: fileData.url } }
        ]
      });
    } else {      // If we have file data with extracted text, enhance the user message with structured context
      let userMessage = message;
      if (fileData && fileData.extractedText && fileData.extractedText.length > 0) {
        // Enhanced PDF context passing
        if (fileData.fileType === 'application/pdf') {
          userMessage = `[CONTEXT: PDF Document Analysis]
Document: "${fileData.fileName}"
File Size: ${fileData.fileSize ? Math.round(fileData.fileSize / 1024 / 1024 * 100) / 100 + ' MB' : 'unknown'}

EXTRACTED CONTENT:
${fileData.extractedText}

USER QUESTION: ${message}

Instructions: Please analyze the PDF content above and answer the user's question based specifically on the information contained in this document. If the answer is not in the document, please state that clearly.`;
        } else if (fileData.fileType.includes('text/') || 
                   fileData.fileName.endsWith('.txt') || 
                   fileData.fileName.endsWith('.md') ||
                   fileData.fileName.endsWith('.json') ||
                   fileData.fileName.endsWith('.csv')) {
          userMessage = `[CONTEXT: ${fileData.fileType.toUpperCase()} File Analysis]
Document: "${fileData.fileName}"

FILE CONTENT:
${fileData.extractedText}

USER QUESTION: ${message}

Instructions: Please analyze the file content above and answer the user's question based on the information contained in this file.`;
        } else {
          userMessage = `[CONTEXT: Document Analysis]
File: ${fileData.fileName}
Type: ${fileData.fileType}

CONTENT:
${fileData.extractedText}

USER QUESTION: ${message}`;
        }
      }
      openaiMessages.push({ role: 'user', content: userMessage });
    }    const completion = await openai.chat.completions.create({
      model: model,
      messages: openaiMessages,
    });

    const aiResponse =
      completion.choices[0]?.message?.content || "I couldn't generate a response.";

    // Save to MongoDB (reuse existing client and db)
    const messagesToSave = [];
      // Add file message if present with enhanced metadata
    if (fileData) {
      const fileMessage = {
        id: new ObjectId().toString(),
        content: `Uploaded file: ${fileData.fileName}`,
        role: 'user',
        timestamp: new Date(),
        type: 'file',
        file: {
          url: fileData.url,
          name: fileData.fileName,
          fileType: fileData.fileType,
          size: fileData.fileSize,
          extractedText: fileData.extractedText,
          // Enhanced metadata for PDF context
          metadata: {
            hasText: fileData.extractedText && fileData.extractedText.length > 0,
            textLength: fileData.extractedText ? fileData.extractedText.length : 0,
            isPDF: fileData.fileType === 'application/pdf',
            processingDate: new Date(),
            cloudinaryId: fileData.cloudinaryId,
            contentPreview: fileData.extractedText && fileData.extractedText.length > 0 
              ? fileData.extractedText.substring(0, 500) + (fileData.extractedText.length > 500 ? '...' : '')
              : null
          }
        }
      };
      messagesToSave.push(fileMessage);
    }
    
    // Add user text message
    const userMessage: Message = {
      id: new ObjectId().toString(),
      content: message,
      role: 'user',
      timestamp: new Date(),    };
    messagesToSave.push(userMessage);

    const assistantMessage: Message = {
      id: new ObjectId().toString(),
      content: aiResponse,
      role: 'assistant',
      timestamp: new Date(),
    };

    // Add assistant message
    messagesToSave.push(assistantMessage);

    const updateResult = await db.collection('chats').updateOne(
      { _id: new ObjectId(chatId), userId },
      {
        $push: {
          messages: { $each: messagesToSave },
        },
        $set: {
          updatedAt: new Date(),
          lastMessage: message,
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ error: 'Chat not found or unauthorized' }, { status: 404 });
    }    // Add to memory
    const memoryEntries = [
      { content: message, role: 'user' as const, metadata: { chatId } },
      { content: aiResponse, role: 'assistant' as const, metadata: { chatId } },
    ];
    
    // Add file content to memory if present
    if (fileData && fileData.extractedText) {
      memoryEntries.unshift({
        content: `File: ${fileData.fileName} - ${fileData.extractedText}`,
        role: 'user' as const,
        metadata: { chatId }
      });
    }
    
    await addToMemory(memoryEntries, userId);

    return NextResponse.json({ message: aiResponse, chatId });  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error processing chat message:', error);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db('chatgpt-clone');

    const chats = await db
      .collection('chats')
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json(
      chats.map((chat) => ({
        id: chat._id.toString(),
        title: chat.title,
        lastMessage: chat.lastMessage || 'New chat',
        timestamp: chat.updatedAt,
        messageCount: chat.messages?.length || 0,
      }))
    );  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching chats:', error);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
