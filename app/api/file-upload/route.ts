// app/api/file-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import cloudinary from '@/lib/cloudinary';
import OpenAI from 'openai';
import { connectToDatabase } from '@/lib/database';
import Chat from '@/models/Chats';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    console.log('File upload endpoint called');
    
    const { userId } = await auth();
    if (!userId) {
      console.log('No user ID found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('User authenticated:', userId);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const chatId = formData.get('chatId')?.toString();

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    console.log('Processing file:', file.name, 'for chat:', chatId);

    // Validate file size
    const maxSize = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: `File too large. Maximum size is ${file.type.startsWith('image/') ? '10MB for images' : '50MB for documents'}.` 
      }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const resourceType = file.type.startsWith('image/') ? 'image' : 'raw';
      
      cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
          folder: 'chat-files',
          public_id: `${chatId}_${Date.now()}_${file.name.replace(/\.[^/.]+$/, "")}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    const cloudinaryResult = uploadResult as any;
    console.log('File uploaded to Cloudinary:', cloudinaryResult.secure_url);

    // Extract text from file if it's a document
    let extractedText = '';
    if (!file.type.startsWith('image/')) {
      try {
        if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          extractedText = buffer.toString('utf-8');
        } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
          extractedText = buffer.toString('utf-8');
        } else {
          extractedText = `Document: ${file.name} (${file.type})`;
        }
      } catch (error) {
        console.log('Could not extract text, using filename');
        extractedText = `Document: ${file.name}`;
      }
    }

    // Analyze with AI if there's content
    let aiAnalysis = '';
    if (extractedText && extractedText.length > 10) {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that analyzes uploaded files. Provide a brief, useful summary of the file content."
            },
            {
              role: "user",
              content: `Please analyze this file content and provide a brief summary:\n\nFile: ${file.name}\nContent: ${extractedText.substring(0, 2000)}`
            }
          ],
          max_tokens: 300
        });
        
        aiAnalysis = response.choices[0]?.message?.content || 'Analysis not available';
      } catch (error) {
        console.error('AI analysis error:', error);
        aiAnalysis = 'AI analysis temporarily unavailable';
      }
    } else if (file.type.startsWith('image/')) {
      aiAnalysis = 'Image uploaded successfully. You can ask me questions about this image.';
    } else {
      aiAnalysis = `File "${file.name}" uploaded successfully.`;
    }

    // Connect to database and save file message
    await connectToDatabase();
    
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Create file message
    const fileMessage = {
      id: Date.now().toString(),
      content: aiAnalysis,
      role: 'assistant' as const,
      timestamp: new Date(),
      type: 'file' as const,
      file: {
        url: cloudinaryResult.secure_url,
        name: file.name,
        fileType: file.type,
        size: file.size,
        extractedText: extractedText
      }
    };

    // Add file message to chat
    chat.messages.push(fileMessage);
    chat.updatedAt = new Date();
    chat.lastMessage = `File: ${file.name}`;
    
    await chat.save();

    console.log('File message saved to chat');

    return NextResponse.json({
      success: true,
      message: 'File uploaded and analyzed successfully',
      file: {
        url: cloudinaryResult.secure_url,
        name: file.name,
        type: file.type,
        size: file.size,
        analysis: aiAnalysis
      }
    });

  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json({
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
