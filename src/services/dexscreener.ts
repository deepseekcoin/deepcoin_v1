import axios from 'axios';
import { logger } from '../utils/logger.js';

const DEXSCREENER_API_URL = 'https://api.dexscreener.com/token-boosts/top/v1';

interface TokenBoost {
  url: string;
  chainId: string;
  tokenAddress: string;
  amount: number;
  totalAmount: number;
  icon?: string;
  header?: string;
  description?: string;
  links?: Array<{
    type: string;
    label: string;
    url: string;
  }>;
}

export async function getTopTokensByVolume(): Promise<TokenBoost[]> {
  try {
    logger.info('Fetching top tokens from DexScreener', 'DEXSCREENER');
    const response = await axios.get<TokenBoost[]>(DEXSCREENER_API_URL);
    
    // Sort tokens by totalAmount (volume) in descending order
    const sortedTokens = response.data.sort((a, b) => b.totalAmount - a.totalAmount);
    
    // Return top 10 tokens
    const topTokens = sortedTokens.slice(0, 10);

    logger.info(`Successfully fetched top tokens { count: ${topTokens.length} }`, 'DEXSCREENER');
    return topTokens;
  } catch (error) {
    logger.error('Error fetching top tokens from DexScreener', error, 'DEXSCREENER');
    throw error;
  }
}
