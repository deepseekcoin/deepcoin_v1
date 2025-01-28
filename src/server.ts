import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { DeepCoinBot } from './index.js';
import { VisualizationService } from './services/visualization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Create visualization service
export const visualizationService = new VisualizationService(server);

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
    console.log(`Server running at http://localhost:${PORT}`);
});

// Start the bot
const bot = new DeepCoinBot();
bot.start().catch(error => {
    console.error('Error starting bot:', error);
});

// Handle graceful shutdown
const shutdown = () => {
    console.log('Stopping DeepCoin Bot...');
    server.close(() => {
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
