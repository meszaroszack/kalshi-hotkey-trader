# Kalshi Manual Hotkey Scalper

This is a lightweight manual trading interface configured to trade 15-minute BTC markets on Kalshi instantly using your keyboard arrow keys.

## Features
- **Node.js Express Backend:** Serves the frontend securely, using Kalshi API Keys to completely bypass 2FA issues.
- **Frontend UI:** Single page, dark mode interface (Tailwind CSS) that loads your current active market automatically.
- **Hotkeys:** Pressing `Up Arrow` executes a `BUY`. Pressing `Down Arrow` executes a `SELL`. Parameters are pulled directly from the UI input fields.

## How it works

- The backend talks directly to Kalshi's **trading API v2** using your **API key ID** and **RSA private key**.
- Authentication uses the official **RSA-PSS SHA256** scheme with headers:
  - `KALSHI-ACCESS-KEY`
  - `KALSHI-ACCESS-SIGNATURE`
  - `KALSHI-ACCESS-TIMESTAMP`
- The app queries the `KXBTC15M` series (by default) and always selects the **soonest-expiring open market**. As each 15-minute candle rolls, the UI automatically points to the new market.
- The frontend is a **minimal hotkey pad**:
  - Toggle **YES/NO**.
  - Set **Size (contracts)**.
  - Set separate **Buy Limit Price** and **Sell Limit Price** (in cents).
  - Press:
    - `↑` (Up Arrow) → `BUY` with the **Buy Limit Price**.
    - `↓` (Down Arrow) → `SELL` with the **Sell Limit Price**.

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
     - `KALSHI_KEY_ID`: Your Kalshi API Key ID.
     - `KALSHI_PRIVATE_KEY`: Your Kalshi Private Key string (include the `-----BEGIN RSA PRIVATE KEY-----` wrapper).
     - `BTC_SERIES_TICKER`: (Optional) Defaults to `KXBTC15M`.

   **Notes:**
   - The app expects **production** Kalshi credentials (`https://trading-api.kalshi.com` by default).
   - The private key can be stored as a single-line env var; the backend will normalize `\n` so it becomes a valid PEM again.
   - There is **no backend max-size cap**; order size risk is controlled entirely via the **Size (Contracts)** input.

4. **Access your App:**
   - Go to the **Settings** tab in Railway, scroll down to **Networking**, and click **Generate Domain**.
