// app/api/image-process/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Readable } from 'stream';
import { v4 as uuid } from 'uuid';
import cloudinary from '@/lib/cloudinary';
import OpenAI from 'openai';
import Chat from '@/models/Chats';
import mongoose from 'mongoose';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function bufferToStream(buffer: Buffer) {
  const readable = new Readable();
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);
  return readable;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const chatId = formData.get('chatId')?.toString();
    const prompt = formData.get('prompt')?.toString() || 'Please analyze this image and describe what you see.';

    if (!file || !chatId) {
      return NextResponse.json({ 
        error: 'Missing required fields: file and chatId are required' 
      }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ 
        error: 'Invalid file type. Only images are supported.' 
      }, { status: 400 });
    }

    // Validate file size (10MB limit for images)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'Image too large. Maximum size is 10MB.' 
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = new Date();

    // Upload to Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          public_id: `chat-images/${uuid()}`,
          use_filename: true,
          unique_filename: true,
          folder: 'chat-images'
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error('Image upload failed'));
          } else {
            resolve(result);
          }
        }
      );
      bufferToStream(buffer).pipe(stream);
    });

    const fileUrl = uploadResult.secure_url;

    // Analyze with GPT-4o Vision
    const gptResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: fileUrl },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    const visionOutput = gptResponse.choices?.[0]?.message?.content || 'No response from GPT Vision.';

    // Save both user prompt + image, and AI response to chat.messages
    await mongoose.connect(process.env.MONGODB_URI!);
    const chat = await Chat.findOne({ _id: chatId, userId });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found or unauthorized' }, { status: 404 });
    }

    const imageMessage = {
      id: new mongoose.Types.ObjectId().toString(),
      type: 'file',
      role: 'user' as const,
      timestamp,
      file: {
        url: fileUrl,
        name: file.name,
        fileType: file.type,
        size: file.size,
      },
      content: prompt,
    };

    const assistantMessage = {
      id: new mongoose.Types.ObjectId().toString(),
      type: 'text',
      role: 'assistant' as const,
      timestamp,
      content: visionOutput,
    };

    chat.messages.push(imageMessage, assistantMessage);
    chat.updatedAt = timestamp;
    chat.lastMessage = visionOutput.substring(0, 100) + (visionOutput.length > 100 ? '...' : '');

    await chat.save();

    return NextResponse.json({ 
      success: true,
      message: visionOutput, 
      fileUrl,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });
  } catch (error) {
    console.error('Image processing error:', error);
    return NextResponse.json({
      error: 'Image processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Export GET method to prevent 405 errors
export async function GET() {
  return NextResponse.json({
    message: 'Image processing endpoint is working',
    supportedTypes: ['jpg', 'png', 'gif', 'webp'],
    maxSize: '10MB'
  });
}
