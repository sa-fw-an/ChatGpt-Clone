// app/api/process-file/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import cloudinary from '@/lib/cloudinary';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const extractText = formData.get('extractText')?.toString() === 'true';
    const analyzeContent = formData.get('analyzeContent')?.toString() === 'true';
    const prompt = formData.get('prompt')?.toString();

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    const maxSize = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 100 * 1024 * 1024; // 10MB for images, 100MB for documents
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: `File too large. Maximum size is ${file.type.startsWith('image/') ? '10MB for images' : '100MB for documents'}.` 
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
          public_id: `temp_${Date.now()}_${file.name.replace(/\.[^/.]+$/, "")}`,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    const cloudinaryResult = uploadResult as any;

    let extractedText = '';
    let aiAnalysis = '';

    // Extract text from file if requested and it's a document
    if (extractText && !file.type.startsWith('image/')) {
      try {
        const fileName = file.name.toLowerCase();
        const fileExtension = fileName.split('.').pop();
        
        // Handle text-based files
        if (
          file.type === 'text/plain' || 
          file.type.startsWith('text/') ||
          ['.txt', '.md', '.markdown', '.csv', '.html', '.css', '.js', '.ts', '.jsx', '.tsx', 
           '.py', '.java', '.c', '.cpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift',
           '.xml', '.yaml', '.yml', '.tex'].includes(`.${fileExtension}`)
        ) {
          extractedText = buffer.toString('utf-8');
        } 
        // Handle JSON files
        else if (file.type === 'application/json' || fileName.endsWith('.json')) {
          const jsonContent = buffer.toString('utf-8');
          try {
            const parsed = JSON.parse(jsonContent);
            extractedText = `JSON Content:\n${JSON.stringify(parsed, null, 2)}`;
          } catch {
            extractedText = jsonContent;
          }
        }
        // Handle RTF files (basic text extraction)
        else if (file.type === 'application/rtf' || fileName.endsWith('.rtf')) {
          const rtfContent = buffer.toString('utf-8');
          // Basic RTF text extraction (remove RTF formatting)
          extractedText = rtfContent
            .replace(/\\[a-z]+\d*\s?/g, ' ') // Remove RTF commands
            .replace(/[{}]/g, '') // Remove braces
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        }
        // Handle other document types (PDF, Office docs, etc.)
        else if (
          file.type === 'application/pdf' ||
          file.type.includes('msword') ||
          file.type.includes('officedocument') ||
          file.type.includes('spreadsheet') ||
          file.type.includes('presentation')
        ) {
          const fileSizeMB = Math.round(file.size / 1024 / 1024 * 100) / 100;
          if (file.type === 'application/pdf') {
            try {
              const pdfData = await pdfParse(buffer);
              
              if (pdfData.text && pdfData.text.trim().length > 0) {
                extractedText = pdfData.text.trim();
              } else {
                extractedText = `PDF Document: ${file.name} (${fileSizeMB} MB)\n\nThis PDF document was uploaded successfully, but no readable text content was found. This could be because the PDF contains only images, is password protected, or uses a format that cannot be parsed for text.`;
              }
            } catch (error) {
              if (error instanceof Error) {
                // Log error details only in development
                if (process.env.NODE_ENV === 'development') {
                  console.error('PDF parsing error:', error);
                  console.error('Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                  });
                }
              }
              extractedText = `PDF Document: ${file.name} (${fileSizeMB} MB)\n\nThis PDF document was uploaded successfully. However, there was an issue extracting the text content. The file may be password protected, corrupted, or contain primarily non-text content.`;
            }
          } else {
            extractedText = `Document: ${file.name} (${file.type}, ${fileSizeMB} MB)\n\nThis is a ${fileExtension?.toUpperCase()} document that has been uploaded. While I cannot directly read the internal content of this file format, I can help you with questions about it, provide information about the file type, or assist with related tasks. Please feel free to ask specific questions about this document or describe what you need help with.`;
          }
        }
        // Handle archive files
        else if (
          file.type.includes('zip') ||
          file.type.includes('rar') ||
          file.type.includes('7z') ||
          ['.zip', '.rar', '.7z'].includes(`.${fileExtension}`)
        ) {
          extractedText = `Archive: ${file.name} (${file.type})\n\nThis is a compressed archive file. Content analysis is limited to file metadata.`;
        }
        // Handle other binary files
        else {
          extractedText = `File: ${file.name} (${file.type})\n\nThis is a binary file. Content analysis may be limited.`;
        }
      } catch (error) {
        console.log('Could not extract text, using filename');
        extractedText = `Document: ${file.name} (${file.type})`;
      }
    }

    // Analyze with AI if requested
    if (analyzeContent || prompt) {
      try {
        let analysisPrompt = '';
        
        if (file.type.startsWith('image/')) {
          analysisPrompt = prompt || 'Please analyze this image and describe what you see in detail.';
          
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: analysisPrompt },
                  { type: "image_url", image_url: { url: cloudinaryResult.secure_url } }
                ]
              }
            ],
            max_tokens: 300
          });
          
          aiAnalysis = response.choices[0]?.message?.content || 'Analysis not available';
        } else if (extractedText && extractedText.length > 10) {
          const fileExtension = file.name.toLowerCase().split('.').pop();
          let fileTypeDescription = 'file';
          
          // Provide specific analysis based on file type
          if (['md', 'markdown'].includes(fileExtension || '')) {
            fileTypeDescription = 'Markdown document';
          } else if (['json'].includes(fileExtension || '')) {
            fileTypeDescription = 'JSON data file';
          } else if (['py', 'js', 'ts', 'java', 'c', 'cpp', 'cs'].includes(fileExtension || '')) {
            fileTypeDescription = 'source code file';
          } else if (['csv'].includes(fileExtension || '')) {
            fileTypeDescription = 'CSV data file';
          } else if (['html', 'css'].includes(fileExtension || '')) {
            fileTypeDescription = 'web development file';
          } else if (['txt'].includes(fileExtension || '')) {
            fileTypeDescription = 'text document';
          } else if (file.type.includes('pdf')) {
            fileTypeDescription = 'PDF document';
          } else if (file.type.includes('word') || file.type.includes('document')) {
            fileTypeDescription = 'Word document';
          } else if (file.type.includes('spreadsheet')) {
            fileTypeDescription = 'spreadsheet file';
          } else if (file.type.includes('presentation')) {
            fileTypeDescription = 'presentation file';
          }
          
          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are a helpful assistant that analyzes uploaded files. You are analyzing a ${fileTypeDescription}. Provide a brief, useful summary of the file content.`
              },
              {
                role: "user",
                content: `Please analyze this ${fileTypeDescription} and provide a brief summary:\n\nFile: ${file.name}\nContent: ${extractedText.substring(0, 4000)}`
              }
            ],
            max_tokens: 300
          });
          
          aiAnalysis = response.choices[0]?.message?.content || 'Analysis not available';
        } else {
          const fileExtension = file.name.toLowerCase().split('.').pop();
          if (file.type.includes('pdf')) {
            aiAnalysis = `I've received your PDF document "${file.name}" (${Math.round(file.size / 1024 / 1024 * 100) / 100} MB). This appears to be a substantial document that could contain various types of content such as text, images, charts, or forms.

While I cannot directly extract the text content from PDFs, I can help you with:
• Questions about organizing or categorizing this document
• Suggestions for document management
• Information about PDF features and formats
• General guidance based on the document name and context
• Help with tasks related to this document

What specific information do you need about this PDF, or how can I assist you with it?`;
          } else if (file.type.includes('word') || file.type.includes('document')) {
            aiAnalysis = `Word document "${file.name}" uploaded successfully. This appears to be a Microsoft Word document. You can ask me questions about its content.`;
          } else if (file.type.includes('spreadsheet')) {
            aiAnalysis = `Spreadsheet "${file.name}" uploaded successfully. This appears to be an Excel or similar spreadsheet file. You can ask me questions about the data.`;
          } else if (file.type.includes('presentation')) {
            aiAnalysis = `Presentation "${file.name}" uploaded successfully. This appears to be a PowerPoint or similar presentation file. You can ask me questions about its content.`;
          } else if (file.type.includes('zip') || file.type.includes('rar') || file.type.includes('7z')) {
            aiAnalysis = `Archive "${file.name}" uploaded successfully. This is a compressed archive file. I can provide information about the file metadata.`;
          } else {
            aiAnalysis = `File "${file.name}" uploaded successfully. This is a ${fileExtension?.toUpperCase()} file. You can ask me questions about it.`;
          }
        }
      } catch (error) {
        console.error('AI analysis error:', error);
        aiAnalysis = 'AI analysis temporarily unavailable';
      }
    }

    console.log('File processing completed');

    return NextResponse.json({
      success: true,
      url: cloudinaryResult.secure_url,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      extractedText: extractedText,
      analysis: aiAnalysis,
      cloudinaryId: cloudinaryResult.public_id
    });

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('File processing error:', error);
    }
    return NextResponse.json({
      error: 'Processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
