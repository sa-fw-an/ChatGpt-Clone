// app/api/test-upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import cloudinary from '@/lib/cloudinary';
import { Readable } from 'stream';

// Helper function to convert buffer to stream
function bufferToStream(buffer: Buffer) {
  const readable = new Readable();
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);
  return readable;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Upload to Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id: `test-uploads/${uuid()}`,
          use_filename: true,
          unique_filename: true,
          folder: 'test-uploads'
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error('Upload failed'));
          } else {
            resolve(result);
          }
        }
      );
      bufferToStream(buffer).pipe(stream);
    });

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileUrl: uploadResult.secure_url,
      message: 'Test upload successful!'
    });

  } catch (error) {
    console.error('Test upload error:', error);
    return NextResponse.json({
      error: 'Upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Test upload endpoint is working',
    timestamp: new Date().toISOString()
  });
}
