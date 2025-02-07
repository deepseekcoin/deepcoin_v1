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
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class AIService {
  private readonly openai: OpenAI;
  private readonly model = 'deepseek/deepseek-chat';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second
  private readonly cacheTTL = {
    minutely: 5 * 60 * 1000, // 5 minutes
    hourly: 60 * 60 * 1000, // 1 hour
    daily: 4 * 60 * 60 * 1000 // 4 hours
  };
  private readonly analysisCache = new Map<string, CacheEntry<AnalysisResponse>>();
  private readonly predictionCache = new Map<string, CacheEntry<PricePrediction>>();

  constructor() {
    if (!config.openRouterApiKey) {
      throw new Error('OpenRouter API key is required');
    }

    logger.info('Initializing AI Service with OpenRouter...', 'AI_SERVICE');
    this.openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.openRouterApiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/deepcoin/bot',
        'X-Title': 'DeepCoin Bot'
      }
    });
    logger.info('AI Service initialized successfully', 'AI_SERVICE');
  }

  private async retry<T>(operation: () => Promise<T>, retries = this.maxRetries): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0) {
        logger.info(`Retrying operation, ${retries} attempts remaining...`, 'AI_SERVICE');
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.retry(operation, retries - 1);
      }
      throw error;
    }
  }

  private generateCacheKey(data: any): string {
    // Create a clean object with only the fields we want to hash
    const cleanData = Object.keys(data).sort().reduce((obj: any, key: string) => {
      if (key === 'tokens' && Array.isArray(data[key])) {
        obj[key] = data[key].map((t: any) => ({
          mint: t.mint || '',
          symbol: t.symbol || ''
        }));
      } else {
        obj[key] = data[key];
      }
      return obj;
    }, {});

    const jsonStr = JSON.stringify(cleanData);
    logger.info(`Generating cache key for: ${jsonStr}`, 'AI_SERVICE');
    
    const key = crypto
      .createHash('md5')
      .update(jsonStr)
      .digest('hex');
    
    logger.info(`Generated cache key: ${key}`, 'AI_SERVICE');
    return key;
  }

  private getCacheTTL(timeframe: TimeFrame): number {
    return this.cacheTTL[timeframe];
  }

  private isCacheValid<T>(cache: Map<string, CacheEntry<T>>, key: string, timeframe: TimeFrame): boolean {
    const entry = cache.get(key);
    if (!entry) return false;
    
    const now = Date.now();
    return now - entry.timestamp < this.getCacheTTL(timeframe);
  }

  async analyzeTrends(request: AnalysisRequest): Promise<AnalysisResponse> {
    logger.info(`Starting trend analysis for ${request.data.length} tokens in ${request.timeframe} timeframe`, 'AI_ANALYSIS');
    
    // Only include relevant fields for cache key
    const cacheKey = this.generateCacheKey({
      timeframe: request.timeframe,
      tokens: request.data.map(t => ({ mint: t.mint, symbol: t.symbol }))
    });
    if (this.isCacheValid(this.analysisCache, cacheKey, request.timeframe)) {
      const cacheEntry = this.analysisCache.get(cacheKey)!;
      const cacheAge = Math.round((Date.now() - cacheEntry.timestamp) / 1000);
      logger.info(`Using cached analysis result (age: ${cacheAge}s, TTL: ${this.getCacheTTL(request.timeframe)/1000}s)`, 'AI_ANALYSIS');
      return cacheEntry.data;
    }
    logger.info('Cache miss or expired, performing new analysis', 'AI_ANALYSIS');
    const prompt = this.buildAnalysisPrompt(request);
    
    try {
      return await this.retry(async () => {
        logger.info('Sending analysis request to OpenRouter...', 'AI_ANALYSIS');
        logger.info(`Using model: ${this.model}`, 'AI_ANALYSIS');
        
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

        logger.info('Received response from OpenRouter', 'AI_ANALYSIS');
        const response = completion.choices[0]?.message?.content;
        if (!response) {
          throw new Error('Empty response from AI');
        }

        logger.info('Parsing analysis response...', 'AI_ANALYSIS');
        const result = this.parseAnalysisResponse(response, request.timeframe);
        logger.info(`Analysis complete. Selected ${result.selectedTokens.length} tokens`, 'AI_ANALYSIS');
        
        // Cache the result
        this.analysisCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
        
        return result;
      });
    } catch (error) {
      logger.error('Error analyzing trends', error, 'AI_ANALYSIS');
      logger.error(`Request details: ${JSON.stringify({
        timeframe: request.timeframe,
        tokenCount: request.data.length,
        parameters: request.parameters
      })}`, null, 'AI_ANALYSIS');

      // Return a default response when all retries fail
      return {
        selectedTokens: [],
        analysis: [],
        recommendations: ['Analysis failed due to technical issues. Please try again later.']
      };
    }
  }

  async predictPrices(token: TokenData, timeframe: TimeFrame): Promise<PricePrediction> {
    logger.info(`Starting price prediction for token ${token.symbol} in ${timeframe} timeframe`, 'AI_PREDICTION');
    
    // Only include relevant fields for cache key
    const cacheKey = this.generateCacheKey({
      mint: token.mint,
      timeframe,
      symbol: token.symbol
    });
    if (this.isCacheValid(this.predictionCache, cacheKey, timeframe)) {
      const cacheEntry = this.predictionCache.get(cacheKey)!;
      const cacheAge = Math.round((Date.now() - cacheEntry.timestamp) / 1000);
      logger.info(`Using cached prediction result (age: ${cacheAge}s, TTL: ${this.getCacheTTL(timeframe)/1000}s)`, 'AI_PREDICTION');
      return cacheEntry.data;
    }
    logger.info('Cache miss or expired, generating new prediction', 'AI_PREDICTION');
    const prompt = this.buildPredictionPrompt(token, timeframe);
    
    try {
      return await this.retry(async () => {
        logger.info('Sending prediction request to OpenRouter...', 'AI_PREDICTION');
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

        logger.info('Received response from OpenRouter', 'AI_PREDICTION');
        const response = completion.choices[0]?.message?.content;
        if (!response) {
          throw new Error('Empty response from AI');
        }

        logger.info('Parsing prediction response...', 'AI_PREDICTION');
        const result = this.parsePredictionResponse(response);
        logger.info(`Prediction complete. Generated ${result.timepoints.length} prediction points`, 'AI_PREDICTION');
        
        // Cache the result
        this.predictionCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
        
        return result;
      });
    } catch (error) {
      logger.error('Error predicting prices', error, 'AI_PREDICTION');
      logger.error(`Request details: ${JSON.stringify({
        token: token.symbol,
        timeframe,
        dataPoints: token.prices.length
      })}`, null, 'AI_PREDICTION');

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
    logger.info(`Building analysis prompt for ${timeframeStr} timeframe`, 'AI_ANALYSIS');
    
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
    logger.info(`Building prediction prompt for ${token.symbol} in ${timeframeStr} timeframe`, 'AI_PREDICTION');
    
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
      logger.info('Attempting to parse analysis response...', 'AI_ANALYSIS');
      // Clean the response by removing any non-JSON characters
      const cleanedResponse = response.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      logger.info(`Cleaned response: ${cleanedResponse}`, 'AI_ANALYSIS');
      
      const parsed = JSON.parse(cleanedResponse);
      
      // Validate the response structure
      if (!parsed.selectedTokens || !parsed.analysis || !parsed.recommendations) {
        logger.error(`Invalid response structure: ${JSON.stringify(parsed)}`, null, 'AI_ANALYSIS');
        throw new Error('Invalid analysis response structure');
      }

      logger.info('Response validation successful', 'AI_ANALYSIS');
      logger.info(`Analysis summary: ${JSON.stringify({
        selectedTokenCount: parsed.selectedTokens.length,
        analysisCount: parsed.analysis.length,
        recommendationsCount: parsed.recommendations.length
      })}`, 'AI_ANALYSIS');

      return parsed;
    } catch (error) {
      logger.error('Error parsing analysis response', error, 'AI_ANALYSIS');
      logger.error(`Raw response: ${response}`, null, 'AI_ANALYSIS');
      throw error;
    }
  }

  private parsePredictionResponse(response: string): PricePrediction {
    try {
      logger.info('Attempting to parse prediction response...', 'AI_PREDICTION');
      // Clean the response by removing any non-JSON characters
      const cleanedResponse = response.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      logger.info(`Cleaned response: ${cleanedResponse}`, 'AI_PREDICTION');
      
      const parsed = JSON.parse(cleanedResponse);
      
      // Validate the response structure
      if (!parsed.timepoints || !parsed.supportLevels || !parsed.resistanceLevels) {
        logger.error(`Invalid response structure: ${JSON.stringify(parsed)}`, null, 'AI_PREDICTION');
        throw new Error('Invalid prediction response structure');
      }

      logger.info('Response validation successful', 'AI_PREDICTION');
      logger.info(`Prediction summary: ${JSON.stringify({
        timepointsCount: parsed.timepoints.length,
        supportLevelsCount: parsed.supportLevels.length,
        resistanceLevelsCount: parsed.resistanceLevels.length
      })}`, 'AI_PREDICTION');

      return parsed;
    } catch (error) {
      logger.error('Error parsing prediction response', error, 'AI_PREDICTION');
      logger.error(`Raw response: ${response}`, null, 'AI_PREDICTION');
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
