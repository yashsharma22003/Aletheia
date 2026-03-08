# Aletheia Frontend

## Project Overview

The Aletheia frontend is a React-based web application for interacting with the Aletheia ZK compliance protocol. It provides the **Treasury** for employers to mint cheques, and the **Claim Terminal** for the Prover (generating ZK Proofs) and the Claimant (redeeming funds).

## Tech Stack

- **Vite** — Build tool & dev server
- **TypeScript** — Type-safe JavaScript
- **React** — UI framework
- **Wagmi / Viem** — Web3 Hooks and Ethereum interaction
- **shadcn/ui & Tailwind CSS** — Component library and utility styling

## Getting Started

Make sure you have Node.js & npm installed (v18+ recommended).

### 1. Installation

Navigate to the frontend directory and install dependencies:

```bash
cd frontend
npm install
```

### 2. Environment Variables

If your configuration requires custom RPC URLs or WalletConnect Project IDs, you should configure them or export them in your environment. Currently, the config falls back to public RPCs for Testnets and uses a default WalletConnect ID for testing.

```bash
cp .env.example .env # If applicable
```

### 3. Start Development Server

Start the local vite dev server:

```bash
npm run dev
```

The app will be available at `http://localhost:8080` (or `http://localhost:5173` depending on Vite default).

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build the application for production |
| `npm run lint` | Run ESLint to catch errors |
| `npm run test` | Run tests |

## Deployment

Build the production bundle with `npm run build`. This generates a `dist/` folder containing static files that can be served via Vercel, Netlify, or any standard static file host.
