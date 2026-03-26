# IMC Prosperity 4 — Strategy Log Visualizer

A high-performance trading strategy dashboard for analysing [IMC Prosperity 4](https://imc-prosperity.com) competition logs. Built with React + Recharts on the frontend and an optional Rust backend for fast log parsing.

---

## What it does

Load a Prosperity 4 JSON log file and get an interactive multi-panel dashboard showing:

- **Global view** — full-run overview of mid price, bid/ask levels, your placed orders, your fills, and position across all symbols
- **Local view** — zoomed-in window synced to the range selector, with volume-proportional bid/ask depth markers
- **Data table** — tick-by-tick breakdown of market data, your orders, and fills for the selected window
- **Stats panel** — per-symbol and portfolio PnL, max drawdown, PnL σ per tick, fill rate, B/S fill counts

### Visualized series (all independently toggleable per panel)

| Series | Description |
|---|---|
| mid | Mid price from activitiesLog |
| mov avg | 50-tick rolling average of mid |
| bid/ask L1–L3 | Market depth levels (local view: volume-proportional dots on dotted lines) |
| pnl | Cumulative P&L from activitiesLog |
| pnl SYMBOL | Per-symbol P&L curves (hidden by default, toggle on) |
| placed bid / ask | Your submitted orders (bright lime ▼ / red ▲ triangles, size-proportional) |
| buy fill / sell fill | Your confirmed trades (neon green / amber circles with glow ring, size-proportional) |
| pos SYMBOL | Position step-line on right axis |

### Controls

- **Drag-to-select** on the global chart to zoom the local view
- **Dual-handle range bar** with direct timestamp input
- **Clickable legend** — toggle any series on/off independently in global vs local
- **Resizable panels** — drag the horizontal and vertical dividers
- **Persistent state** — brush position, hidden series, and loaded file survive page refresh (localStorage)
- **Reset button** — clears everything back to defaults

---

## Architecture

```
your-repo/
├── p4dashboard/        React + Vite frontend
│   └── src/
│       ├── App.jsx                 main layout and state
│       ├── parser.js               JS log parser (fallback)
│       ├── seriesConfig.js         series definitions and colour palettes
│       ├── persistence.js          localStorage helpers
│       ├── shapes.jsx              SVG marker components
│       ├── hooks/
│       │   └── useResizable.js
│       └── components/
│           ├── PriceChart.jsx
│           ├── CustomLegend.jsx
│           ├── ChartTooltip.jsx
│           ├── DataTable.jsx
│           ├── RangeBar.jsx
│           └── StatsPanel.jsx
│
└── p4server/           Rust backend (optional but recommended)
    ├── Cargo.toml
    └── src/
        ├── main.rs     axum HTTP server
        └── parser.rs   fast log parser
```

### Why a Rust backend?

A large Prosperity log (50 MB+) takes ~2 seconds to parse in the browser. The Rust parser does the same work in ~15 ms. The dashboard works fully without it — the JS parser is always the fallback — but with `p4server` running you get instant load times and the heavy work stays off the UI thread.

### API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/api/files` | List `.json` files in `--log-dir` |
| `GET` | `/api/parse?file=<name>` | Parse a file from `--log-dir` |
| `POST` | `/api/parse-raw` | Parse JSON sent as request body |

Load routing in the frontend:

```
p4server online?
├─ YES → all three load methods (dropdown, file picker, URL fetch) POST to Rust
│         → JS parser used only as silent fallback if API call fails
└─ NO  → file picker and URL fetch use the JS parser directly
```

---

## Log file format

The visualizer expects the Prosperity 4 JSON format:

```json
{
  "submissionId": "...",
  "logs": [
    {
      "sandboxLog": "",
      "lambdaLog": "[[ts, \"\", listings, orderbook, fills, trades, positionMap], orders, ...]",
      "timestamp": 0
    }
  ],
  "activitiesLog": "day;timestamp;product;bid_price_1;bid_volume_1;...;mid_price;profit_and_loss\n...",
  "tradeHistory": [
    { "timestamp": 100, "buyer": "SUBMISSION", "seller": "", "symbol": "EMERALDS", "price": 9993.0, "quantity": 6 }
  ]
}
```

The `activitiesLog` CSV is semicolon-delimited and can have empty cells for missing depth levels — these are handled as `null` and don't break the charts.

---

## Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | comes with Node |
| Rust + Cargo | stable | [rustup.rs](https://rustup.rs) |

Rust is only needed if you want the fast backend. The frontend works standalone.

---

### macOS

```bash
# install Node (if needed)
brew install node

# install Rust (if needed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# clone the repo
git clone https://github.com/yourname/p4dashboard.git
cd p4dashboard

# frontend
cd p4dashboard
npm install

# backend (first build takes ~30s)
cd ../p4server
cargo build --release
```

---

### Linux (Ubuntu / Debian)

```bash
# Node via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# build backend
cd p4server
cargo build --release
```

---

### Windows

**Option A — WSL2 (recommended)**

Run everything inside WSL2 with the Linux instructions above. Access the dashboard at `http://localhost:5173` from your Windows browser normally.

**Option B — native Windows**

1. Install [Node.js](https://nodejs.org/en/download) (LTS installer)
2. Install [Rust](https://rustup.rs) (run `rustup-init.exe`)
3. Open PowerShell:

```powershell
cd p4dashboard
npm install

cd ..\p4server
cargo build --release
```

---

## Running

### Frontend only (no Rust)

```bash
cd p4dashboard
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Use **Load File** to pick a `.json` log from your filesystem.

---

### Frontend + Rust backend

Open two terminals:

```bash
# terminal 1 — Rust backend
cd p4server
cargo run --release -- --log-dir ../path/to/your/logs
# e.g: cargo run --release -- --log-dir ../submissions/sub_79

# terminal 2 — Vite frontend
cd p4dashboard
npm run dev
```

With the backend running you'll see **⬤ RUST** in green in the toolbar. The dropdown will list every `.json` file found in `--log-dir`.

`--log-dir` is optional. Without it the dropdown is empty but **Load File** and **Fetch URL** still use the Rust parser automatically when the server is online.

**Change the backend port** (default 3001):

```bash
cargo run --release -- --port 3002 --log-dir ./logs
```

If you change the port, also update `const API = "http://localhost:3001"` at the top of `p4dashboard/src/App.jsx`.

---

## Using the dashboard

### Loading a log

| Method | When to use |
|---|---|
| **Load (Rust)** dropdown | `p4server` is running and `--log-dir` points to your logs |
| **Load File** button | Pick any `.json` from your filesystem (uses Rust if online, JS if not) |
| **Fetch URL** box | Paste any `http://` URL to a log file; works with `python -m http.server` |

### Navigation

- **Drag on the global chart** to select a time window → local view zooms in
- **Drag the red handles** on the range bar to adjust the window
- **Type a timestamp** directly into the range bar inputs and press Enter
- **Click any legend item** to toggle that series; global and local legends are independent

### Reading the markers

| Marker | Meaning |
|---|---|
| Lime ▼ triangle | Your placed buy order (size = height) |
| Red ▲ triangle | Your placed sell order (size = height) |
| Neon green ● | Confirmed buy fill (size = radius) |
| Amber ● | Confirmed sell fill (size = radius) |
| Green dot on line | Market bid depth (local view, size = volume) |
| Red dot on line | Market ask depth (local view, size = volume) |

In the local view, your placed orders are always larger and brighter than the market depth dots so they're easy to distinguish even when they overlap.

### PnL curves

The combined `pnl` line and per-symbol `pnl SYMBOL` lines are **hidden by default** in both panels. Toggle them on from the legend. They plot on the price (left) axis — if your PnL range is much smaller than the price range, zoom into the local view for a cleaner read, or hide the price lines temporarily.

### Stats panel

The panel to the right of the global chart shows:

- **Portfolio** — total final PnL and total max drawdown across all symbols
- **Per symbol** — final PnL, max drawdown, PnL σ per tick (volatility of your P&L curve), fill rate (fills / ticks × 100), and buy/sell fill count

---

## Development

```bash
# frontend hot-reload
cd p4dashboard
npm run dev

# frontend production build
npm run build

# backend with debug logging
cd p4server
RUST_LOG=debug cargo run -- --log-dir ./logs

# backend release binary (fastest)
cargo build --release
./target/release/p4server --log-dir ./logs
```

### Adding a new signal or scatter to the charts

**Line signal** (e.g. your own EMA):

1. Add the field to each tick in `parser.js` (or `parser.rs` in the Rust backend):
   ```js
   pts[i].ema20 = computeEma(pts, i, 20);
   ```
2. Add an entry to `PRICE_SERIES` in `seriesConfig.js`:
   ```js
   { key:"ema20", label:"EMA 20", color:"#f0abfc", type:"line", dash:"4 2" }
   ```
3. Add the `<Line>` in `PriceChart.jsx`:
   ```jsx
   {!hidden.ema20 && <Line yAxisId="price" data={touch} dataKey="ema20" stroke="#f0abfc" dot={false} ... />}
   ```

**Scatter** (e.g. regime change markers):

```jsx
// in PriceChart.jsx, after the existing Scatter elements:
{!isHidden(hidden,"regime") && (
  <Scatter yAxisId="price"
    data={parsedData.regime?.[sym] || []}
    dataKey="price" fill="#e879f9"
    shape={<CircleDot fill="#e879f9" />}
    isAnimationActive={false} legendType="none" />
)}
```

Pass the `regime` array through `parsedData` the same way `fills` and `placedBids` are.

---

## Troubleshooting

**"p4server offline" even though I ran `cargo run`**

The frontend checks `http://localhost:3001/health`. Make sure:
- The port isn't taken by another process (`lsof -i :3001` on Mac/Linux)
- You're not blocking localhost requests with a browser extension
- The port in `App.jsx` (`const API = ...`) matches `--port`

**"Fetch failed: Got HTML instead of JSON"**

Your server returned an error page. Either:
- The URL path is wrong
- CORS headers are missing — run `python -m http.server 8000` in the directory with your logs and use `http://localhost:8000/filename.json`

**Charts are blank after loading**

The log parsed successfully but no symbol is selected. Check the symbol dropdown in the toolbar — it may be empty if `activitiesLog` in your file is missing or uses different column names than expected.

**Position plot has a gap at the start**

This happens when your algo doesn't output a position at timestamp 0. The parser automatically inserts a `{ts: minTs, pos: 0}` entry to fill the gap — if you still see it, the first lambdaLog entry may have a very high timestamp. This is cosmetic only.

**The Rust backend panics on startup**

Likely the `--log-dir` path doesn't exist. The server now starts without failing even if the directory is missing, but make sure you're pointing at a real path:
```bash
cargo run --release -- --log-dir .   # use current dir
```

---

## Contributing

Pull requests welcome. The main areas that would improve the dashboard:

- Watcher mode in `p4server` — inotify/FSEvents to auto-reload when a new log is written
- WebSocket push from the server so the UI updates live during a running simulation
- Multiple symbol panels side-by-side instead of the single-symbol dropdown
- Export to PNG / CSV from the local view