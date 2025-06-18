// app/api/models/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!
});

// Cache for models to avoid repeated API calls
let modelsCache: {
  data: any[];
  timestamp: number;
  expiresIn: number;
} | null = null;

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Model categories and metadata
const getModelMetadata = (modelId: string) => {
  const modelMap: Record<string, any> = {
    // GPT-4o family
    'gpt-4o': {
      name: 'GPT-4o',
      description: 'Most capable model with vision and advanced reasoning',
      category: 'premium',
      icon: 'sparkles',
      capabilities: ['text', 'vision', 'function_calling'],
      contextWindow: 128000,
      pricing: 'premium'
    },
    'gpt-4o-mini': {
      name: 'GPT-4o Mini',
      description: 'Faster and more affordable version of GPT-4o',
      category: 'standard',
      icon: 'zap',
      capabilities: ['text', 'vision', 'function_calling'],
      contextWindow: 128000,
      pricing: 'standard'
    },
    'gpt-4o-2024-11-20': {
      name: 'GPT-4o (Latest)',
      description: 'Latest GPT-4o with enhanced capabilities',
      category: 'premium',
      icon: 'sparkles',
      capabilities: ['text', 'vision', 'function_calling'],
      contextWindow: 128000,
      pricing: 'premium'
    },
    'gpt-4o-2024-08-06': {
      name: 'GPT-4o (Aug 2024)',
      description: 'GPT-4o August 2024 version',
      category: 'premium',
      icon: 'sparkles',
      capabilities: ['text', 'vision', 'function_calling'],
      contextWindow: 128000,
      pricing: 'premium'
    },
    'gpt-4o-mini-2024-07-18': {
      name: 'GPT-4o Mini (July 2024)',
      description: 'GPT-4o Mini July 2024 version',
      category: 'standard',
      icon: 'zap',
      capabilities: ['text', 'vision', 'function_calling'],
      contextWindow: 128000,
      pricing: 'standard'
    },
    
    // GPT-4 Turbo family
    'gpt-4-turbo': {
      name: 'GPT-4 Turbo',
      description: 'High performance model with large context window',
      category: 'premium',
      icon: 'cpu',
      capabilities: ['text', 'vision', 'function_calling'],
      contextWindow: 128000,
      pricing: 'premium'
    },
    'gpt-4-turbo-2024-04-09': {
      name: 'GPT-4 Turbo (April 2024)',
      description: 'GPT-4 Turbo April 2024 version',
      category: 'premium',
      icon: 'cpu',
      capabilities: ['text', 'vision', 'function_calling'],
      contextWindow: 128000,
      pricing: 'premium'
    },
    'gpt-4-turbo-preview': {
      name: 'GPT-4 Turbo Preview',
      description: 'Preview version of GPT-4 Turbo',
      category: 'premium',
      icon: 'cpu',
      capabilities: ['text', 'function_calling'],
      contextWindow: 128000,
      pricing: 'premium'
    },
    
    // GPT-4 family
    'gpt-4': {
      name: 'GPT-4',
      description: 'High-quality responses for complex tasks',
      category: 'premium',
      icon: 'brain',
      capabilities: ['text', 'function_calling'],
      contextWindow: 8192,
      pricing: 'premium'
    },
    'gpt-4-0613': {
      name: 'GPT-4 (June 2023)',
      description: 'GPT-4 June 2023 version',
      category: 'premium',
      icon: 'brain',
      capabilities: ['text', 'function_calling'],
      contextWindow: 8192,
      pricing: 'premium'
    },
    'gpt-4-32k': {
      name: 'GPT-4 32K',
      description: 'GPT-4 with extended context window',
      category: 'premium',
      icon: 'brain',
      capabilities: ['text', 'function_calling'],
      contextWindow: 32768,
      pricing: 'premium'
    },
    
    // GPT-3.5 Turbo family
    'gpt-3.5-turbo': {
      name: 'GPT-3.5 Turbo',
      description: 'Fast and efficient for everyday tasks',
      category: 'standard',
      icon: 'shell',
      capabilities: ['text', 'function_calling'],
      contextWindow: 16385,
      pricing: 'budget'
    },
    'gpt-3.5-turbo-16k': {
      name: 'GPT-3.5 Turbo 16K',
      description: 'GPT-3.5 Turbo with extended context',
      category: 'standard',
      icon: 'shell',
      capabilities: ['text', 'function_calling'],
      contextWindow: 16385,
      pricing: 'budget'
    },
    'gpt-3.5-turbo-1106': {
      name: 'GPT-3.5 Turbo (Nov 2023)',
      description: 'GPT-3.5 Turbo November 2023 version',
      category: 'standard',
      icon: 'shell',
      capabilities: ['text', 'function_calling'],
      contextWindow: 16385,
      pricing: 'budget'
    }
  };

  // Default metadata for unknown models
  const defaultMetadata = {
    name: modelId.toUpperCase(),
    description: 'OpenAI language model',
    category: 'standard',
    icon: 'bot',
    capabilities: ['text'],
    contextWindow: 4096,
    pricing: 'standard'
  };

  return modelMap[modelId] || defaultMetadata;
};

