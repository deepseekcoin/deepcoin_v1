import axios from 'axios';

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
    console.log('Fetching top tokens from DexScreener');
    const response = await axios.get<TokenBoost[]>(DEXSCREENER_API_URL);
    
    // Sort tokens by totalAmount (volume) in descending order
    const sortedTokens = response.data.sort((a, b) => b.totalAmount - a.totalAmount);
    
    // Return top 10 tokens
    const topTokens = sortedTokens.slice(0, 10);

    console.log('Successfully fetched top tokens', { count: topTokens.length });
    return topTokens;
  } catch (error) {
    console.error('Error fetching top tokens from DexScreener', { error });
    throw error;
  }
}
