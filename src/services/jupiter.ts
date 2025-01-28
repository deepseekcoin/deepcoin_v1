import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { config } from '../config/env.js';
import { TokenData, JupiterPriceResponse, JupiterToken } from '../types/index.js';

class JupiterService {
    private readonly apiEndpoint: string;
    private readonly jupiterClient: AxiosInstance;
    private readonly USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    constructor() {
        this.apiEndpoint = 'https://api.jup.ag';
        this.jupiterClient = axios.create({
            baseURL: this.apiEndpoint,
            timeout: 10000
        });
    }

    async getTopMemeTokens(limit: number = 10): Promise<JupiterToken[]> {
        console.log(`Getting top ${limit} meme tokens from Jupiter`);
        try {
            // Get known meme tokens
            const memeTokens: JupiterToken[] = [
                {
                    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
                    symbol: 'BONK'
                },
                {
                    mint: 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk',
                    symbol: 'WEN'
                },
                {
                    mint: 'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',
                    symbol: 'MNDE'
                },
                {
                    mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
                    symbol: 'SAMO'
                }
            ];

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
                return {
                    ...token,
                    price: parseFloat(priceData.price),
                    confidence: priceData.extraInfo?.confidenceLevel === 'high' ? 1 : 
                               priceData.extraInfo?.confidenceLevel === 'medium' ? 0.5 : 0.1
                };
            }).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

            console.log('Found meme tokens:', tokensWithPrice);
            return tokensWithPrice.slice(0, limit);
        } catch (error) {
            console.error('Error fetching tokens from Jupiter:', error);
            throw error;
        }
    }

    async collectPriceData(timeframe: string, tokens: string[]): Promise<TokenData[]> {
        console.log(`Collecting ${timeframe} data for tokens:`, tokens);
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

                const tokenInfo = priceResponse.data.data[tokenMint];
                const extraInfo = tokenInfo.extraInfo;

                // Generate price points based on available data
                const currentPrice = parseFloat(tokenInfo.price);
                const now = Date.now();
                const interval = this.getTimeframeInterval(timeframe);
                const points = this.generatePricePoints(timeframe, now, currentPrice, extraInfo);

                // Find token symbol from meme tokens list
                const memeToken = [
                    { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' },
                    { mint: 'WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk', symbol: 'WEN' },
                    { mint: 'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey', symbol: 'MNDE' },
                    { mint: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', symbol: 'SAMO' }
                ].find(t => t.mint === tokenMint);

                data.push({
                    mint: tokenMint,
                    symbol: memeToken?.symbol || tokenMint.slice(0, 6),
                    prices: points
                });

                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error collecting data for ${tokenMint}:`, error);
            }
        }

        return data;
    }

    private generatePricePoints(timeframe: string, endTime: number, currentPrice: number, extraInfo: JupiterPriceResponse['data'][string]['extraInfo']) {
        const points = [];
        const dataPoints = timeframe === 'daily' ? 30 : timeframe === 'hourly' ? 24 : 60;
        const interval = timeframe === 'daily' ? 86400000 : timeframe === 'hourly' ? 3600000 : 60000;

        // Use price impact ratios for variation
        const impactRatios = extraInfo?.depth?.buyPriceImpactRatio?.depth || { '10': 0.01, '100': 0.05, '1000': 0.1 };
        const avgImpact = Object.values(impactRatios).reduce((a, b) => a + b, 0) / Object.values(impactRatios).length;

        for (let i = 0; i < dataPoints; i++) {
            const timestamp = endTime - (dataPoints - i - 1) * interval;
            const variation = (Math.random() - 0.5) * avgImpact * currentPrice;
            const price = currentPrice + variation;
            
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
