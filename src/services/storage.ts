import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { TokenData, PricePrediction } from '../types/index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class StorageService {
    private dataDir: string;
    private marketDataPath: string;
    private predictionDataPath: string;

    constructor() {
        this.dataDir = path.join(__dirname, '../../data');
        this.marketDataPath = path.join(this.dataDir, 'market-data.json');
        this.predictionDataPath = path.join(this.dataDir, 'prediction-data.json');
    }

    async initialize(clearCache: boolean = false): Promise<void> {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            
            if (clearCache) {
                await this.clearCache();
            }

            // Create files if they don't exist
            await this.ensureFile(this.marketDataPath);
            await this.ensureFile(this.predictionDataPath);
            
            logger.info('Storage service initialized', 'STORAGE');
        } catch (error) {
            logger.error('Error initializing storage service:', error, 'STORAGE');
            throw error;
        }
    }

    private async clearCache(): Promise<void> {
        try {
            await fs.unlink(this.marketDataPath);
            await fs.unlink(this.predictionDataPath);
            logger.info('Cache cleared', 'STORAGE');
        } catch (error) {
            logger.error('Error clearing cache:', error, 'STORAGE');
        }
    }

    private async ensureFile(filePath: string): Promise<void> {
        try {
            await fs.access(filePath);
        } catch {
            await fs.writeFile(filePath, JSON.stringify(null));
        }
    }

    async saveMarketData(data: TokenData): Promise<void> {
        try {
            await fs.writeFile(this.marketDataPath, JSON.stringify(data, null, 2));
            logger.info(`Market data saved for ${data.symbol}`, 'STORAGE');
        } catch (error) {
            logger.error('Error saving market data:', error, 'STORAGE');
            throw error;
        }
    }

    async savePredictionData(data: PricePrediction): Promise<void> {
        try {
            await fs.writeFile(this.predictionDataPath, JSON.stringify(data, null, 2));
            logger.info('Prediction data saved', 'STORAGE');
        } catch (error) {
            logger.error('Error saving prediction data:', error, 'STORAGE');
            throw error;
        }
    }

    async loadMarketData(): Promise<TokenData | null> {
        try {
            const data = await fs.readFile(this.marketDataPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Error loading market data:', error, 'STORAGE');
            return null;
        }
    }

    async loadPredictionData(): Promise<PricePrediction | null> {
        try {
            const data = await fs.readFile(this.predictionDataPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Error loading prediction data:', error, 'STORAGE');
            return null;
        }
    }
}
