"use client";

import Link from "next/link";
import { useWallet } from "@/components/WalletContext";
import { SEPOLIA_CHAIN_HEX, SEPOLIA_CHAIN_ID } from "@/lib/contracts";

export default function WrongNetworkPage() {
  const {
    address,
    chainId,
    isSepolia,
    isConnecting,
    connectInjected,
    connectWalletConnect,
    switchToSepolia,
  } = useWallet();

  // Connected and already switched back to Sepolia: show confirmation + manual navigation links.
  if (address && isSepolia) {
    return (
      <div className="space-y-6">
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-100">
          <h1 className="text-xl font-bold">Connected to Sepolia</h1>
          <p className="mt-2 text-sm">
            Your wallet is now on Ethereum Sepolia (Chain ID {SEPOLIA_CHAIN_ID}
            ). You can continue to Chain Info or return to Home.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/chain-info"
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800"
            >
              Go to Chain Info
            </Link>
            <Link
              href="/"
              className="rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-100 dark:hover:bg-zinc-800"
            >
              Back to Home
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // Visited directly without a connected wallet.
  if (!address) {
    return (
      <div className="space-y-6">
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-bold">No Wallet Connected</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This dApp requires Ethereum Sepolia (Chain ID {SEPOLIA_CHAIN_ID}).
            Connect your wallet to check your network.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={connectInjected}
              disabled={isConnecting}
              className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isConnecting ? "Connecting..." : "Connect Browser Wallet"}
            </button>
            <button
              type="button"
              onClick={connectWalletConnect}
              disabled={isConnecting}
              className="cursor-pointer rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              WalletConnect QR
            </button>
            <Link
              href="/"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Back to Home
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // Connected on a non-Sepolia chain: display error alert + Switch to Sepolia button.
  return (
    <div className="space-y-6">
      <section
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-950 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100"
      >
        <h1 className="text-xl font-bold">Wrong Network Detected</h1>
        <p className="mt-2 text-sm">
          This workshop dApp only runs on the Ethereum Sepolia testnet. Please
          switch your wallet network to continue.
        </p>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-red-200 bg-white/80 p-3 dark:border-red-900/50 dark:bg-zinc-900/80">
            <dt className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
              Current Chain ID
            </dt>
            <dd className="mt-1 font-mono font-semibold">
              {chainId ?? "Unknown"}
            </dd>
          </div>

          <div className="rounded-md border border-red-200 bg-white/80 p-3 dark:border-red-900/50 dark:bg-zinc-900/80">
            <dt className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
              Required Network
            </dt>
            <dd className="mt-1 font-mono font-semibold">
              Sepolia ({SEPOLIA_CHAIN_ID} / {SEPOLIA_CHAIN_HEX})
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={switchToSepolia}
            className="cursor-pointer rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800"
          >
            Switch to Sepolia
          </button>
          <Link
            href="/"
            className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-900 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-zinc-900 dark:text-red-100 dark:hover:bg-zinc-800"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </div>
  );
}
