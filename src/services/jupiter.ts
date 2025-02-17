import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { config } from '../config/env.js';
import { TokenData, JupiterPriceResponse, JupiterToken } from '../types/index.js';
import { getTopTokensByVolume } from './dexscreener.js';
import { logger } from '../utils/logger.js';

class JupiterService {
    private readonly apiEndpoint: string;
    private readonly jupiterClient: AxiosInstance;
    private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    private readonly defaultExtraInfo: JupiterPriceResponse['data'][string]['extraInfo'] = {
        depth: {
            buyPriceImpactRatio: {
                depth: { '10': 0.01, '100': 0.05, '1000': 0.1 },
                timestamp: Date.now()
            },
            sellPriceImpactRatio: {
                depth: { '10': 0.01, '100': 0.05, '1000': 0.1 },
                timestamp: Date.now()
            }
        },
        lastSwappedPrice: {
            lastJupiterBuyPrice: '1000',
            lastJupiterBuyAt: Date.now()
        },
        confidenceLevel: 'low' as const
    };

    constructor() {
        this.apiEndpoint = 'https://api.jup.ag';
        this.jupiterClient = axios.create({
            baseURL: this.apiEndpoint,
            timeout: 10000
        });
    }

    async getTopMemeTokens(limit: number = 10): Promise<JupiterToken[]> {
        logger.info(`Getting top ${limit} meme tokens from Jupiter`, 'JUPITER');
        try {
            // Get top tokens from DexScreener
            const topTokens = await getTopTokensByVolume();
            const memeTokens: JupiterToken[] = topTokens.map(token => ({
                mint: token.tokenAddress,
                symbol: token.tokenAddress
            }));

            // Get price data for each token
            const pricePromises = memeTokens.map(token => 
                this.jupiterClient.get<JupiterPriceResponse>(`/price/v2`, {
                    params: {
                        ids: token.mint,
                        vsToken: this.USDC_MINT,
                        showExtraInfo: true
                    }
                })
            );

            const priceResponses = await Promise.all(pricePromises);
            
            // Sort by volume/confidence
            const tokensWithPrice = memeTokens.map((token, i) => {
                const priceData = priceResponses[i].data.data[token.mint];
                if (!priceData) {
                    logger.error(`No price data found for ${token.mint}`, null, 'JUPITER');
                    return {
                        ...token,
                        price: 0,
                        confidence: 0
                    };
                }
                return {
                    ...token,
                    price: parseFloat(priceData.price),
                    confidence: priceData.extraInfo?.confidenceLevel === 'high' ? 1 : 
                               priceData.extraInfo?.confidenceLevel === 'medium' ? 0.5 : 0.1
                };
            })
            .filter(token => token.price > 0) // Remove tokens with no price data
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

            logger.info(`Found meme tokens: ${JSON.stringify(tokensWithPrice)}`, 'JUPITER');
            return tokensWithPrice.slice(0, limit);
        } catch (error) {
            logger.error('Error fetching tokens from Jupiter', error, 'JUPITER');
            throw error;
        }
    }

    async collectPriceData(timeframe: string, tokens: string[]): Promise<TokenData[]> {
        logger.info(`Collecting ${timeframe} data for tokens: ${JSON.stringify(tokens)}`, 'JUPITER');
        const data: TokenData[] = [];

        for (const tokenMint of tokens) {
            try {
                // Get current price and info
                const priceResponse = await this.jupiterClient.get<JupiterPriceResponse>(`/price/v2`, {
                    params: {
                        ids: tokenMint,
                        vsToken: this.USDC_MINT,
                        showExtraInfo: true
                    }
                });

                const priceData = priceResponse.data.data;
                if (!priceData || !priceData[tokenMint]) {
                    logger.error(`No price data found for ${tokenMint}`, null, 'JUPITER');
                    continue;
                }

                const priceInfo = priceData[tokenMint];
                if (!priceInfo.price) {
                    logger.error(`Invalid price data for ${tokenMint}`, null, 'JUPITER');
                    continue;
                }

                // Generate price points based on available data
                const currentPrice = parseFloat(priceInfo.price);
                const extraInfo = priceInfo.extraInfo || this.defaultExtraInfo;
                const now = Date.now();
                const interval = this.getTimeframeInterval(timeframe);
                const points = this.generatePricePoints(timeframe, now, currentPrice, extraInfo);

                data.push({
                    mint: tokenMint,
                    symbol: tokenMint,
                    prices: points
                });

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                logger.error(`Error collecting data for ${tokenMint}`, error, 'JUPITER');
            }
        }

        console.log(JSON.stringify(data))

        return data;
    }

    private generatePricePoints(timeframe: string, endTime: number, currentPrice: number, extraInfo: JupiterPriceResponse['data'][string]['extraInfo']) {
        const points = [];
        const dataPoints = timeframe === 'daily' ? 30 : timeframe === 'hourly' ? 24 : 60;
        const interval = timeframe === 'daily' ? 86400000 : timeframe === 'hourly' ? 3600000 : 60000;

        // Use price impact ratios for variation
        const defaultRatios = { '10': 0.01, '100': 0.05, '1000': 0.1 };
        const impactRatios = extraInfo?.depth?.buyPriceImpactRatio?.depth || defaultRatios;
        const avgImpact = Object.values(impactRatios).reduce((a, b) => a + b, 0) / Object.values(impactRatios).length;

        for (let i = 0; i < dataPoints; i++) {
            const timestamp = endTime - (dataPoints - i - 1) * interval;
            // const variation = (Math.random() - 0.5) * avgImpact * currentPrice;
            // const price = Math.max(0.000001, currentPrice + variation); // Ensure price never goes below a minimum positive value
            const price = currentPrice;

            points.push({
                timestamp,
                price,
                volume: Math.random() * parseFloat(extraInfo?.lastSwappedPrice?.lastJupiterBuyPrice || '1000')
            });
        }

        return points;
    }

    private getTimeframeInterval(timeframe: string): string {
        switch (timeframe) {
            case 'daily':
                return '1D';
            case 'hourly':
                return '1H';
            case 'minutely':
                return '1m';
            default:
                throw new Error(`Invalid timeframe: ${timeframe}`);
        }
    }
}

export const jupiterService = new JupiterService();