const fetchAvailableModels = async () => {
  try {
    // Check cache first
    if (modelsCache && Date.now() - modelsCache.timestamp < CACHE_DURATION) {
      console.log('Using cached models');
      return modelsCache.data;
    }

    console.log('Fetching fresh models from OpenAI API');
    const modelsResponse = await openai.models.list();
    
    // Filter for GPT models and sort by creation date (newest first)
    const availableModels = modelsResponse.data
      .filter(model => {
        const id = model.id.toLowerCase();
        return id.includes('gpt') && 
               !id.includes('instruct') && // Exclude instruct models
               !id.includes('davinci') &&  // Exclude legacy models
               !id.includes('babbage') &&
               !id.includes('curie') &&
               !id.includes('ada');
      })
      .sort((a, b) => b.created - a.created)
      .map(model => {
        const metadata = getModelMetadata(model.id);
        return {
          id: model.id,
          ...metadata,
          created: model.created,
          owned_by: model.owned_by
        };
      });

    // Cache the results
    modelsCache = {
      data: availableModels,
      timestamp: Date.now(),
      expiresIn: CACHE_DURATION
    };

    console.log(`Fetched ${availableModels.length} available models`);
    return availableModels;

  } catch (error) {
    console.error('Error fetching models from OpenAI:', error);
    
    // Return fallback models if API fails
    const fallbackModels = [
      {
        id: 'gpt-4o',
        ...getModelMetadata('gpt-4o')
      },
      {
        id: 'gpt-4o-mini',
        ...getModelMetadata('gpt-4o-mini')
      },
      {
        id: 'gpt-4-turbo',
        ...getModelMetadata('gpt-4-turbo')
      },
      {
        id: 'gpt-3.5-turbo',
        ...getModelMetadata('gpt-3.5-turbo')
      }
    ];
    
    return fallbackModels;
  }
};

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Models API called by user:', userId);
    const availableModels = await fetchAvailableModels();
    console.log(`Returning ${availableModels.length} models to client`);
    
    // Group models by category
    const modelsByCategory = {
      premium: availableModels.filter(m => m.category === 'premium'),
      standard: availableModels.filter(m => m.category === 'standard')
    };

    // Determine the best default model
    const defaultModel = availableModels.find(m => m.id === 'gpt-4o') || 
                        availableModels.find(m => m.id === 'gpt-4o-mini') ||
                        availableModels[0];

    return NextResponse.json({
      models: availableModels,
      modelsByCategory,
      currentModel: defaultModel?.id || 'gpt-4o',
      totalModels: availableModels.length,
      cacheInfo: {
        cached: modelsCache ? true : false,
        lastUpdate: modelsCache?.timestamp,
        expiresAt: modelsCache ? modelsCache.timestamp + CACHE_DURATION : null
      }
    });

  } catch (error) {
    console.error('Error in models endpoint:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
