"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAddress, type Address } from "viem";
import { TxStatus } from "@/components/TxStatus";
import { useWallet } from "@/components/WalletContext";
import {
  CONTRACTS,
  SEPOLIA_CHAIN_ID,
  evaluatorAbi,
  fakeBAYCAbi,
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
}

interface UserCollectionState {
  address: Address;
  balance: bigint;
  ex1Completed: boolean;
}

export default function FakeBaycPage() {
  const router = useRouter();
  const { address, isSepolia, switchToSepolia, getWalletClient } = useWallet();
  const tx = useTxLifecycle();

  const [collection, setCollection] = useState<CollectionInfo | null>(null);
  const [userState, setUserState] = useState<UserCollectionState | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"claim" | "verify" | null>(
    null
  );

  // Quick lookup form states.
  const [tokenIdInput, setTokenIdInput] = useState("0");
  const [tokenIdError, setTokenIdError] = useState<string | null>(null);
  const [galleryAddressInput, setGalleryAddressInput] = useState("");
  const [galleryAddressError, setGalleryAddressError] = useState<string | null>(
    null
  );

  const isTxBusy =
    tx.status === "awaiting_signature" || tx.status === "pending";

  const fetchCollectionData = useCallback(async () => {
    const [name, symbol, tokenCounter] = await Promise.all([
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeBAYC,
        abi: fakeBAYCAbi,
        functionName: "name",
      }),
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeBAYC,
        abi: fakeBAYCAbi,
        functionName: "symbol",
      }),
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeBAYC,
        abi: fakeBAYCAbi,
        functionName: "tokenCounter",
      }),
    ]);

    return { name, symbol, tokenCounter };
  }, []);

  const fetchUserData = useCallback(async (targetAddress: Address) => {
    const [balance, ex1Completed] = await Promise.all([
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeBAYC,
        abi: fakeBAYCAbi,
        functionName: "balanceOf",
        args: [targetAddress],
      }),
      sepoliaPublicClient.readContract({
        address: CONTRACTS.evaluator,
        abi: evaluatorAbi,
        functionName: "exerciseProgression",
        args: [targetAddress, BigInt(1)],
      }),
    ]);

    return { address: targetAddress, balance, ex1Completed };
  }, []);

  // Load collection metadata even when disconnected, and user data when connected.
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
              : "Failed to read FakeBAYC contract data."
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

  // Mints a new FakeBAYC token to the connected user via claimAToken().
  const handleClaimToken = async () => {
    if (!address || !isSepolia) return;
    setActiveAction("claim");
    await tx.runTx(async () => {
      const walletClient = getWalletClient();
      const { request } = await sepoliaPublicClient.simulateContract({
        address: CONTRACTS.fakeBAYC,
        abi: fakeBAYCAbi,
        functionName: "claimAToken",
        account: address,
      });
      return walletClient.writeContract(request);
    }, refreshAll);
    setActiveAction(null);
  };

  // Submits Exercise 1 on the Evaluator contract to claim 2 points.
  const handleVerifyExercise1 = async () => {
    if (!address || !isSepolia) return;
    setActiveAction("verify");
    await tx.runTx(async () => {
      const walletClient = getWalletClient();
      const { request } = await sepoliaPublicClient.simulateContract({
        address: CONTRACTS.evaluator,
        abi: evaluatorAbi,
        functionName: "ex1_claimedFakeBAYC",
        account: address,
      });
      return walletClient.writeContract(request);
    }, refreshAll);
    setActiveAction(null);
  };

  const handleTokenLookup = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = tokenIdInput.trim();
    if (!/^\d+$/.test(trimmed)) {
      setTokenIdError("Enter a valid non-negative integer token ID.");
      return;
    }
    setTokenIdError(null);
    router.push(`/fakeBayc/${trimmed}`);
  };

  const handleGalleryLookup = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = galleryAddressInput.trim();
    if (!isAddress(trimmed)) {
      setGalleryAddressError("Enter a valid Ethereum address (0x...).");
      return;
    }
    setGalleryAddressError(null);
    router.push(`/fakeBayc/gallery/${trimmed}`);
  };

  const currentUserState =
    address && userState?.address === address ? userState : null;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {collection ? collection.name : "FakeBAYC"}
          </h1>
          <a
            href={etherscanAddressUrl(CONTRACTS.fakeBAYC)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-zinc-500 underline hover:no-underline"
          >
            Contract: {shortenAddress(CONTRACTS.fakeBAYC)}
          </a>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          ERC721Enumerable collection on Sepolia. Claim a free token and inspect
          on-chain IPFS metadata and galleries.
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
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
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
                Switch to Sepolia (Chain ID {SEPOLIA_CHAIN_ID}) to claim a token
                or verify Exercise 1.
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
              onClick={handleClaimToken}
              disabled={!address || !isSepolia || isTxBusy}
              className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isTxBusy && activeAction === "claim"
                ? tx.status === "awaiting_signature"
                  ? "Confirm in Wallet..."
                  : "Claiming..."
                : "Claim a FakeBAYC Token"}
            </button>

            <button
              type="button"
              onClick={handleVerifyExercise1}
              disabled={!address || !isSepolia || isTxBusy}
              className="cursor-pointer rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {isTxBusy && activeAction === "verify"
                ? tx.status === "awaiting_signature"
                  ? "Confirm in Wallet..."
                  : "Verifying..."
                : "Verify FakeBAYC on Evaluator (2 pts)"}
            </button>

            {currentUserState?.ex1Completed && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Exercise 1: Completed
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Navigation: Token Viewer & Gallery */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-base font-semibold">Inspect a Token by ID</h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            View owner, IPFS image, and traits for any FakeBAYC token ID.
          </p>
          <form onSubmit={handleTokenLookup} className="mt-4 flex gap-2">
            <label htmlFor="fakebayc-token-id" className="sr-only">
              Token ID
            </label>
            <input
              id="fakebayc-token-id"
              type="text"
              inputMode="numeric"
              value={tokenIdInput}
              onChange={(e) => setTokenIdInput(e.target.value)}
              placeholder="e.g. 0"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              className="shrink-0 cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              View Token
            </button>
          </form>
          {tokenIdError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {tokenIdError}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Browse Owner Gallery</h2>
            {address && (
              <Link
                href={`/fakeBayc/gallery/${address}`}
                className="text-xs font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-100"
              >
                View My Gallery
              </Link>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Enter any Ethereum address to inspect all FakeBAYC tokens it owns.
          </p>
          <form onSubmit={handleGalleryLookup} className="mt-4 flex gap-2">
            <label htmlFor="fakebayc-gallery-address" className="sr-only">
              Owner Address
            </label>
            <input
              id="fakebayc-gallery-address"
              type="text"
              value={galleryAddressInput}
              onChange={(e) => setGalleryAddressInput(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button
              type="submit"
              className="shrink-0 cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Open Gallery
            </button>
          </form>
          {galleryAddressError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {galleryAddressError}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
