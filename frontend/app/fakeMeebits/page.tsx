"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import { TxStatus } from "@/components/TxStatus";
import { useWallet } from "@/components/WalletContext";
import rawVouchers from "@/data/output-sig.json";
import {
  CONTRACTS,
  SEPOLIA_CHAIN_ID,
  evaluatorAbi,
  fakeMeebitsAbi,
  fakeMeebitsClaimerAbi,
} from "@/lib/contracts";
import { useTxLifecycle } from "@/lib/useTxLifecycle";
import {
  etherscanAddressUrl,
  sepoliaPublicClient,
  shortenAddress,
} from "@/lib/viem";

interface SignedVoucher {
  tokenNumber: number;
  signature: Hex;
}

const VOUCHERS = rawVouchers as SignedVoucher[];

interface VoucherStatus extends SignedVoucher {
  claimed: boolean;
}

interface CollectionSnapshot {
  name: string;
  symbol: string;
  maxTokenId: bigint;
  vouchers: VoucherStatus[];
}

interface UserMeebitsState {
  address: Address;
  balance: bigint;
  ex3Completed: boolean;
}

export default function FakeMeebitsPage() {
  const { address, isSepolia, switchToSepolia, getWalletClient } = useWallet();
  const tx = useTxLifecycle();

  const [snapshot, setSnapshot] = useState<CollectionSnapshot | null>(null);
  const [userState, setUserState] = useState<UserMeebitsState | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  const [showClaimed, setShowClaimed] = useState(false);
  const [activeAction, setActiveAction] = useState<"claim" | "verify" | null>(
    null
  );

  const isTxBusy =
    tx.status === "awaiting_signature" || tx.status === "pending";

  // Fetches collection details and batch-checks claim status for all 100 signed vouchers.
  const fetchCollectionData =
    useCallback(async (): Promise<CollectionSnapshot> => {
      const [name, symbol, maxTokenId, claimResults] = await Promise.all([
        sepoliaPublicClient.readContract({
          address: CONTRACTS.fakeMeebits,
          abi: fakeMeebitsAbi,
          functionName: "name",
        }),
        sepoliaPublicClient.readContract({
          address: CONTRACTS.fakeMeebits,
          abi: fakeMeebitsAbi,
          functionName: "symbol",
        }),
        sepoliaPublicClient.readContract({
          address: CONTRACTS.fakeMeebitsClaimer,
          abi: fakeMeebitsClaimerAbi,
          functionName: "maxTokenId",
        }),
        sepoliaPublicClient.multicall({
          contracts: VOUCHERS.map((entry) => ({
            address: CONTRACTS.fakeMeebitsClaimer,
            abi: fakeMeebitsClaimerAbi,
            functionName: "tokensThatWereClaimed" as const,
            args: [BigInt(entry.tokenNumber)] as const,
          })),
        }),
      ]);

      const vouchers: VoucherStatus[] = VOUCHERS.map((entry, idx) => {
        const res = claimResults[idx];
        const claimed =
          res && res.status === "success" ? Boolean(res.result) : false;
        return { ...entry, claimed };
      });

      return { name, symbol, maxTokenId, vouchers };
    }, []);

  const fetchUserData = useCallback(async (targetAddress: Address) => {
    const [balance, ex3Completed] = await Promise.all([
      sepoliaPublicClient.readContract({
        address: CONTRACTS.fakeMeebits,
        abi: fakeMeebitsAbi,
        functionName: "balanceOf",
        args: [targetAddress],
      }),
      sepoliaPublicClient.readContract({
        address: CONTRACTS.evaluator,
        abi: evaluatorAbi,
        functionName: "exerciseProgression",
        args: [targetAddress, BigInt(3)],
      }),
    ]);

    return { address: targetAddress, balance, ex3Completed };
  }, []);

  // Load collection status even when disconnected, plus user data when connected.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [nextSnapshot, nextUser] = await Promise.all([
          fetchCollectionData(),
          address ? fetchUserData(address) : Promise.resolve(null),
        ]);

        if (!cancelled) {
          setSnapshot(nextSnapshot);
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
              : "Failed to read FakeMeebits contract data."
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
    setIsRefreshing(true);
    try {
      const [nextSnapshot, nextUser] = await Promise.all([
        fetchCollectionData(),
        address ? fetchUserData(address) : Promise.resolve(null),
      ]);
      setSnapshot(nextSnapshot);
      if (nextUser) {
        setUserState(nextUser);
      }
      setReadError(null);
    } catch (err) {
      setReadError(
        err instanceof Error
          ? err.message
          : "Failed to refresh FakeMeebits status."
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [address, fetchCollectionData, fetchUserData]);

  const unclaimedVouchers = snapshot
    ? snapshot.vouchers.filter((v) => !v.claimed)
    : [];
  const claimedCount = snapshot
    ? snapshot.vouchers.length - unclaimedVouchers.length
    : 0;

  // Default to the first unclaimed token ID; automatically advances after claiming.
  const selectedVoucher =
    unclaimedVouchers.find((v) => v.tokenNumber === selectedTokenId) ??
    unclaimedVouchers[0] ??
    null;

  // Claims the selected FakeMeebits token using its ECDSA voucher signature.
  const handleClaimMeebit = async () => {
    if (!address || !isSepolia || !selectedVoucher) return;
    setActiveAction("claim");
    await tx.runTx(async () => {
      const walletClient = getWalletClient();
      const { request } = await sepoliaPublicClient.simulateContract({
        address: CONTRACTS.fakeMeebitsClaimer,
        abi: fakeMeebitsClaimerAbi,
        functionName: "claimAToken",
        args: [BigInt(selectedVoucher.tokenNumber), selectedVoucher.signature],
        account: address,
      });
      return walletClient.writeContract(request);
    }, refreshAll);
    setActiveAction(null);
  };

  // Submits Exercise 3 on the Evaluator contract to earn 2 points.
  const handleVerifyExercise3 = async () => {
    if (!address || !isSepolia) return;
    setActiveAction("verify");
    await tx.runTx(async () => {
      const walletClient = getWalletClient();
      const { request } = await sepoliaPublicClient.simulateContract({
        address: CONTRACTS.evaluator,
        abi: evaluatorAbi,
        functionName: "ex3_claimedFakeMeebits",
        account: address,
      });
      return walletClient.writeContract(request);
    }, refreshAll);
    setActiveAction(null);
  };

  const currentUserState =
    address && userState?.address === address ? userState : null;

  const visibleVouchers = snapshot
    ? showClaimed
      ? snapshot.vouchers
      : unclaimedVouchers
    : [];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {snapshot ? snapshot.name : "FakeMeebits"}
          </h1>
          <div className="flex flex-wrap gap-3 font-mono text-xs text-zinc-500">
            <a
              href={etherscanAddressUrl(CONTRACTS.fakeMeebits)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              NFT: {shortenAddress(CONTRACTS.fakeMeebits)}
            </a>
            <a
              href={etherscanAddressUrl(CONTRACTS.fakeMeebitsClaimer)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              Claimer: {shortenAddress(CONTRACTS.fakeMeebitsClaimer)}
            </a>
          </div>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Signature-gated ERC721 collection on Sepolia. Pick an unclaimed token
          ID paired with its signed voucher from{" "}
          <code className="font-mono">output-sig.json</code> and submit it to{" "}
          <code className="font-mono">FakeMeebitsClaimer</code>.
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

      {/* Collection Stats */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Collection Stats</h2>
          <button
            type="button"
            onClick={refreshAll}
            disabled={isRefreshing}
            className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {isRefreshing ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Collection
            </dt>
            <dd className="mt-1 font-medium">
              {snapshot ? `${snapshot.name} (${snapshot.symbol})` : "..."}
            </dd>
          </div>

          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Signed Tokens Checked
            </dt>
            <dd className="mt-1 font-mono font-semibold">
              {snapshot
                ? `${snapshot.vouchers.length} (max ID: ${snapshot.maxTokenId.toString()})`
                : "..."}
            </dd>
          </div>

          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Unclaimed Available
            </dt>
            <dd className="mt-1 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
              {snapshot ? unclaimedVouchers.length : "..."}
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
      </section>

      {/* Claim & Evaluator Actions */}
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold">Claim with Signed Voucher</h2>

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
              Switch to Sepolia (Chain ID {SEPOLIA_CHAIN_ID}) to claim a
              FakeMeebits token or verify Exercise 3.
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

        {selectedVoucher ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                Selected Token ID: #{selectedVoucher.tokenNumber}
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Unclaimed
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              Matching ECDSA Signature:{" "}
              <code
                title={selectedVoucher.signature}
                className="font-mono text-zinc-800 dark:text-zinc-200"
              >
                {selectedVoucher.signature.slice(0, 18)}...
                {selectedVoucher.signature.slice(-14)}
              </code>
            </p>
          </div>
        ) : snapshot ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200">
            All {snapshot.vouchers.length} signed tokens in{" "}
            <code className="font-mono">output-sig.json</code> have already been
            claimed on Sepolia.
          </div>
        ) : (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Checking claim status for signed tokens...
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleClaimMeebit}
            disabled={!address || !isSepolia || !selectedVoucher || isTxBusy}
            className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isTxBusy && activeAction === "claim"
              ? tx.status === "awaiting_signature"
                ? "Confirm in Wallet..."
                : "Claiming..."
              : selectedVoucher
                ? `Claim FakeMeebits #${selectedVoucher.tokenNumber}`
                : "No Unclaimed Token Selected"}
          </button>

          <button
            type="button"
            onClick={handleVerifyExercise3}
            disabled={!address || !isSepolia || isTxBusy}
            className="cursor-pointer rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {isTxBusy && activeAction === "verify"
              ? tx.status === "awaiting_signature"
                ? "Confirm in Wallet..."
                : "Verifying..."
              : "Verify FakeMeebits on Evaluator (2 pts)"}
          </button>

          {currentUserState?.ex3Completed && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Exercise 3: Completed
            </span>
          )}
        </div>

        {/* Selectable Token ID Grid */}
        {snapshot && (
          <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Available Voucher Token IDs
              </h3>
              <button
                type="button"
                onClick={() => setShowClaimed((prev) => !prev)}
                className="cursor-pointer rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {showClaimed
                  ? `Hide Claimed (${claimedCount})`
                  : `Show Claimed (${claimedCount})`}
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {visibleVouchers.map((voucher) => {
                const isSelected =
                  selectedVoucher?.tokenNumber === voucher.tokenNumber;

                return (
                  <button
                    key={voucher.tokenNumber}
                    type="button"
                    disabled={voucher.claimed}
                    onClick={() => setSelectedTokenId(voucher.tokenNumber)}
                    title={
                      voucher.claimed
                        ? `Token #${voucher.tokenNumber} (already claimed)`
                        : `Select Token #${voucher.tokenNumber}`
                    }
                    className={`rounded-md border px-2 py-1.5 font-mono text-xs font-medium transition-colors ${
                      voucher.claimed
                        ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 line-through dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                        : isSelected
                          ? "cursor-pointer border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                          : "cursor-pointer border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    }`}
                  >
                    #{voucher.tokenNumber}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
