// app/api/upload-debug/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(req: NextRequest) {
  try {
    console.log('Upload debug endpoint called');
    
    const { userId } = await auth();
    console.log('User ID:', userId);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const chatId = formData.get('chatId')?.toString();

    console.log('File:', file?.name, 'Chat ID:', chatId);

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Debug upload successful',
      fileName: file.name,
      fileSize: file.size,
      chatId: chatId
    });

  } catch (error) {
    console.error('Upload debug error:', error);
    return NextResponse.json({
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
