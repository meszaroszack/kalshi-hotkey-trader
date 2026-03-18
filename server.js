require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// Serve the single HTML file from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Kalshi API Configuration
const KALSHI_API_BASE = process.env.KALSHI_API_BASE || 'https://trading-api.kalshi.com/trade-api/v2';
const EMAIL = process.env.KALSHI_EMAIL;
const PASSWORD = process.env.KALSHI_PASSWORD;

let kalshiToken = null;

// Middleware to ensure we have a valid Kalshi authentication token
async function ensureAuth(req, res, next) {
    if (!kalshiToken) {
        try {
            console.log("Authenticating with Kalshi...");
            const loginRes = await axios.post(`${KALSHI_API_BASE}/login`, {
                email: EMAIL,
                password: PASSWORD
            });
            kalshiToken = loginRes.data.token;
            console.log("Authentication successful.");
        } catch (error) {
            console.error('Kalshi Login Error:', error.response?.data || error.message);
            return res.status(401).json({ error: 'Failed to authenticate with Kalshi API. Check credentials.' });
        }
    }
    next();
}

// Endpoint: Fetch the active 15m BTC Market
app.get('/api/market', ensureAuth, async (req, res) => {
    try {
        // You can override the series ticker via environment variable if Kalshi updates it
        const seriesTicker = process.env.BTC_SERIES_TICKER || 'KXBTC'; 
        
        const marketRes = await axios.get(`${KALSHI_API_BASE}/markets`, {
            headers: { Authorization: `Bearer ${kalshiToken}` },
            params: {
                series_ticker: seriesTicker,
                status: 'open',
                limit: 1 // Fetch the most immediate open market
            }
        });

        if (marketRes.data.markets && marketRes.data.markets.length > 0) {
            res.json({ market: marketRes.data.markets[0] });
        } else {
            res.status(404).json({ error: 'No open 15m BTC markets found at this time.' });
        }
    } catch (error) {
        // If unauthorized, clear token so we re-authenticate on the next request
        if (error.response?.status === 401) kalshiToken = null; 
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Endpoint: Receive frontend hotkey trigger and execute order
app.post('/api/order', ensureAuth, async (req, res) => {
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
            client_order_id: Date.now().toString() // Unique ID to prevent dupes
        };

        // Kalshi requires the price parameter to match the side
        if (side.toLowerCase() === 'yes') {
            orderPayload.yes_price = parseInt(max_price);
        } else {
            orderPayload.no_price = parseInt(max_price);
        }

        console.log(`Executing ${action.toUpperCase()} for ${count} ${side.toUpperCase()} contracts on ${ticker} at ${max_price}c`);

        const orderRes = await axios.post(`${KALSHI_API_BASE}/portfolio/orders`, orderPayload, {
            headers: { Authorization: `Bearer ${kalshiToken}` }
        });

        res.json({ success: true, order: orderRes.data.order });
    } catch (error) {
        // If unauthorized, clear token
        if (error.response?.status === 401) kalshiToken = null;
        console.error('Order Error:', error.response?.data || error.message);
        
        const errMsg = error.response?.data?.error?.message || 'Failed to place order';
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
