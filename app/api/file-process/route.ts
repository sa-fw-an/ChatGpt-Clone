// app/api/file-process/route.ts - UNIFIED FILE PROCESSING ENDPOINT
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import cloudinary from '@/lib/cloudinary';
import OpenAI from 'openai';
import pdfParse from 'pdf-parse';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Lightweight file processing without heavy dependencies
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

    console.log(`Processing file: ${file.name}, type: ${file.type}, size: ${file.size}`);

    // Validate file size
    const maxSize = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: `File too large. Maximum size is ${file.type.startsWith('image/') ? '10MB for images' : '50MB for documents'}.` 
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Check Cloudinary configuration and upload
    let cloudinaryResult: any = null;
    let imageUrl: string = '';
    
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      console.log('Uploading to Cloudinary...');
      
      try {
        // Upload to Cloudinary with better error handling
        const uploadResult = await new Promise((resolve, reject) => {
          const resourceType = file.type.startsWith('image/') ? 'image' : 'raw';
          
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: resourceType,
              folder: 'chat-files',
              public_id: `upload_${Date.now()}_${file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, '_')}`,
              quality: file.type.startsWith('image/') ? 'auto:good' : undefined,
              fetch_format: file.type.startsWith('image/') ? 'auto' : undefined,
            },
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload error:', error);
                reject(error);
              } else {
                console.log('Cloudinary upload successful:', result?.secure_url);
                resolve(result);
              }
            }
          );
          
          uploadStream.end(buffer);
        });
        
        cloudinaryResult = uploadResult as any;
        imageUrl = cloudinaryResult.secure_url;
        
      } catch (error) {
        console.error('Cloudinary upload failed, using fallback for images:', error);
        
        // For images, create a base64 data URL as fallback
        if (file.type.startsWith('image/')) {
          const base64 = buffer.toString('base64');
          imageUrl = `data:${file.type};base64,${base64}`;
          console.log('Created base64 data URL for image analysis');
        }
      }
    } else {
      console.log('Cloudinary not configured, using fallback methods...');
      
      // For images, create a base64 data URL as fallback
      if (file.type.startsWith('image/')) {
        const base64 = buffer.toString('base64');
        imageUrl = `data:${file.type};base64,${base64}`;
        console.log('Created base64 data URL for image analysis (no Cloudinary)');
      }
    }
    let extractedText = '';
    let aiAnalysis = '';

    // Enhanced text extraction with PDF parsing and context storage
    if (extractText && !file.type.startsWith('image/')) {
      console.log('Extracting text from non-image file...');
      try {
        if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
          extractedText = buffer.toString('utf-8');
        } 
        else if (file.type === 'application/json' || file.name.endsWith('.json')) {
          const jsonContent = buffer.toString('utf-8');
          try {
            const parsed = JSON.parse(jsonContent);
            extractedText = `JSON Content:\n${JSON.stringify(parsed, null, 2)}`;
          } catch {
            extractedText = jsonContent;
          }
        }
        else if (file.type === 'application/pdf') {
          console.log('Processing PDF file:', file.name);
          try {
            const pdfData = await pdfParse(buffer);
            if (pdfData.text && pdfData.text.trim().length > 0) {
              // Clean and structure the extracted PDF text
              const cleanedText = pdfData.text
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
              
              // Store structured PDF content with metadata
              extractedText = `[PDF Document: ${file.name}]
Pages: ${pdfData.numpages || 'Unknown'}
File Size: ${Math.round(file.size / 1024 / 1024 * 100) / 100} MB
Text Length: ${cleanedText.length} characters

CONTENT:
${cleanedText}

[End of PDF Document]`;
              
              console.log(`PDF text extracted successfully: ${cleanedText.length} characters from ${pdfData.numpages || 'unknown'} pages`);
            } else {
              extractedText = `[PDF Document: ${file.name}]
Status: No readable text content found
Possible reasons: Image-only PDF, password protection, or unsupported format
File Size: ${Math.round(file.size / 1024 / 1024 * 100) / 100} MB

Note: This PDF was uploaded successfully but cannot be processed for text extraction. You can still ask questions about the document type or upload requirements.`;
            }
          } catch (error) {
            console.error('PDF parsing error:', error);
            extractedText = `[PDF Document: ${file.name}]
Status: Text extraction failed
Error: ${error instanceof Error ? error.message : 'Unknown parsing error'}
File Size: ${Math.round(file.size / 1024 / 1024 * 100) / 100} MB

Note: This PDF was uploaded but could not be processed. The file may be corrupted, password protected, or in an unsupported format.`;
          }
        }
        else if (file.type.includes('text/') || 
                 file.name.endsWith('.md') || 
                 file.name.endsWith('.markdown') ||
                 file.name.endsWith('.csv') ||
                 file.name.endsWith('.html') ||
                 file.name.endsWith('.css') ||
                 file.name.endsWith('.js') ||
                 file.name.endsWith('.ts') ||
                 file.name.endsWith('.py') ||
                 file.name.endsWith('.java') ||
                 file.name.endsWith('.xml') ||
                 file.name.endsWith('.yaml') ||
                 file.name.endsWith('.yml')) {
          extractedText = buffer.toString('utf-8');
        }
        else {
          // For other file types, provide basic info
          const fileSizeMB = Math.round(file.size / 1024 / 1024 * 100) / 100;
          extractedText = `Document: ${file.name} (${file.type}, ${fileSizeMB} MB)\n\nThis file has been uploaded successfully. While I cannot extract the full content from this file format, I can help you with questions about it or provide information about the file type.`;
        }
      } catch (error) {
        console.error('Text extraction error:', error);
        extractedText = `Document: ${file.name}\n\nFile uploaded successfully, but text extraction failed.`;
      }
    }

    // AI Analysis for images or text content
    if (analyzeContent || prompt) {
      console.log('Starting AI analysis...');
      try {
        if (file.type.startsWith('image/')) {
          console.log('Analyzing image with GPT-4 Vision...');
          
          // Check OpenAI API key
          if (!process.env.OPENAI_API_KEY) {
            console.error('OpenAI API key not configured');
            aiAnalysis = 'Image analysis not available: API key not configured';
          } else if (!imageUrl) {
            console.error('Image URL not available for analysis');
            aiAnalysis = 'Image analysis not available: Image upload failed';
          } else {
            // Image analysis with GPT-4 Vision
            console.log('Using image URL for analysis:', imageUrl.substring(0, 100) + '...');
            
            const analysisPrompt = prompt || 'Please analyze this image in detail. Describe what you see, including any text, objects, people, colors, composition, and context. Be thorough and specific.';
            
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: analysisPrompt },
                    { 
                      type: "image_url", 
                      image_url: { 
                        url: imageUrl,
                        detail: "high"
                      } 
                    }
                  ]
                }
              ],
              max_tokens: 1000,
              temperature: 0.7
            });
            
            aiAnalysis = response.choices[0]?.message?.content || 'Image analysis not available';
            console.log('Image analysis completed successfully');
          }
        } else if (extractedText && extractedText.length > 10) {
          console.log('Analyzing text content...');
          // Text/Document analysis with extracted content
          const fileExtension = file.name.toLowerCase().split('.').pop();
          let fileTypeDescription = 'document';
          
          if (file.type === 'application/pdf') {
            fileTypeDescription = 'PDF document';
          } else if (['md', 'markdown'].includes(fileExtension || '')) {
            fileTypeDescription = 'Markdown document';
          } else if (['json'].includes(fileExtension || '')) {
            fileTypeDescription = 'JSON data file';
          } else if (['py', 'js', 'ts', 'java', 'c', 'cpp'].includes(fileExtension || '')) {
            fileTypeDescription = 'source code file';
          } else if (['csv'].includes(fileExtension || '')) {
            fileTypeDescription = 'CSV data file';
          } else if (['txt'].includes(fileExtension || '')) {
            fileTypeDescription = 'text file';
          }

          const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are a helpful assistant that analyzes uploaded files. You are analyzing a ${fileTypeDescription}. Provide a brief, useful summary of the content that will help users understand what's in this file.`
              },
              {
                role: "user",
                content: `Please analyze this ${fileTypeDescription} and provide a brief summary:\n\nFile: ${file.name}\nContent: ${extractedText.substring(0, 4000)}${extractedText.length > 4000 ? '...(content truncated)' : ''}`
              }
            ],
            max_tokens: 500,
            temperature: 0.7
          });
          aiAnalysis = response.choices[0]?.message?.content || 'Analysis not available';
          console.log('Text analysis completed successfully');
        } else {
          // Fallback for files without extractable text
          const fileExtension = file.name.toLowerCase().split('.').pop();
          if (file.type === 'application/pdf') {
            aiAnalysis = `PDF document "${file.name}" uploaded successfully. The content is now available for questions and analysis. You can ask me about specific topics, request summaries, or get information from this document.`;
          } else if (file.type.startsWith('image/')) {
            aiAnalysis = `Image "${file.name}" uploaded successfully. You can ask me questions about what's in the image, and I'll analyze it for you.`;
          } else {
            aiAnalysis = `File "${file.name}" uploaded successfully. This is a ${fileExtension?.toUpperCase()} file. You can ask me questions about it.`;
          }
        }
      } catch (error) {
        console.error('AI analysis error:', error);
        if (error instanceof Error && error.message.includes('rate_limit')) {
          aiAnalysis = 'AI analysis temporarily unavailable due to rate limits. Please try again in a moment.';
        } else if (error instanceof Error && error.message.includes('insufficient_quota')) {
          aiAnalysis = 'AI analysis unavailable: OpenAI quota exceeded.';
        } else {
          aiAnalysis = `AI analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    } else {
      console.log('Skipping AI analysis (not requested)');
    }

    console.log('File processing completed successfully');
    
    const response = {
      success: true,
      url: imageUrl || cloudinaryResult?.secure_url || '',
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      extractedText: extractedText,
      analysis: aiAnalysis,
      cloudinaryId: cloudinaryResult?.public_id || null,
      // Enhanced metadata for context
      metadata: {
        processingDate: new Date().toISOString(),
        hasExtractedText: extractedText.length > 0,
        textLength: extractedText.length,
        isPDF: file.type === 'application/pdf',
        isImage: file.type.startsWith('image/'),
        contentPreview: extractedText.length > 0 ? extractedText.substring(0, 200) + '...' : null,
        cloudinaryUrl: cloudinaryResult?.secure_url || null,
        hasAnalysis: aiAnalysis.length > 0,
        usingFallback: !cloudinaryResult && file.type.startsWith('image/')
      }
    };

    console.log('Returning response:', {
      success: response.success,
      fileName: response.fileName,
      fileType: response.fileType,
      hasUrl: !!response.url,
      hasExtractedText: response.metadata.hasExtractedText,
      hasAnalysis: response.metadata.hasAnalysis,
      textLength: response.metadata.textLength
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('File processing error:', error);
    return NextResponse.json({
      error: 'Processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Export GET method to prevent 405 errors
export async function GET() {
  return NextResponse.json({
    message: 'File processing endpoint is working',
    supportedTypes: ['images', 'text files', 'documents'],
    maxSize: '50MB for documents, 10MB for images'
  });
}
