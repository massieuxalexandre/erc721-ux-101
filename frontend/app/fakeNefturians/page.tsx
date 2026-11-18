"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatEther, isAddress, type Address } from "viem";
import { TxStatus } from "@/components/TxStatus";
import { useWallet } from "@/components/WalletContext";
import {
  CONTRACTS,
  SEPOLIA_CHAIN_ID,
  evaluatorAbi,
  fakeNefturiansAbi,
} from "@/lib/contracts";
import { useTxLifecycle } from "@/lib/useTxLifecycle";
import {
  etherscanAddressUrl,
  sepoliaPublicClient,
  shortenAddress,
} from "@/lib/viem";

interface CollectionInfo {
  name: string;
  symbol: string;
  tokenCounter: bigint;
  tokenPrice: bigint;
}

interface UserCollectionState {
  address: Address;
  balance: bigint;
  ex2Completed: boolean;
}

export default function FakeNefturiansPage() {
  const router = useRouter();
  const { address, isSepolia, switchToSepolia, getWalletClient } = useWallet();
  const tx = useTxLifecycle();

  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [userState, setUserState] = useState<UserCollectionState | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"buy" | "verify" | null>(
    null
  );

  // Address lookup form state.
  const [lookupInput, setLookupInput] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);

  const isTxBusy =
    tx.status === "awaiting_signature" || tx.status === "pending";

  const fetchCollectionData = useCallback(async () => {
    const [name, symbol, tokenCounter, tokenPrice] = await Promise.all([
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeNefturians,
        abi: fakeNefturiansAbi,
        functionName: "name",
      }),
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeNefturians,
        abi: fakeNefturiansAbi,
        functionName: "symbol",
      }),
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeNefturians,
        abi: fakeNefturiansAbi,
        functionName: "tokenCounter",
      }),
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeNefturians,
        abi: fakeNefturiansAbi,
        functionName: "tokenPrice",
      }),
    ]);

    return { name, symbol, tokenCounter, tokenPrice };
  }, []);

  const fetchUserData = useCallback(async (targetAddress: Address) => {
    const [balance, ex2Completed] = await Promise.all([
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeNefturians,
        abi: fakeNefturiansAbi,
        functionName: "balanceOf",
        args: [targetAddress],
      }),
      sepoliaPublicClient.readContract({
        address: CONTRACTS.evaluator,
        abi: evaluatorAbi,
        functionName: "exerciseProgression",
        args: [targetAddress, BigInt(2)],
      }),
    ]);

    return { address: targetAddress, balance, ex2Completed };
  }, []);

  // Load collection data even when disconnected, and user data when connected.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [nextCollection, nextUser] = await Promise.all([
          fetchCollectionData(),
          address ? fetchUserData(address) : Promise.resolve(null),
        ]);

        if (!cancelled) {
          setCollection(nextCollection);
          if (nextUser) {
            setUserState(nextUser);
          }
          setReadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setReadError(
            err instanceof Error
              ? err.message
              : "Failed to read FakeNefturians contract data."
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, fetchCollectionData, fetchUserData]);

  const refreshAll = useCallback(async () => {
    const [nextCollection, nextUser] = await Promise.all([
      fetchCollectionData(),
      address ? fetchUserData(address) : Promise.resolve(null),
    ]);
    setCollection(nextCollection);
    if (nextUser) {
      setUserState(nextUser);
    }
    setReadError(null);
  }, [address, fetchCollectionData, fetchUserData]);

  // Purchases a FakeNefturians token by sending `tokenPrice` ETH to buyAToken().
  const handleBuyToken = async () => {
    if (!address || !isSepolia || !collection) return;
    setActiveAction("buy");
    await tx.runTx(async () => {
      const walletClient = getWalletClient();
      const { request } = await sepoliaPublicClient.simulateContract({
        address: CONTRACTS.fakeNefturians,
        abi: fakeNefturiansAbi,
        functionName: "buyAToken",
        value: collection.tokenPrice,
        account: address,
      });
      return walletClient.writeContract(request);
    }, refreshAll);
    setActiveAction(null);
  };

  // Submits Exercise 2 on the Evaluator contract to earn 2 points.
  const handleVerifyExercise2 = async () => {
    if (!address || !isSepolia) return;
    setActiveAction("verify");
    await tx.runTx(async () => {
      const walletClient = getWalletClient();
      const { request } = await sepoliaPublicClient.simulateContract({
        address: CONTRACTS.evaluator,
        abi: evaluatorAbi,
        functionName: "ex2_boughtFakeNefturians",
        account: address,
      });
      return walletClient.writeContract(request);
    }, refreshAll);
    setActiveAction(null);
  };

  const handleAddressLookup = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = lookupInput.trim();
    if (!isAddress(trimmed)) {
      setLookupError("Enter a valid Ethereum address (0x...).");
      return;
    }
    setLookupError(null);
    router.push(`/fakeNefturians/${trimmed}`);
  };

  const currentUserState =
    address && userState?.address === address ? userState : null;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {collection ? collection.name : "FakeNefturians"}
          </h1>
          <a
            href={etherscanAddressUrl(CONTRACTS.fakeNefturians)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-zinc-500 underline hover:no-underline"
          >
            Contract: {shortenAddress(CONTRACTS.fakeNefturians)}
          </a>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Payable ERC721Enumerable collection on Sepolia. Purchase a token for{" "}
          {collection ? `${formatEther(collection.tokenPrice)} ETH` : "..."} and
          inspect owned token IDs by address.
        </p>
      </section>

      {readError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
        >
          {readError}
        </div>
      )}

      {/* Collection Overview */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="mb-4 text-lg font-semibold">Collection Stats</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Collection
            </dt>
            <dd className="mt-1 font-medium">
              {collection ? `${collection.name} (${collection.symbol})` : "..."}
            </dd>
          </div>

          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Token Price
            </dt>
            <dd className="mt-1 font-mono font-semibold">
              {collection ? `${formatEther(collection.tokenPrice)} ETH` : "..."}
            </dd>
          </div>

          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Total Minted (tokenCounter)
            </dt>
            <dd className="mt-1 font-mono font-semibold">
              {collection ? collection.tokenCounter.toString() : "..."}
            </dd>
          </div>

          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Your Balance
            </dt>
            <dd className="mt-1 font-mono font-semibold">
              {!address
                ? "Connect wallet"
                : currentUserState
                  ? currentUserState.balance.toString()
                  : "..."}
            </dd>
          </div>
        </dl>

        {/* Actions */}
        <div className="mt-6 space-y-4">
          <TxStatus
            status={tx.status}
            txHash={tx.txHash}
            error={tx.error}
            onReset={tx.reset}
          />

          {address && !isSepolia && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100"
            >
              <span>
                Switch to Sepolia (Chain ID {SEPOLIA_CHAIN_ID}) to buy a token
                or verify Exercise 2.
              </span>
              <button
                type="button"
                onClick={switchToSepolia}
                className="cursor-pointer rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
              >
                Switch to Sepolia
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBuyToken}
              disabled={!address || !isSepolia || !collection || isTxBusy}
              className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isTxBusy && activeAction === "buy"
                ? tx.status === "awaiting_signature"
                  ? "Confirm in Wallet..."
                  : "Buying..."
                : collection
                  ? `Buy a FakeNefturians Token (${formatEther(collection.tokenPrice)} ETH)`
                  : "Buy a FakeNefturians Token"}
            </button>

            <button
              type="button"
              onClick={handleVerifyExercise2}
              disabled={!address || !isSepolia || isTxBusy}
              className="cursor-pointer rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {isTxBusy && activeAction === "verify"
                ? tx.status === "awaiting_signature"
                  ? "Confirm in Wallet..."
                  : "Verifying..."
                : "Verify FakeNefturians on Evaluator (2 pts)"}
            </button>

            {currentUserState?.ex2Completed && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Exercise 2: Completed
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Owner Token Lookup */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Inspect Tokens by Owner</h2>
          {address && (
            <Link
              href={`/fakeNefturians/${address}`}
              className="text-xs font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-100"
            >
              View My Tokens
            </Link>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Enter any Ethereum address to list all FakeNefturians token IDs owned
          by that wallet.
        </p>
        <form onSubmit={handleAddressLookup} className="mt-4 flex gap-2">
          <label htmlFor="fakenefturians-owner-address" className="sr-only">
            Owner Address
          </label>
          <input
            id="fakenefturians-owner-address"
            type="text"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            placeholder="0x..."
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="shrink-0 cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            View Tokens
          </button>
        </form>
        {lookupError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {lookupError}
          </p>
        )}
      </section>
    </div>
  );
}
