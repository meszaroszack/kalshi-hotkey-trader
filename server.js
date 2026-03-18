require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve the single HTML file from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Kalshi API Configuration
const KALSHI_API_BASE = process.env.KALSHI_API_BASE || 'https://trading-api.kalshi.com';

// API Keys
const KEY_ID = process.env.KALSHI_KEY_ID;
// Handle potential newline formatting issues from env variables
const PRIVATE_KEY = process.env.KALSHI_PRIVATE_KEY ? process.env.KALSHI_PRIVATE_KEY.replace(/\\n/g, '\n') : null;

// Helper function to generate RSA signed headers for Kalshi API V2
function getAuthHeaders(method, requestPath) {
    if (!KEY_ID || !PRIVATE_KEY) {
        throw new Error("Missing KALSHI_KEY_ID or KALSHI_PRIVATE_KEY environment variables.");
    }
    
    const timestamp = Date.now().toString();
    const msgString = timestamp + method + requestPath;
    
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(msgString);
    sign.end();
    
    const signature = sign.sign(PRIVATE_KEY, 'base64');
    
    return {
        'KALSHI-ACCESS-KEY': KEY_ID,
        'KALSHI-ACCESS-SIGNATURE': signature,
        'KALSHI-ACCESS-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
    };
}

// Endpoint: Fetch the active 15m BTC Market
app.get('/api/market', async (req, res) => {
    try {
        const seriesTicker = process.env.BTC_SERIES_TICKER || 'KXBTC'; 
        
        // Exact path is required for the signature to match
        const requestPath = `/trade-api/v2/markets?limit=1&series_ticker=${seriesTicker}&status=open`;
        
        const headers = getAuthHeaders('GET', requestPath);

        const marketRes = await axios.get(`${KALSHI_API_BASE}${requestPath}`, { headers });

        if (marketRes.data.markets && marketRes.data.markets.length > 0) {
            res.json({ market: marketRes.data.markets[0] });
        } else {
            res.status(404).json({ error: 'No open 15m BTC markets found at this time.' });
        }
    } catch (error) {
        console.error('Market Fetch Error:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data?.error?.message || error.message || "Failed to connect to Kalshi" });
    }
});

// Endpoint: Receive frontend hotkey trigger and execute order
app.post('/api/order', async (req, res) => {
    const { action, side, count, max_price, ticker } = req.body;
    
    if (!ticker) {
        return res.status(400).json({ error: 'No active market ticker specified.' });
    }

    try {
        // Construct the limit order payload for Kalshi
        const orderPayload = {
            ticker: ticker,
            action: action.toLowerCase(), // 'buy' or 'sell'
            side: side.toLowerCase(),     // 'yes' or 'no'
            count: parseInt(count),
            type: 'limit',
            client_order_id: crypto.randomUUID() // Standard UUID for Kalshi orders
        };

        // Kalshi requires the price parameter to match the side
        if (side.toLowerCase() === 'yes') {
            orderPayload.yes_price = parseInt(max_price);
        } else {
            orderPayload.no_price = parseInt(max_price);
        }

        const requestPath = '/trade-api/v2/portfolio/orders';
        const headers = getAuthHeaders('POST', requestPath);

        console.log(`Executing ${action.toUpperCase()} for ${count} ${side.toUpperCase()} contracts on ${ticker} at ${max_price}c`);

        const orderRes = await axios.post(`${KALSHI_API_BASE}${requestPath}`, orderPayload, { headers });

        res.json({ success: true, order: orderRes.data.order });
    } catch (error) {
        console.error('Order Error:', error.response?.data || error.message);
        const errMsg = error.response?.data?.error?.message || error.message || 'Failed to place order';
        res.status(500).json({ error: errMsg });
    }
});

// Fallback to serve the main app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Kalshi Hotkey Trader listening on port ${PORT}`);
});
