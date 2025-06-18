// app/api/chat/route.ts - Vercel AI SDK Chat Endpoint
import { openai } from '@ai-sdk/openai';
import { streamText, convertToCoreMessages } from 'ai';
import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { ContextWindowManager } from '@/lib/context-window';
import { EnhancedMemoryService } from '@/lib/enhanced-memory';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { messages, chatId, fileData, model = 'gpt-4o', relevantMemories = [] } = body;

    if (!messages || !chatId) {
      return new Response('Messages and chatId are required', { status: 400 });
    }

    if (!ObjectId.isValid(chatId)) {
      return new Response('Invalid chat ID', { status: 400 });
    }

    // Get chat history from database
    const client = await clientPromise;
    const db = client.db('chatgpt-clone');
    
    const chat = await db.collection('chats').findOne({ 
      _id: new ObjectId(chatId), 
      userId 
    });

    if (!chat) {
      return new Response('Chat not found or unauthorized', { status: 404 });
    }

    // Initialize context window manager
    const contextManager = new ContextWindowManager(model);
    
    // Get relevant memories if user message exists  
    let contextMemories: any[] = [];
    const currentUserMessage = messages[messages.length - 1];
    if (currentUserMessage?.role === 'user' && currentUserMessage.content) {
      try {
        // Use the memory service directly
        const memoryService = new EnhancedMemoryService();
        contextMemories = await memoryService.searchMemories(
          currentUserMessage.content,
          { userId, sessionId: `chat_${chatId}` },
          3
        );
      } catch (error) {
        console.warn('Memory search failed, continuing without memories:', error);
        contextMemories = []; // Continue with empty memories instead of failing
      }
    }
    
    // Enhanced system prompt for document analysis with memory context
    let systemPrompt = `You are an advanced AI assistant specialized in document analysis and contextual conversations. Your capabilities include:

DOCUMENT PROCESSING:
- When users upload PDF files, you receive the complete extracted text content
- You can analyze text files, JSON data, CSV files, code files, and other text-based documents
- You have access to the full content of uploaded documents for accurate analysis`;

    // Add memory context if available
    if (contextMemories.length > 0) {
      systemPrompt += `

RELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS:
${contextMemories.map((memory, idx) => 
  `${idx + 1}. ${memory.content} (Relevance: ${memory.relevanceScore?.toFixed(2) || 'N/A'})`
).join('\n')}

Please use this context to provide more personalized and relevant responses, but prioritize the current conversation and any uploaded documents.`;
    }

    systemPrompt += `

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

Always prioritize document content over general knowledge when the user asks about uploaded materials.`;

    // Get recent chat history
    const recentMessages = (chat.messages || []).slice(-20); // Get last 20 messages for context
    
    // Prepare messages with context window management and image handling
    const currentMessage = messages[messages.length - 1]?.content || '';
    
    let processedMessages;
    
    // Special handling for image files - include image in the current message
    if (fileData && fileData.metadata?.isImage && fileData.url) {
      console.log('Processing image message with GPT Vision, URL type:', fileData.url.startsWith('data:') ? 'base64' : 'external');
      
      // For images, we need to modify the current message to include the image
      const imageMessage = {
        role: 'user',
        content: [
          { type: 'text', text: currentMessage || 'Please analyze this image.' },
          { 
            type: 'image_url', 
            image_url: { 
              url: fileData.url,
              detail: 'high'
            } 
          }
        ]
      };
      
      // Prepare messages without the file context for images (since we're including the image directly)
      processedMessages = contextManager.prepareMessages(
        recentMessages,
        systemPrompt + '\n\nThe user has uploaded an image. Please analyze it thoroughly and provide detailed insights.',
        null, // Don't pass fileData to avoid text-based processing
        '' // Don't pass current message since we're handling it specially
      );
      
      // Add the image message at the end
      processedMessages.push(imageMessage);
      
    } else {
      // Regular text/document processing
      processedMessages = contextManager.prepareMessages(
        recentMessages,
        systemPrompt,
        fileData,
        currentMessage
      );
    }

    console.log('Prepared messages for AI:', {
      messageCount: processedMessages.length,
      hasImageContent: processedMessages.some((msg: any) => 
        Array.isArray(msg.content) && msg.content.some((c: any) => c.type === 'image_url')
      ),
      lastMessageType: Array.isArray(processedMessages[processedMessages.length - 1]?.content) ? 'multimodal' : 'text'
    });

    // Check if we have multimodal content
    const hasMultimodalContent = processedMessages.some((msg: any) => Array.isArray(msg.content));
    
    if (hasMultimodalContent) {
      console.log('Using OpenAI SDK directly for multimodal content');
      
      // Use OpenAI SDK directly for multimodal content
      const openaiClient = new (await import('openai')).default({
        apiKey: process.env.OPENAI_API_KEY!
      });
      
      const completion = await openaiClient.chat.completions.create({
        model: model,
        messages: processedMessages,
        max_tokens: 4000,
        temperature: 0.7,
        stream: true
      });
      
      // Create a streaming response compatible with Vercel AI SDK format
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let assistantMessage = '';
            
            for await (const chunk of completion) {
              const content = chunk.choices[0]?.delta?.content || '';
              if (content) {
                assistantMessage += content;
                
                // Send the chunk in proper Vercel AI SDK format
                const chunkData = `0:${JSON.stringify(content)}\n`;
                controller.enqueue(encoder.encode(chunkData));
              }
            }
            
            // Send finish message
            const finishData = `d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`;
            controller.enqueue(encoder.encode(finishData));
            
            // Save to database after completion
            try {
              const client = await clientPromise;
              const db = client.db('chatgpt-clone');
              const messagesToSave = [];
              
              // Add file message if present
              if (fileData) {
                const fileMessage = {
                  id: new ObjectId().toString(),
                  content: fileData.metadata?.isImage 
                    ? `Uploaded image: ${fileData.fileName}${fileData.analysis ? ` - ${fileData.analysis.substring(0, 100)}...` : ''}`
                    : `Uploaded file: ${fileData.fileName}`,
                  role: 'user',
                  timestamp: new Date(),
                  type: 'file',
                  file: {
                    url: fileData.url,
                    name: fileData.fileName,
                    fileType: fileData.fileType,
                    size: fileData.fileSize,
                    extractedText: fileData.extractedText || '',
                    analysis: fileData.analysis || '',
                    metadata: {
                      hasText: fileData.extractedText && fileData.extractedText.length > 0,
                      textLength: fileData.extractedText ? fileData.extractedText.length : 0,
                      isPDF: fileData.fileType === 'application/pdf',
                      isImage: fileData.metadata?.isImage || fileData.fileType.startsWith('image/'),
                      hasAnalysis: fileData.analysis && fileData.analysis.length > 0,
                      processingDate: new Date(),
                      cloudinaryId: fileData.cloudinaryId,
                      cloudinaryUrl: fileData.url,
                      contentPreview: fileData.extractedText && fileData.extractedText.length > 0 
                        ? fileData.extractedText.substring(0, 500) + (fileData.extractedText.length > 500 ? '...' : '')
                        : fileData.analysis && fileData.analysis.length > 0
                          ? fileData.analysis.substring(0, 200) + (fileData.analysis.length > 200 ? '...' : '')
                          : null
                    }
                  }
                };
                messagesToSave.push(fileMessage);
              }
              
              // Add user message
              const currentMessage = messages[messages.length - 1]?.content || '';
              const userMessage = {
                id: new ObjectId().toString(),
                content: currentMessage,
                role: 'user',
                timestamp: new Date(),
              };
              messagesToSave.push(userMessage);

              // Add assistant message
              const assistantMessageObj = {
                id: new ObjectId().toString(),
                content: assistantMessage,
                role: 'assistant',
                timestamp: new Date(),
              };
              messagesToSave.push(assistantMessageObj);

              // Update chat in database
              await db.collection('chats').updateOne(
                { _id: new ObjectId(chatId), userId },
                { 
                  $push: { messages: { $each: messagesToSave } },
                  $set: { 
                    lastMessage: assistantMessage.substring(0, 100),
                    timestamp: new Date(),
                  }
                }
              );
              
            } catch (dbError) {
              console.error('Database save error:', dbError);
            }
            
            controller.close();
            
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Vercel-AI-Data-Stream': 'v1'
        }
      });
      
    } else {
      console.log('Using Vercel AI SDK for text-only content');
      
      // Convert to core messages format for text-only content
      const coreMessages = convertToCoreMessages(processedMessages);
      
      // Use Vercel AI SDK for text-only content
      const result = await streamText({
        model: openai(model),
        messages: coreMessages,
        maxTokens: 4000,
        temperature: 0.7,
        onFinish: async (completion) => {
          try {
            // Save the conversation to database
            const messagesToSave = [];
            
            // Add file message if present
            if (fileData) {
              const fileMessage = {
                id: new ObjectId().toString(),
                content: fileData.metadata?.isImage 
                  ? `Uploaded image: ${fileData.fileName}${fileData.analysis ? ` - ${fileData.analysis.substring(0, 100)}...` : ''}`
                  : `Uploaded file: ${fileData.fileName}`,
                role: 'user',
                timestamp: new Date(),
                type: 'file',
                file: {
                  url: fileData.url,
                  name: fileData.fileName,
                  fileType: fileData.fileType,
                  size: fileData.fileSize,
                  extractedText: fileData.extractedText || '',
                  analysis: fileData.analysis || '',
                  metadata: {
                    hasText: fileData.extractedText && fileData.extractedText.length > 0,
                    textLength: fileData.extractedText ? fileData.extractedText.length : 0,
                    isPDF: fileData.fileType === 'application/pdf',
                    isImage: fileData.metadata?.isImage || fileData.fileType.startsWith('image/'),
                    hasAnalysis: fileData.analysis && fileData.analysis.length > 0,
                    processingDate: new Date(),
                    cloudinaryId: fileData.cloudinaryId,
                    cloudinaryUrl: fileData.url,
                    contentPreview: fileData.extractedText && fileData.extractedText.length > 0 
                      ? fileData.extractedText.substring(0, 500) + (fileData.extractedText.length > 500 ? '...' : '')
                      : fileData.analysis && fileData.analysis.length > 0
                        ? fileData.analysis.substring(0, 200) + (fileData.analysis.length > 200 ? '...' : '')
                        : null
                  }
                }
              };
              messagesToSave.push(fileMessage);
            }
            
            // Add user message
            const currentMessage = messages[messages.length - 1]?.content || '';
            const userMessage = {
              id: new ObjectId().toString(),
              content: currentMessage,
              role: 'user',
              timestamp: new Date(),
            };
            messagesToSave.push(userMessage);

            // Add assistant message
            const assistantMessage = {
              id: new ObjectId().toString(),
              content: completion.text,
              role: 'assistant',
              timestamp: new Date(),
            };
            messagesToSave.push(assistantMessage);

            // Update chat in database
            await db.collection('chats').updateOne(
              { _id: new ObjectId(chatId), userId },
              { 
                $push: { messages: { $each: messagesToSave } },
                $set: { 
                  lastMessage: completion.text.substring(0, 100),
                  timestamp: new Date(),
                  messageCount: (chat.messageCount || 0) + messagesToSave.length
                }
              }
            );
          } catch (dbError) {
            console.error('Database save error:', dbError);
            // Don't fail the response if database save fails
          }
        }
      });

      return result.toDataStreamResponse();
    }

  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function GET() {
  return new Response(
    JSON.stringify({
      message: 'Vercel AI SDK Chat endpoint is working',
      supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      features: ['streaming', 'context-window-management', 'file-analysis']
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
