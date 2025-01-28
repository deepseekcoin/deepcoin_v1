export interface TokenData {
    mint: string;
    symbol: string;
    prices: {
        timestamp: number;
        price: number;
        volume: number;
    }[];
}

export type TimeFrame = 'daily' | 'hourly' | 'minutely';

export interface AIAnalysis {
    tokenMint: string;
    trend: {
        direction: 'bullish' | 'bearish' | 'neutral';
        strength: number;
        keyFactors: string[];
    };
    prediction: PricePrediction;
    confidence: number;
}

export interface AnalysisRequest {
    timeframe: TimeFrame;
    data: TokenData[];
    parameters: {
        minConfidence: number;
        maxTokens: number;
    };
}

export interface AnalysisResponse {
    selectedTokens: string[];
    analysis: AIAnalysis[];
    recommendations: string[];
}

export interface PricePrediction {
    timepoints: {
        timestamp: number;
        price: number;
        confidence: number;
    }[];
    supportLevels: number[];
    resistanceLevels: number[];
}

// Jupiter API Types
export interface JupiterPriceResponse {
    data: {
        [key: string]: {
            id: string;
            type: string;
            price: string;
            extraInfo?: {
                lastSwappedPrice?: {
                    lastJupiterSellAt?: number;
                    lastJupiterSellPrice?: string;
                    lastJupiterBuyAt?: number;
                    lastJupiterBuyPrice?: string;
                };
                quotedPrice?: {
                    buyPrice?: string;
                    buyAt?: number;
                    sellPrice?: string;
                    sellAt?: number;
                };
                confidenceLevel?: 'high' | 'medium' | 'low';
                depth?: {
                    buyPriceImpactRatio?: {
                        depth: {
                            [key: string]: number;
                        };
                        timestamp: number;
                    };
                    sellPriceImpactRatio?: {
                        depth: {
                            [key: string]: number;
                        };
                        timestamp: number;
                    };
                };
            };
        };
    };
    timeTaken: number;
}

export interface JupiterToken {
    mint: string;
    symbol: string;
    price?: number;
    confidence?: number;
}
