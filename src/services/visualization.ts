import { WebSocketServer } from 'ws';
import { TokenData, PricePrediction } from '../types/index.js';
import type { WebSocket } from 'ws';

export class VisualizationService {
    private wss: WebSocketServer;
    private clients: Set<WebSocket>;
    private currentToken: TokenData | null = null;
    private currentPrediction: PricePrediction | null = null;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    constructor(server: any) {
        this.wss = new WebSocketServer({ server });
        this.clients = new Set();

        this.wss.on('connection', (ws: WebSocket) => {
            console.log('New client connected');
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
                    console.error('Error handling client message:', error);
                }
            });

            // Handle client disconnection
            ws.on('close', () => {
                console.log('Client disconnected');
                this.clients.delete(ws);
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
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
                        console.error('Error sending heartbeat:', error);
                        this.clients.delete(client);
                    }
                } else {
                    this.clients.delete(client);
                }
            });
        }, 30000); // Every 30 seconds
    }

    updatePriceData(token: TokenData) {
        console.log(`Updating price data for ${token.symbol}`);
        this.currentToken = token;
        this.broadcastPriceUpdate();
    }

    updatePrediction(prediction: PricePrediction) {
        console.log('Updating prediction data');
        this.currentPrediction = prediction;
        this.broadcastPredictionUpdate();
    }

    updateData(token: TokenData, predictions: PricePrediction) {
        this.currentToken = token;
        this.currentPrediction = predictions;
        this.broadcastUpdate();
    }

    private broadcastPriceUpdate() {
        if (this.clients.size === 0 || !this.currentToken) return;

        const data = {
            type: 'price',
            tokenName: this.currentToken.symbol,
            currentPrice: this.currentToken.prices[this.currentToken.prices.length - 1].price,
            volume: this.currentToken.prices[this.currentToken.prices.length - 1].volume,
            priceData: this.currentToken.prices.map(p => ({
                timestamp: p.timestamp,
                price: p.price
            }))
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
                actual: this.currentToken.prices.map(p => ({
                    timestamp: p.timestamp,
                    price: p.price
                })),
                predicted: this.currentPrediction.timepoints.map(p => ({
                    timestamp: p.timestamp,
                    price: p.price,
                    confidence: p.confidence
                }))
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
                    console.error('Error sending data to client:', error);
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
                const priceData = {
                    type: 'price',
                    tokenName: this.currentToken.symbol,
                    currentPrice: this.currentToken.prices[this.currentToken.prices.length - 1].price,
                    volume: this.currentToken.prices[this.currentToken.prices.length - 1].volume,
                    priceData: this.currentToken.prices.map(p => ({
                        timestamp: p.timestamp,
                        price: p.price
                    }))
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
                            actual: this.currentToken.prices.map(p => ({
                                timestamp: p.timestamp,
                                price: p.price
                            })),
                            predicted: this.currentPrediction.timepoints.map(p => ({
                                timestamp: p.timestamp,
                                price: p.price,
                                confidence: p.confidence
                            }))
                        }
                    };
                    client.send(JSON.stringify(predictionData));
                }
            } catch (error) {
                console.error('Error sending update to client:', error);
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
