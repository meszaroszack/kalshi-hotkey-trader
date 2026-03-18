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

// Force no-cache on all routes so Railway/Browser never serve 304s
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// Kalshi API Configuration
// Default to the official Exchange API v2 base URL.
const KALSHI_API_BASE = (process.env.KALSHI_API_BASE || 'https://api.elections.kalshi.com').replace(/\/$/, '');

// API Keys
const KEY_ID = process.env.KALSHI_KEY_ID;
let PRIVATE_KEY = process.env.KALSHI_PRIVATE_KEY;

// Auto-fix mangled private keys from Railway
if (PRIVATE_KEY) {
    PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
    if (!PRIVATE_KEY.includes('\n')) {
        PRIVATE_KEY = PRIVATE_KEY.replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n');
        PRIVATE_KEY = PRIVATE_KEY.replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----');
        const parts = PRIVATE_KEY.split('\n');
        if (parts.length === 3) {
            const base64Body = parts[1].replace(/ /g, '\n');
            PRIVATE_KEY = `${parts[0]}\n${base64Body}\n${parts[2]}`;
        }
    }
}

// Helper function to generate RSA-PSS signed headers for Kalshi API V2
function getAuthHeaders(method, requestPath) {
    if (!KEY_ID || !PRIVATE_KEY) {
        throw new Error("Missing KALSHI_KEY_ID or KALSHI_PRIVATE_KEY in Railway Variables.");
    }
    
    const timestamp = Date.now().toString();
    // As per Kalshi docs, the signature must be over the path WITHOUT query params.
    const pathForSignature = requestPath.split('?')[0];
    const msgString = timestamp + method + pathForSignature;
    
    try {
        const signatureBuffer = crypto.sign('RSA-SHA256', Buffer.from(msgString, 'utf8'), {
            key: PRIVATE_KEY,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
        });
        const signature = signatureBuffer.toString('base64');
        
        return {
            'KALSHI-ACCESS-KEY': KEY_ID,
            'KALSHI-ACCESS-SIGNATURE': signature,
            'KALSHI-ACCESS-TIMESTAMP': timestamp,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
    } catch (err) {
        console.error("Crypto Sign Error:", err.message);
        throw new Error("Invalid RSA Private Key format. Please check your Railway variables.");
    }
}

// ==========================================
// STRICT API ROUTER - NO HTML ALLOWED HERE
// ==========================================
const apiRouter = express.Router();

// Endpoint: Fetch the active 15m BTC Market
apiRouter.get('/market', async (req, res) => {
    try {
        const seriesTicker = process.env.BTC_SERIES_TICKER || 'KXBTC15M'; 
        const requestPath = `/trade-api/v2/markets?limit=5&series_ticker=${seriesTicker}&status=open`;
        
        const headers = getAuthHeaders('GET', requestPath);
        const marketRes = await axios.get(`${KALSHI_API_BASE}${requestPath}`, { headers });

        if (marketRes.data && marketRes.data.markets && marketRes.data.markets.length > 0) {
            const markets = marketRes.data.markets;
            const now = new Date();

            // Prefer the "current" 15m market where open_time <= now < close_time
            const liveMarkets = markets.filter(m => {
                const open = new Date(m.open_time);
                const close = new Date(m.close_time);
                return open <= now && now < close;
            });

            let targetMarket;
            if (liveMarkets.length > 0) {
                // If multiple match, pick the one that closes soonest.
                targetMarket = liveMarkets.sort(
                    (a, b) => new Date(a.close_time) - new Date(b.close_time)
                )[0];
            } else {
                // Fallback: pick the next market that opens soonest in the future.
                targetMarket = markets.sort(
                    (a, b) => new Date(a.open_time) - new Date(b.open_time)
                )[0];
            }

            return res.json({ market: targetMarket });
        } else {
            return res.status(404).json({ error: `No open markets found for ticker: ${seriesTicker}` });
        }
    } catch (error) {
        console.error('Market Fetch Error:', error.response?.data || error.message);
        const errorMsg = error.response?.data?.error?.message || error.message || "Failed to connect to Kalshi";
        return res.status(500).json({ error: errorMsg });
    }
});

// Endpoint: Receive frontend hotkey trigger and execute order
apiRouter.post('/order', async (req, res) => {
    const { action, side, count, max_price, ticker } = req.body;
    
    if (!ticker) {
        return res.status(400).json({ error: 'No active market ticker specified.' });
    }

    // Basic input validation – keep it simple but safe
    const normalizedAction = String(action || '').toLowerCase();
    const normalizedSide = String(side || '').toLowerCase();
    const parsedCount = parseInt(count, 10);
    const parsedPrice = parseInt(max_price, 10);

    if (!['buy', 'sell'].includes(normalizedAction)) {
        return res.status(400).json({ error: 'Invalid action. Must be "buy" or "sell".' });
    }

    if (!['yes', 'no'].includes(normalizedSide)) {
        return res.status(400).json({ error: 'Invalid side. Must be "yes" or "no".' });
    }

    if (!Number.isInteger(parsedCount) || parsedCount <= 0) {
        return res.status(400).json({ error: 'Invalid count. Must be a positive integer.' });
    }

    if (!Number.isInteger(parsedPrice) || parsedPrice < 1 || parsedPrice > 99) {
        return res.status(400).json({ error: 'Invalid price. Must be an integer between 1 and 99 (cents).' });
    }

    try {
        const orderPayload = {
            ticker: ticker,
            action: normalizedAction,
            side: normalizedSide,
            count: parsedCount,
            type: 'limit',
            client_order_id: crypto.randomUUID() 
        };

        if (normalizedSide === 'yes') {
            orderPayload.yes_price = parsedPrice;
        } else {
            orderPayload.no_price = parsedPrice;
        }

        const requestPath = '/trade-api/v2/portfolio/orders';
        const headers = getAuthHeaders('POST', requestPath);

        console.log(`Executing ${action.toUpperCase()} for ${count} ${side.toUpperCase()} contracts on ${ticker} at ${max_price}c`);

        const orderRes = await axios.post(`${KALSHI_API_BASE}${requestPath}`, orderPayload, { headers });

        return res.json({ success: true, order: orderRes.data.order });
    } catch (error) {
        console.error('Order Error:', error.response?.data || error.message);
        const errMsg = error.response?.data?.error?.message || error.message || 'Failed to place order';
        return res.status(500).json({ error: errMsg });
    }
});

// CATCH-ALL FOR API: Force JSON error if a bad API path is hit
apiRouter.all('*', (req, res) => {
    return res.status(404).json({ error: `API Endpoint not found: ${req.originalUrl}` });
});

// Mount the strictly isolated API router
app.use('/api', apiRouter);

// ==========================================
// FRONTEND / STATIC FILES ROUTER
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to serve the HTML app for any non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Kalshi Hotkey Trader strictly listening on port ${PORT}`);
});
