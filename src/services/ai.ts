import OpenAI from 'openai';
import { config } from '../config/env.js';
import { 
  TokenData, 
  AIAnalysis, 
  AnalysisRequest, 
  AnalysisResponse,
  TimeFrame,
  PricePrediction
} from '../types/index.js';

export class AIService {
  private readonly openai: OpenAI;
  private readonly model = 'deepseek/deepseek-r1:nitro';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor() {
    if (!config.openRouterApiKey) {
      throw new Error('OpenRouter API key is required');
    }

    console.log('Initializing AI Service with OpenRouter...');
    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.openRouterApiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/deepcoin/bot',
        'X-Title': 'DeepCoin Bot'
      }
    });
    console.log('AI Service initialized successfully');
  }

  private async retry<T>(operation: () => Promise<T>, retries = this.maxRetries): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying operation, ${retries} attempts remaining...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.retry(operation, retries - 1);
      }
      throw error;
    }
  }

  async analyzeTrends(request: AnalysisRequest): Promise<AnalysisResponse> {
    console.log(`Starting trend analysis for ${request.data.length} tokens in ${request.timeframe} timeframe`);
    const prompt = this.buildAnalysisPrompt(request);
    
    try {
      return await this.retry(async () => {
        console.log('Sending analysis request to OpenRouter...');
        console.log(`Using model: ${this.model}`);
        
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a cryptocurrency trading expert specializing in technical analysis and price prediction. Respond only with valid JSON without any markdown formatting or special characters. Ensure all JSON properties are properly comma-separated.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        });

        console.log('Received response from OpenRouter');
        const response = completion.choices[0]?.message?.content;
        if (!response) {
          throw new Error('Empty response from AI');
        }

        console.log('Parsing analysis response...');
        const result = this.parseAnalysisResponse(response, request.timeframe);
        console.log(`Analysis complete. Selected ${result.selectedTokens.length} tokens`);
        return result;
      });
    } catch (error) {
      console.error('Error analyzing trends:', error);
      console.error('Request details:', {
        timeframe: request.timeframe,
        tokenCount: request.data.length,
        parameters: request.parameters
      });
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }

      // Return a default response when all retries fail
      return {
        selectedTokens: [],
        analysis: [],
        recommendations: ['Analysis failed due to technical issues. Please try again later.']
      };
    }
  }

  async predictPrices(token: TokenData, timeframe: TimeFrame): Promise<PricePrediction> {
    console.log(`Starting price prediction for token ${token.symbol} in ${timeframe} timeframe`);
    const prompt = this.buildPredictionPrompt(token, timeframe);
    
    try {
      return await this.retry(async () => {
        console.log('Sending prediction request to OpenRouter...');
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a cryptocurrency trading expert specializing in technical analysis and price prediction. Respond only with valid JSON without any markdown formatting or special characters. Ensure all JSON properties are properly comma-separated.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        });

        console.log('Received response from OpenRouter');
        const response = completion.choices[0]?.message?.content;
        if (!response) {
          throw new Error('Empty response from AI');
        }

        console.log('Parsing prediction response...');
        const result = this.parsePredictionResponse(response);
        console.log(`Prediction complete. Generated ${result.timepoints.length} prediction points`);
        return result;
      });
    } catch (error) {
      console.error('Error predicting prices:', error);
      console.error('Request details:', {
        token: token.symbol,
        timeframe,
        dataPoints: token.prices.length
      });
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }

      // Return a default prediction when all retries fail
      return {
        timepoints: [{
          timestamp: Date.now(),
          price: token.prices[token.prices.length - 1].price,
          confidence: 0.1
        }],
        supportLevels: [token.prices[token.prices.length - 1].price * 0.99],
        resistanceLevels: [token.prices[token.prices.length - 1].price * 1.01]
      };
    }
  }

  private buildAnalysisPrompt(request: AnalysisRequest): string {
    const { timeframe, data } = request;
    const timeframeStr = this.getTimeframeDescription(timeframe);
    console.log(`Building analysis prompt for ${timeframeStr} timeframe`);
    
    return `Analyze the following ${timeframeStr} price data for ${data.length} tokens and identify the most promising ones based on technical analysis patterns, volume trends, and price action.

Data:
${JSON.stringify(data, null, 2)}

Instructions:
1. Analyze each token's price movement patterns
2. Consider volume trends and their correlation with price
3. Identify technical patterns and potential breakout/breakdown points
4. Evaluate market sentiment based on price action
5. Calculate momentum indicators and trend strength
6. Assess volatility patterns and trading ranges

Provide analysis in the following JSON format without any markdown formatting or special characters:
{
  "selectedTokens": ["token_mints"],
  "analysis": [{
    "tokenMint": "mint_address",
    "trend": {
      "direction": "bullish/bearish/neutral",
      "strength": 0.1-1.0,
      "keyFactors": ["factor1", "factor2"]
    },
    "prediction": {
      "timepoints": [
        {"timestamp": number, "price": number, "confidence": 0.1-1.0}
      ],
      "supportLevels": [number],
      "resistanceLevels": [number]
    },
    "confidence": 0.1-1.0
  }],
  "recommendations": ["detailed_insights"]
}`;
  }

  private buildPredictionPrompt(token: TokenData, timeframe: TimeFrame): string {
    const timeframeStr = this.getTimeframeDescription(timeframe);
    console.log(`Building prediction prompt for ${token.symbol} in ${timeframeStr} timeframe`);
    
    return `Analyze the following ${timeframeStr} price data for ${token.symbol} and predict future price movements. Create a prediction that follows the same data structure pattern.

Historical Data:
${JSON.stringify(token, null, 2)}

Instructions:
1. Analyze price patterns and trends
2. Consider volume profile and price correlations
3. Identify key support and resistance levels
4. Project future price movements
5. Include confidence levels for predictions
6. Mark potential reversal points

Provide prediction in the following JSON format without any markdown formatting or special characters:
{
  "timepoints": [
    {"timestamp": number, "price": number, "confidence": 0.1-1.0}
  ],
  "supportLevels": [number],
  "resistanceLevels": [number]
}`;
  }

  private parseAnalysisResponse(response: string, timeframe: TimeFrame): AnalysisResponse {
    try {
      console.log('Attempting to parse analysis response...');
      // Clean the response by removing any non-JSON characters
      const cleanedResponse = response.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      console.log('Cleaned response:', cleanedResponse);
      
      const parsed = JSON.parse(cleanedResponse);
      
      // Validate the response structure
      if (!parsed.selectedTokens || !parsed.analysis || !parsed.recommendations) {
        console.error('Invalid response structure:', parsed);
        throw new Error('Invalid analysis response structure');
      }

      console.log('Response validation successful');
      console.log('Analysis summary:', {
        selectedTokenCount: parsed.selectedTokens.length,
        analysisCount: parsed.analysis.length,
        recommendationsCount: parsed.recommendations.length
      });

      return parsed;
    } catch (error) {
      console.error('Error parsing analysis response:', error);
      console.error('Raw response:', response);
      throw error;
    }
  }

  private parsePredictionResponse(response: string): PricePrediction {
    try {
      console.log('Attempting to parse prediction response...');
      // Clean the response by removing any non-JSON characters
      const cleanedResponse = response.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      console.log('Cleaned response:', cleanedResponse);
      
      const parsed = JSON.parse(cleanedResponse);
      
      // Validate the response structure
      if (!parsed.timepoints || !parsed.supportLevels || !parsed.resistanceLevels) {
        console.error('Invalid response structure:', parsed);
        throw new Error('Invalid prediction response structure');
      }

      console.log('Response validation successful');
      console.log('Prediction summary:', {
        timepointsCount: parsed.timepoints.length,
        supportLevelsCount: parsed.supportLevels.length,
        resistanceLevelsCount: parsed.resistanceLevels.length
      });

      return parsed;
    } catch (error) {
      console.error('Error parsing prediction response:', error);
      console.error('Raw response:', response);
      throw error;
    }
  }

  private getTimeframeDescription(timeframe: TimeFrame): string {
    switch (timeframe) {
      case 'daily':
        return `${config.timeframes.daily.days}-day`;
      case 'hourly':
        return `${config.timeframes.hourly.hours}-hour`;
      case 'minutely':
        return `${config.timeframes.minutely.minutes}-minute`;
      default:
        return timeframe;
    }
  }
}

export const aiService = new AIService();
