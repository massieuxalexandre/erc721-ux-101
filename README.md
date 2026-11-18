# ERC721 UX 101

Simple Sepolia dApp built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **viem**, **@walletconnect/ethereum-provider**, and **SWR** (no `wagmi`, RainbowKit, or Web3Modal).

## Prerequisites

- Node.js 20+ and npm
- A browser wallet (Rabby, MetaMask, etc.) and/or a mobile wallet supporting WalletConnect v2
- A Sepolia RPC URL (Alchemy, Infura, etc.)
- A WalletConnect / Reown Project ID (32-character hex ID from [dashboard.reown.com](https://dashboard.reown.com/))

## Quick Start

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
NEXT_PUBLIC_WC_PROJECT_ID=YOUR_32_CHAR_PROJECT_ID
```

3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

To test the production build:

```bash
npm run build
npm run start
```

