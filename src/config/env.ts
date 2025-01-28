import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

interface Config {
    openRouterApiKey: string;
    jupiterApiEndpoint: string;
    dataStorage: {
        daily: string;
        hourly: string;
        minutely: string;
    };
    timeframes: {
        daily: {
            days: number;
            interval: number;
        };
        hourly: {
            hours: number;
            interval: number;
        };
        minutely: {
            minutes: number;
            interval: number;
        };
    };
    minConfidence: number;
    maxTokens: number;
}

export const config: Config = {
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    jupiterApiEndpoint: 'https://price.jup.ag/v4',
    dataStorage: {
        daily: path.join(__dirname, '../../data/daily'),
        hourly: path.join(__dirname, '../../data/hourly'),
        minutely: path.join(__dirname, '../../data/minutely')
    },
    timeframes: {
        daily: {
            days: Number(process.env.DAILY_HISTORY_DAYS) || 30,
            interval: Number(process.env.DAILY_UPDATE_INTERVAL) || 86400000 // 24 hours
        },
        hourly: {
            hours: Number(process.env.HOURLY_HISTORY_HOURS) || 24,
            interval: Number(process.env.HOURLY_UPDATE_INTERVAL) || 3600000 // 1 hour
        },
        minutely: {
            minutes: Number(process.env.MINUTE_HISTORY_MINUTES) || 60,
            interval: Number(process.env.MINUTE_UPDATE_INTERVAL) || 60000 // 1 minute
        }
    },
    minConfidence: Number(process.env.MIN_CONFIDENCE) || 0.7,
    maxTokens: Number(process.env.MAX_DAILY_TOKENS) || 10
};
