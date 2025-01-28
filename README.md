# DeepCoin Bot

A Solana meme coins analysis bot that uses Jupiter API for price feeds and DeepSeek AI for trend analysis and price predictions.

## Features

- Real-time price monitoring of Solana meme coins
- AI-powered trend analysis using DeepSeek
- Multi-timeframe analysis (daily, hourly, minutely)
- Interactive visualization of price data and predictions
- Automatic identification of promising trading opportunities

## Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- OpenRouter API key for DeepSeek AI access

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd deepcoin
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Configure your environment variables:
- Open `.env` file
- Add your OpenRouter API key: `OPENROUTER_API_KEY=your_key_here`
- Adjust other parameters as needed

## Running the Bot

### Development Mode
```bash
npm run dev
```

### Production Mode
1. Build the project:
```bash
npm run build
```

2. Start the server:
```bash
npm start
```

## Usage

1. Access the web interface at `http://localhost:3000`
2. The bot will automatically:
   - Fetch top meme coins by volume/activity
   - Analyze daily trends to identify promising tokens
   - Perform hourly analysis on selected tokens
   - Generate minute-by-minute predictions
   - Display real-time price data and predictions

## Architecture

- `src/services/jupiter.ts`: Handles price feed data collection
- `src/services/ai.ts`: Manages AI analysis and predictions
- `src/services/visualization.ts`: Handles chart rendering
- `src/server.ts`: Express server for web interface
- `src/index.ts`: Core bot logic and orchestration

## Data Storage

Data is stored in the following directories:
- `data/daily`: Daily price and analysis data
- `data/hourly`: Hourly price and analysis data
- `data/minutely`: Minute-by-minute price and analysis data

## Configuration

Key configuration parameters in `.env`:
- `PORT`: Server port (default: 3000)
- `MIN_CONFIDENCE`: Minimum confidence threshold for predictions
- `MAX_DAILY_TOKENS`: Maximum tokens to track daily
- `MAX_HOURLY_TOKENS`: Maximum tokens to analyze hourly

## License

ISC License
