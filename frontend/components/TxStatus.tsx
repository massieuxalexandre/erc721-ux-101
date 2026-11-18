"use client";

import type { Hash } from "viem";
import type { TxLifecycleStatus } from "@/lib/useTxLifecycle";
import { etherscanTxUrl } from "@/lib/viem";

interface TxStatusProps {
  status: TxLifecycleStatus;
  txHash: Hash | null;
  error: string | null;
  onReset: () => void;
}

/**
 * Displays accessible status banners for the full transaction lifecycle.
 */
export function TxStatus({ status, txHash, error, onReset }: TxStatusProps) {
  if (status === "idle") {
    return null;
  }

  if (status === "awaiting_signature") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-100"
      >
        Waiting for wallet confirmation... Please approve the transaction in
        your wallet.
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100"
      >
        <span>
          Transaction submitted on Sepolia. Waiting for block confirmation...
        </span>
        {txHash && (
          <a
            href={etherscanTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline hover:no-underline"
          >
            View on Etherscan
          </a>
        )}
      </div>
    );
  }

  if (status === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-100"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">Transaction confirmed on Sepolia!</span>
          {txHash && (
            <a
              href={etherscanTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              View on Etherscan
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="cursor-pointer rounded px-2 py-0.5 text-xs font-medium underline hover:no-underline"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span>{error || "Transaction failed."}</span>
        {txHash && (
          <a
            href={etherscanTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline hover:no-underline"
          >
            View on Etherscan
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="cursor-pointer rounded px-2 py-0.5 text-xs font-medium underline hover:no-underline"
      >
        Dismiss
      </button>
    </div>
  );
}
