# Kalshi Manual Hotkey Scalper

This is a lightweight manual trading interface configured to trade 15-minute BTC markets on Kalshi instantly using your keyboard arrow keys.

## Features
- **Node.js Express Backend:** Serves the frontend securely, handles API authentication out of sight from the client, and makes orders server-side.
- **Frontend UI:** Single page, dark mode interface (Tailwind CSS) that loads your current active market automatically.
- **Hotkeys:** Pressing `Up Arrow` executes a `BUY`. Pressing `Down Arrow` executes a `SELL`. Parameters are pulled directly from the UI input fields.

## How to Deploy on Railway

1. **Upload to GitHub:**
   - Create a new repository on GitHub.
   - Push these files (`package.json`, `server.js`, `public/index.html`) to your repository. 

2. **Deploy on Railway:**
   - Go to [Railway.app](https://railway.app) and click **"New Project"**.
   - Select **"Deploy from GitHub repo"** and choose your new repository.

3. **Configure Environment Variables:**
   - On the Railway dashboard for your newly deployed service, go to the **Variables** tab.
   - Add the following environment variables:
     - `KALSHI_EMAIL`: Your Kalshi account email.
     - `KALSHI_PASSWORD`: Your Kalshi account password.
     - `KALSHI_API_BASE`: (Optional) Defaults to `https://trading-api.kalshi.com/trade-api/v2`. 
     - `BTC_SERIES_TICKER`: (Optional) Defaults to `KXBTC`. 

4. **Access your App:**
   - Go to the **Settings** tab in Railway, scroll down to **Networking**, and click **Generate Domain**.
