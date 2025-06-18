// app/api/upload-test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { v4 as uuid } from 'uuid';
import cloudinary from '@/lib/cloudinary';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Helper function to convert buffer to stream
function bufferToStream(buffer: Buffer) {
  const readable = new Readable();
  readable._read = () => {};
  readable.push(buffer);
  readable.push(null);
  return readable;
}

// Helper function to extract text from different file types
async function extractTextFromFile(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  try {
    // Dynamic imports to avoid build-time issues
    switch (mimeType) {
      case 'application/pdf':
        try {
          const pdf = await import('pdf-parse');
          // More robust PDF parsing with error handling
          const pdfData = await pdf.default(buffer, {
            // Options to prevent file system access
            max: 0, // No page limit
            version: 'v1.10.100', // Specify version to avoid compatibility issues
          });
          return pdfData.text || 'No text content found in PDF';
        } catch (pdfError) {
          console.error('PDF parsing error:', pdfError);
          // Fallback: Try to extract text differently or return placeholder
          return `PDF processing failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}. File uploaded successfully but text extraction is not available.`;
        }
        
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const mammoth = await import('mammoth');
        const docxResult = await mammoth.extractRawText({ buffer });
        return docxResult.value;
        
      case 'text/plain':
        return buffer.toString('utf-8');
        
      case 'application/json':
        const jsonContent = JSON.parse(buffer.toString('utf-8'));
        return JSON.stringify(jsonContent, null, 2);
        
      default:
        // For unknown file types, try to read as text
        try {
          return buffer.toString('utf-8');
        } catch {
          throw new Error(`Unsupported file type: ${mimeType}`);
        }
    }
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw new Error(`Failed to extract text from ${fileName}: ${error}`);
  }
}

// Helper function to determine Cloudinary resource type
function getCloudinaryResourceType(mimeType: string): 'image' | 'video' | 'raw' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw'; // For documents and other files
}

// Helper function to analyze document content with OpenAI
async function analyzeDocumentContent(extractedText: string, fileName: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that analyzes document content and provides concise summaries and key insights. Focus on the main topics, important information, and actionable insights.'
        },
        {
          role: 'user',
          content: `Please analyze the following document content from "${fileName}" and provide:
1. A brief summary (2-3 sentences)
2. Key topics or themes
3. Important information or insights

Document content:
${extractedText.substring(0, 4000)}${extractedText.length > 4000 ? '...(content truncated)' : ''}`
        }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    return completion.choices[0]?.message?.content || 'Unable to analyze document content.';
  } catch (error) {
    console.error('Error analyzing document:', error);
    return 'Document uploaded successfully, but analysis failed.';
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const extractText = formData.get('extractText')?.toString() === 'true';
    const analyzeContent = formData.get('analyzeContent')?.toString() === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 50MB.' 
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = new Date();

    // Determine resource type for Cloudinary
    const resourceType = getCloudinaryResourceType(file.type);
    
    // Upload to Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: resourceType,
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

    const fileUrl = uploadResult.secure_url;
    let extractedText = '';
    let analysisResult = '';

    // Extract text if requested and file type supports it
    if (extractText && !file.type.startsWith('image/')) {
      try {
        extractedText = await extractTextFromFile(buffer, file.type, file.name);
        
        // Analyze content if requested
        if (analyzeContent && extractedText.trim()) {
          analysisResult = await analyzeDocumentContent(extractedText, file.name);
        }
      } catch (error) {
        console.error('Text extraction failed:', error);
        // Continue without text extraction
      }
    }

    // Return response
    return NextResponse.json({
      success: true,
      fileUrl,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      extractedText: extractedText || null,
      analysis: analysisResult || null,
      workflow: {
        uploadSuccess: true,
        textExtractionSuccess: !!extractedText,
        aiAnalysisSuccess: !!analysisResult
      }
    });

  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json({
      error: 'File upload failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Upload test endpoint is working',
    supportedTypes: [
      'text/plain',
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/json'
    ],
    features: ['file upload', 'text extraction', 'AI analysis'],
    timestamp: new Date().toISOString()
  });
}
