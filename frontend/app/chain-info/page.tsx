"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletContext";
import { SEPOLIA_CHAIN_HEX, SEPOLIA_CHAIN_ID } from "@/lib/contracts";
import { etherscanAddressUrl, sepoliaPublicClient } from "@/lib/viem";

export default function ChainInfoPage() {
  const router = useRouter();
  const {
    address,
    ensName,
    chainId,
    isSepolia,
    isConnecting,
    connectInjected,
    connectWalletConnect,
  } = useWallet();

  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isWrongNetwork = chainId !== null && !isSepolia;

  // Redirect immediately to /wrong-network whenever a connected wallet is not on Sepolia.
  useEffect(() => {
    if (isWrongNetwork) {
      router.replace("/wrong-network");
    }
  }, [isWrongNetwork, router]);

  // Fetches the latest Sepolia block number from our viem PublicClient.
  const fetchBlockNumber = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const latestBlock = await sepoliaPublicClient.getBlockNumber();
      setBlockNumber(latestBlock);
      setBlockError(null);
    } catch (err) {
      setBlockError(
        err instanceof Error
          ? err.message
          : "Failed to fetch the latest Sepolia block number."
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Load on mount (when connected on Sepolia) and poll every 12 seconds (~1 Ethereum block).
  useEffect(() => {
    if (!address || !isSepolia) {
      return;
    }

    let cancelled = false;

    async function loadInitialAndPoll() {
      try {
        const latestBlock = await sepoliaPublicClient.getBlockNumber();
        if (!cancelled) {
          setBlockNumber(latestBlock);
          setBlockError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setBlockError(
            err instanceof Error
              ? err.message
              : "Failed to fetch the latest Sepolia block number."
          );
        }
      }
    }

    void loadInitialAndPoll();
    const intervalId = setInterval(() => {
      void loadInitialAndPoll();
    }, 12_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [address, isSepolia]);

  // Avoid flashing chain-info content while Next.js navigates to /wrong-network.
  if (isWrongNetwork) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
        Wrong network detected (chain ID {chainId}). Redirecting to{" "}
        <code className="font-mono">/wrong-network</code>...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Chain Info</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Displays the active Sepolia network ID, the latest Sepolia block
          number, and your connected wallet address.
        </p>
      </section>

      {!address ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">Wallet Not Connected</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Connect your wallet to verify that you are on Sepolia (
            {SEPOLIA_CHAIN_ID}) and inspect your active chain details.
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
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Sepolia Network Details</h2>
            <button
              type="button"
              onClick={fetchBlockNumber}
              disabled={isRefreshing}
              className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {isRefreshing ? "Refreshing..." : "Refresh Block"}
            </button>
          </div>

          <dl className="grid grid-cols-1 gap-4 text-sm">
            <div className="rounded-md border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Chain ID
              </dt>
              <dd className="mt-1 font-mono font-medium text-emerald-700 dark:text-emerald-400">
                {SEPOLIA_CHAIN_ID} ({SEPOLIA_CHAIN_HEX}) - Sepolia
              </dd>
            </div>

            <div className="rounded-md border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Latest Block Number
              </dt>
              <dd className="mt-1 font-mono font-medium">
                {blockError ? (
                  <span className="text-red-600 dark:text-red-400">
                    Error: {blockError}
                  </span>
                ) : blockNumber !== null ? (
                  <span>#{blockNumber.toLocaleString()}</span>
                ) : (
                  <span className="text-zinc-500">Loading latest block...</span>
                )}
              </dd>
            </div>

            <div className="rounded-md border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Connected User Address
              </dt>
              <dd className="mt-1 break-all font-mono">
                <a
                  href={etherscanAddressUrl(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={address}
                  className="underline hover:no-underline"
                >
                  {ensName ?? address}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
