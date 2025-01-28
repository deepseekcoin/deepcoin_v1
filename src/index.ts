import { jupiterService } from './services/jupiter.js';
import { aiService } from './services/ai.js';
import { visualizationService } from './server.js';
import { TokenData, TimeFrame } from './types/index.js';
import { config } from './config/env.js';

export class DeepCoinBot {
    private selectedTokens: string[] = [];
    private lastAnalysis: Map<string, number> = new Map();
    private analysisInterval: NodeJS.Timeout | null = null;
    private readonly maxRetries = 3;
    private readonly retryDelay = 2000; // 2 seconds

    async start() {
        console.log('Starting DeepCoin Bot...');
        try {
            await this.runAnalysisPipeline();
            this.startAnalysisLoop();
        } catch (error) {
            console.error('Error starting bot:', error);
            throw error;
        }
    }

    private startAnalysisLoop() {
        // Run analysis every minute
        this.analysisInterval = setInterval(async () => {
            try {
                await this.runAnalysisPipeline();
            } catch (error) {
                console.error('Error in analysis loop:', error);
            }
        }, config.timeframes.minutely.interval);
    }

    private async runAnalysisPipeline() {
        try {
            console.log('Fetching top meme tokens...');
            const tokens = await jupiterService.getTopMemeTokens(10);
            
            // Daily analysis to find promising tokens
            console.log('Analyzing daily data...');
            const dailyData = await this.collectTimeframeData('daily', tokens.map(t => t.mint));
            const dailyAnalysis = await this.analyzeTimeframe(dailyData);
            
            // Update selected tokens
            this.selectedTokens = dailyAnalysis.selectedTokens;

            // Hourly analysis of selected tokens
            if (this.selectedTokens.length > 0) {
                console.log('Analyzing hourly data for selected tokens...');
                const hourlyData = await this.collectTimeframeData('hourly', this.selectedTokens);
                const hourlyAnalysis = await this.analyzeTimeframe(hourlyData);
                
                // Detailed analysis of most promising tokens
                console.log('Starting detailed analysis for most promising tokens...');
                for (const token of hourlyAnalysis.selectedTokens) {
                    await this.analyzeMinuteData(token);
                }
            }
        } catch (error) {
            console.error('Error in analysis pipeline:', error);
            throw error;
        }
    }

    private async collectTimeframeData(timeframe: TimeFrame, tokens: string[]): Promise<TokenData[]> {
        console.log(`Collecting ${timeframe} data for ${tokens.length} tokens...`);
        let retries = this.maxRetries;
        while (retries > 0) {
            try {
                return await jupiterService.collectPriceData(timeframe, tokens);
            } catch (error) {
                retries--;
                if (retries === 0) {
                    console.error(`Failed to collect ${timeframe} data after ${this.maxRetries} attempts`);
                    throw error;
                }
                console.log(`Retrying data collection, ${retries} attempts remaining...`);
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
                console.error('Error updating price data:', error);
            }

            // Get and update predictions
            try {
                const predictions = await aiService.predictPrices(token, 'minutely');
                visualizationService.updatePrediction(predictions);
            } catch (error) {
                console.error('Error updating predictions:', error);
                
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
            console.error(`Error analyzing minute data for ${tokenMint}:`, error);
        }
    }

    stop() {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        console.log('Stopping DeepCoin Bot...');
    }
}
