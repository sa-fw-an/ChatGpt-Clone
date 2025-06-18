// app/api/test-ai/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that analyzes text content and provides brief summaries.'
        },
        {
          role: 'user',
          content: `Please provide a brief summary of this text: ${text}`
        }
      ],
      max_tokens: 200,
      temperature: 0.3
    });

    const analysis = completion.choices[0]?.message?.content || 'No analysis available.';

    return NextResponse.json({
      success: true,
      originalText: text,
      analysis: analysis,
      tokensUsed: completion.usage?.total_tokens || 0
    });

  } catch (error) {
    console.error('AI test error:', error);
    return NextResponse.json({
      error: 'AI processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'AI test endpoint is working',
    openaiConfigured: !!process.env.OPENAI_API_KEY
  });
}
