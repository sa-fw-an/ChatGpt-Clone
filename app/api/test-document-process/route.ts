// app/api/test-document-process/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import cloudinary from '@/lib/cloudinary';
import OpenAI from 'openai';
import { Readable } from 'stream';

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Step 1: Upload to Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id: `document-test/${uuid()}`,
          use_filename: true,
          unique_filename: true,
          folder: 'document-test'
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

    // Step 2: Extract text from the document
    let extractedText = '';
    let textExtractionError = null;
    
    try {
      extractedText = await extractTextFromFile(buffer, file.type, file.name);
    } catch (error) {
      textExtractionError = error instanceof Error ? error.message : 'Unknown error';
    }

    // Step 3: Analyze the content with OpenAI (if text was extracted)
    let aiAnalysis = null;
    let aiError = null;
    
    if (extractedText.trim()) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that analyzes document content and provides concise summaries and key insights.'
            },
            {
              role: 'user',
              content: `Please analyze this document content and provide:
1. A brief summary (2-3 sentences)
2. Key topics or themes
3. Important information

Document content:
${extractedText.substring(0, 3000)}${extractedText.length > 3000 ? '...(content truncated)' : ''}`
            }
          ],
          max_tokens: 500,
          temperature: 0.3
        });

        aiAnalysis = completion.choices[0]?.message?.content || 'No analysis available.';
      } catch (error) {
        aiError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return NextResponse.json({
      success: true,
      upload: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileUrl: uploadResult.secure_url
      },
      textExtraction: {
        success: !textExtractionError,
        extractedText: extractedText || null,
        error: textExtractionError,
        textLength: extractedText.length
      },
      aiAnalysis: {
        success: !aiError,
        analysis: aiAnalysis,
        error: aiError
      },
      workflow: {
        uploadSuccess: true,
        textExtractionSuccess: !textExtractionError,
        aiAnalysisSuccess: !aiError
      }
    });

  } catch (error) {
    console.error('Document processing test error:', error);
    return NextResponse.json({
      error: 'Document processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Document processing test endpoint is working',
    supportedTypes: [
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/json'
    ],
    timestamp: new Date().toISOString()
  });
}
