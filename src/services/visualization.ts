import { WebSocketServer } from 'ws';
import { TokenData, PricePrediction } from '../types/index.js';
import type { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';
import { StorageService } from './storage.js';

export class VisualizationService {
    private wss: WebSocketServer;
    private clients: Set<WebSocket>;
    private currentToken: TokenData | null = null;
    private currentPrediction: PricePrediction | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    private storageService: StorageService;

    constructor(server: any) {
        this.wss = new WebSocketServer({ server });
        this.clients = new Set();
        this.storageService = new StorageService();

        this.wss.on('connection', (ws: WebSocket) => {
            logger.info('New client connected', 'WS_SERVER');
            this.clients.add(ws);

            // Send current data if available
            if (this.currentToken) {
                this.sendUpdate(ws);
            }

            // Handle client messages
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong' }));
                    }
                } catch (error) {
                    logger.error('Error handling client message', error, 'WS_SERVER');
                }
            });

            // Handle client disconnection
            ws.on('close', () => {
                logger.info('Client disconnected', 'WS_SERVER');
                this.clients.delete(ws);
            });

            // Handle errors
            ws.on('error', (error) => {
                logger.error('WebSocket error', error, 'WS_SERVER');
                this.clients.delete(ws);
            });
        });

        // Start heartbeat to keep connections alive
        this.startHeartbeat();
    }

    private startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                    try {
                        client.send(JSON.stringify({ type: 'heartbeat' }));
                    } catch (error) {
                        logger.error('Error sending heartbeat', error, 'WS_SERVER');
                        this.clients.delete(client);
                    }
                } else {
                    this.clients.delete(client);
                }
            });
        }, 30000); // Every 30 seconds
    }

    public async initialize() {
        await this.storageService.initialize();
        
        // Load saved data
        this.currentToken = await this.storageService.loadMarketData();
        this.currentPrediction = await this.storageService.loadPredictionData();
        
        if (this.currentToken) {
            logger.info(`Loaded market data for ${this.currentToken.symbol}`, 'WS_SERVER');
        }
        if (this.currentPrediction) {
            logger.info('Loaded prediction data', 'WS_SERVER');
        }
    }

    async updatePriceData(token: TokenData) {
        logger.info(`Updating price data for ${token.symbol}`, 'WS_SERVER');
        this.currentToken = token;
        await this.storageService.saveMarketData(token);
        this.broadcastPriceUpdate();
    }

    async updatePrediction(prediction: PricePrediction) {
        logger.info('Updating prediction data', 'WS_SERVER');
        this.currentPrediction = prediction;
        await this.storageService.savePredictionData(prediction);
        this.broadcastPredictionUpdate();
    }

    async updateData(token: TokenData, predictions: PricePrediction) {
        this.currentToken = token;
        this.currentPrediction = predictions;
        await Promise.all([
            this.storageService.saveMarketData(token),
            this.storageService.savePredictionData(predictions)
        ]);
        this.broadcastUpdate();
    }

    private broadcastPriceUpdate() {
        if (this.clients.size === 0 || !this.currentToken) return;

        // Calculate OHLC data from price points
        const priceData = this.currentToken.prices.map((p, i, arr) => {
            const basePrice = p.price;
            // For the first point or if there's a gap, use the same price for OHLC
            const prevPrice = i > 0 ? arr[i - 1].price : basePrice;
            
            // Calculate OHLC based on price movement
            const open = prevPrice;
            const close = basePrice;
            const high = Math.max(open, close);
            const low = Math.min(open, close);

            return {
                timestamp: p.timestamp,
                open,
                high,
                low,
                close,
                volume: p.volume
            };
        });

        const data = {
            type: 'price',
            tokenName: this.currentToken.symbol,
            currentPrice: this.currentToken.prices[this.currentToken.prices.length - 1].price,
            volume: this.currentToken.prices[this.currentToken.prices.length - 1].volume,
            priceData: priceData
        };

        this.broadcast(data);
    }

    private broadcastPredictionUpdate() {
        if (this.clients.size === 0 || !this.currentToken || !this.currentPrediction) return;

        const data = {
            type: 'prediction',
            predictedPrice: this.currentPrediction.timepoints[this.currentPrediction.timepoints.length - 1].price,
            confidence: this.currentPrediction.timepoints[this.currentPrediction.timepoints.length - 1].confidence,
            supportLevels: this.currentPrediction.supportLevels,
            resistanceLevels: this.currentPrediction.resistanceLevels,
            predictions: {
                predicted: this.currentPrediction.timepoints.map((p, i, arr) => {
                    const basePrice = p.price;
                    const prevPrice = i > 0 ? arr[i - 1].price : basePrice;
                    const open = prevPrice;
                    const close = basePrice;
                    const high = Math.max(open, close);
                    const low = Math.min(open, close);

                    return {
                        timestamp: p.timestamp,
                        open,
                        high,
                        low,
                        close,
                        confidence: p.confidence
                    };
                })
            }
        };

        this.broadcast(data);
    }

    private broadcastUpdate() {
        this.broadcastPriceUpdate();
        if (this.currentPrediction) {
            this.broadcastPredictionUpdate();
        }
    }

    private broadcast(data: any) {
        const message = JSON.stringify(data);
        this.clients.forEach((client) => {
            if (client.readyState === client.OPEN) {
                try {
                    client.send(message);
                } catch (error) {
                    logger.error('Error sending data to client', error, 'WS_SERVER');
                    this.clients.delete(client);
                }
            } else {
                this.clients.delete(client);
            }
        });
    }

    private sendUpdate(client: WebSocket) {
        if (this.currentToken) {
            try {
                // Format price data for TradingView chart
                const priceData = {
                    type: 'price',
                    tokenName: this.currentToken.symbol,
                    currentPrice: this.currentToken.prices[this.currentToken.prices.length - 1].price,
                    volume: this.currentToken.prices[this.currentToken.prices.length - 1].volume,
                    priceData: this.currentToken.prices.map((p, i, arr) => {
                        const basePrice = p.price;
                        const prevPrice = i > 0 ? arr[i - 1].price : basePrice;
                        const open = prevPrice;
                        const close = basePrice;
                        const high = Math.max(open, close);
                        const low = Math.min(open, close);

                        return {
                            timestamp: p.timestamp,
                            open,
                            high,
                            low,
                            close,
                            volume: p.volume
                        };
                    })
                };
                client.send(JSON.stringify(priceData));

                if (this.currentPrediction) {
                    const predictionData = {
                        type: 'prediction',
                        predictedPrice: this.currentPrediction.timepoints[this.currentPrediction.timepoints.length - 1].price,
                        confidence: this.currentPrediction.timepoints[this.currentPrediction.timepoints.length - 1].confidence,
                        supportLevels: this.currentPrediction.supportLevels,
                        resistanceLevels: this.currentPrediction.resistanceLevels,
                        predictions: {
                            predicted: this.currentPrediction.timepoints.map((p, i, arr) => {
                                const basePrice = p.price;
                                const prevPrice = i > 0 ? arr[i - 1].price : basePrice;
                                const open = prevPrice;
                                const close = basePrice;
                                const high = Math.max(open, close);
                                const low = Math.min(open, close);

                                return {
                                    timestamp: p.timestamp,
                                    open,
                                    high,
                                    low,
                                    close,
                                    confidence: p.confidence
                                };
                            })
                        }
                    };
                    client.send(JSON.stringify(predictionData));
                }
            } catch (error) {
                logger.error('Error sending update to client', error, 'WS_SERVER');
                this.clients.delete(client);
            }
        }
    }

    broadcastError(error: Error) {
        const data = {
            type: 'error',
            message: error.message
        };
        this.broadcast(data);
    }
}
