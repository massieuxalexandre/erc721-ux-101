"use client";

import { useCallback, useState } from "react";
import type { Hash } from "viem";
import { formatTxError } from "@/lib/errors";
import { sepoliaPublicClient } from "@/lib/viem";

export type TxLifecycleStatus =
  | "idle"
  | "awaiting_signature"
  | "pending"
  | "success"
  | "error";

interface UseTxLifecycleResult {
  status: TxLifecycleStatus;
  txHash: Hash | null;
  error: string | null;
  runTx: (
    sendTx: () => Promise<Hash>,
    onConfirmed?: () => Promise<void> | void
  ) => Promise<boolean>;
  reset: () => void;
}

/**
 * Reusable React hook that tracks a Sepolia write transaction through:
 * idle -> awaiting_signature -> pending -> success (or error).
 */
export function useTxLifecycle(): UseTxLifecycleResult {
  const [status, setStatus] = useState<TxLifecycleStatus>("idle");
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setTxHash(null);
    setError(null);
  }, []);

  const runTx = useCallback(
    async (
      sendTx: () => Promise<Hash>,
      onConfirmed?: () => Promise<void> | void
    ): Promise<boolean> => {
      setStatus("awaiting_signature");
      setTxHash(null);
      setError(null);

      try {
        // Step 1: Prompt the wallet to simulate/sign/broadcast the transaction.
        const hash = await sendTx();
        setTxHash(hash);
        setStatus("pending");

        // Step 2: Wait for on-chain inclusion on Sepolia.
        const receipt = await sepoliaPublicClient.waitForTransactionReceipt({
          hash,
        });

        if (receipt.status === "reverted") {
          throw new Error("Transaction was mined on Sepolia but reverted.");
        }

        // Step 3: Mark success and refresh any contract reads via callback.
        setStatus("success");
        if (onConfirmed) {
          await onConfirmed();
        }
        return true;
      } catch (err) {
        setError(formatTxError(err));
        setStatus("error");
        return false;
      }
    },
    []
  );

  return { status, txHash, error, runTx, reset };
}
