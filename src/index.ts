import { jupiterService } from './services/jupiter.js';
import { aiService } from './services/ai.js';
import { visualizationService } from './server.js';
import { logger } from './utils/logger.js';
import { TokenData, TimeFrame } from './types/index.js';
import { config } from './config/env.js';
import { StorageService } from './services/storage.js';

export class DeepCoinBot {
    private selectedTokens: string[] = [];
    private lastAnalysis: Map<string, number> = new Map();
    private readonly maxRetries = 3;
    private readonly retryDelay = 2000; // 2 seconds

    async start() {
        logger.info('Starting DeepCoin Bot...', 'BOT_INIT');
        try {
            const storageService = new StorageService();
            await storageService.initialize(true); // Clear cache on start
            
            await this.runAnalysisPipeline();
            await this.startAnalysisLoop(); // Changed to await since it's now an infinite loop
        } catch (error) {
            logger.error('Error starting bot:', error, 'BOT_INIT');
            throw error;
        }
    }

    private async startAnalysisLoop() {
        while (true) {
            try {
                await this.runAnalysisPipeline();
                // Wait for one minute after completing all requests
                await new Promise(resolve => setTimeout(resolve, 60000));
            } catch (error) {
                logger.error('Error in analysis loop:', error, 'ANALYSIS_LOOP');
                // Still wait before retrying on error
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }
    }

    private async runAnalysisPipeline() {
        try {
            logger.info('Fetching top meme tokens...', 'TOKEN_FETCH');
            const tokens = await jupiterService.getTopMemeTokens(10);
            
            // Daily analysis to find promising tokens
            logger.info('Analyzing daily data...', 'DAILY_ANALYSIS');
            const dailyData = await this.collectTimeframeData('daily', tokens.map(t => t.mint));
            
            // Update visualization with first token's data immediately
            if (dailyData.length > 0) {
                visualizationService.updatePriceData(dailyData[0]);
            }
            
            const dailyAnalysis = await this.analyzeTimeframe(dailyData);
            
            // Update selected tokens
            this.selectedTokens = dailyAnalysis.selectedTokens;

            // Hourly analysis of selected tokens
            if (this.selectedTokens.length > 0) {
                logger.info('Analyzing hourly data for selected tokens...', 'HOURLY_ANALYSIS');
                const hourlyData = await this.collectTimeframeData('hourly', this.selectedTokens);
                const hourlyAnalysis = await this.analyzeTimeframe(hourlyData);
                
                // Detailed analysis of most promising tokens
                logger.info('Starting detailed analysis for most promising tokens...', 'DETAILED_ANALYSIS');
                for (const token of hourlyAnalysis.selectedTokens) {
                    await this.analyzeMinuteData(token);
                }
            }
        } catch (error) {
            logger.error('Error in analysis pipeline:', error, 'ANALYSIS_PIPELINE');
            throw error;
        }
    }

    private async collectTimeframeData(timeframe: TimeFrame, tokens: string[]): Promise<TokenData[]> {
        logger.info(`Collecting ${timeframe} data for ${tokens.length} tokens...`, 'DATA_COLLECTION');
        let retries = this.maxRetries;
        while (retries > 0) {
            try {
                return await jupiterService.collectPriceData(timeframe, tokens);
            } catch (error) {
                retries--;
                if (retries === 0) {
                    logger.error(`Failed to collect ${timeframe} data after ${this.maxRetries} attempts`, null, 'DATA_COLLECTION');
                    throw error;
                }
                logger.info(`Retrying data collection, ${retries} attempts remaining...`, 'DATA_COLLECTION_RETRY');
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
        return [];
    }

    private async analyzeTimeframe(data: TokenData[]) {
        return aiService.analyzeTrends({
            timeframe: 'daily',
            data,
            parameters: {
                minConfidence: config.minConfidence,
                maxTokens: config.maxTokens
            }
        });
    }

    private async analyzeMinuteData(tokenMint: string) {
        try {
            const data = await this.collectTimeframeData('minutely', [tokenMint]);
            if (data.length === 0) return;

            const token = data[0];
            
            // Update price data immediately
            try {
                visualizationService.updatePriceData(token);
            } catch (error) {
                logger.error('Error updating price data:', error, 'PRICE_UPDATE');
            }

            // Get and update predictions
            try {
                const predictions = await aiService.predictPrices(token, 'minutely');
                visualizationService.updatePrediction(predictions);
            } catch (error) {
                logger.error('Error updating predictions:', error, 'PREDICTION_UPDATE');
                
                // Use fallback prediction if AI fails
                const fallbackPrediction = {
                    timepoints: [{
                        timestamp: Date.now(),
                        price: token.prices[token.prices.length - 1].price,
                        confidence: 0.1
                    }],
                    supportLevels: [token.prices[token.prices.length - 1].price * 0.99],
                    resistanceLevels: [token.prices[token.prices.length - 1].price * 1.01]
                };
                visualizationService.updatePrediction(fallbackPrediction);
            }

            // Store last analysis time
            this.lastAnalysis.set(tokenMint, Date.now());

        } catch (error) {
            logger.error(`Error analyzing minute data for ${tokenMint}:`, error, 'MINUTE_ANALYSIS');
        }
    }

    stop() {
        logger.info('Stopping DeepCoin Bot...', 'BOT_SHUTDOWN');
        // Note: The bot will stop at the next iteration of the analysis loop
        // when the process is terminated
    }
}
