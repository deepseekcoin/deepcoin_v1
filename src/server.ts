import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { DeepCoinBot } from './index.js';
import { VisualizationService } from './services/visualization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Create and initialize visualization service
export let visualizationService: VisualizationService;

const initializeServices = async () => {
    visualizationService = new VisualizationService(server);
    await visualizationService.initialize();
};

// Initialize services
initializeServices().catch(error => {
    logger.error('Error initializing services:', error, 'SERVER_START');
    process.exit(1);
});

// Serve static files from src directory
app.use(express.static(path.join(__dirname)));

// Serve node_modules for client-side dependencies
app.use('/node_modules', express.static(path.join(__dirname, '../node_modules')));

// Serve index.html for all routes to support SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    logger.info(`Server running at http://localhost:${PORT}`, 'SERVER_START');
});

// Start the bot
const bot = new DeepCoinBot();
bot.start().catch(error => {
    logger.error('Error starting bot:', error, 'BOT_START');
});

// Handle graceful shutdown
const shutdown = () => {
    logger.info('Stopping DeepCoin Bot...', 'SERVER_SHUTDOWN');
    server.close(() => {
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
