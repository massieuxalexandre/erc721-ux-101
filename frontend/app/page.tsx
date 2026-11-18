"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits, type Address } from "viem";
import { TxStatus } from "@/components/TxStatus";
import { useWallet } from "@/components/WalletContext";
import {
  CONTRACTS,
  SEPOLIA_CHAIN_ID,
  evaluatorAbi,
  tdTokenAbi,
} from "@/lib/contracts";
import { useTxLifecycle } from "@/lib/useTxLifecycle";
import {
  etherscanAddressUrl,
  sepoliaPublicClient,
  shortenAddress,
} from "@/lib/viem";

type EvaluatorWriteFn =
  | "submitExercise"
  | "ex1_claimedFakeBAYC"
  | "ex2_boughtFakeNefturians"
  | "ex3_claimedFakeMeebits";

interface ExerciseItem {
  id: 0 | 1 | 2 | 3;
  title: string;
  description: string;
  points: number;
  functionName: EvaluatorWriteFn;
  buttonLabel: string;
  collectionHref?: string;
  collectionLabel?: string;
}

const EXERCISES: ExerciseItem[] = [
  {
    id: 0,
    title: "Exercise 0: Register Submission",
    description:
      "Call submitExercise() on the Evaluator contract to register your wallet and earn your first points.",
    points: 2,
    functionName: "submitExercise",
    buttonLabel: "Submit Exercise",
  },
  {
    id: 1,
    title: "Exercise 1: Claim a FakeBAYC",
    description:
      "Claim at least 1 FakeBAYC token, then verify ownership on the Evaluator contract.",
    points: 2,
    functionName: "ex1_claimedFakeBAYC",
    buttonLabel: "Verify FakeBAYC",
    collectionHref: "/fakeBayc",
    collectionLabel: "Open FakeBAYC",
  },
  {
    id: 2,
    title: "Exercise 2: Buy a FakeNefturians",
    description:
      "Buy at least 1 FakeNefturians token, then verify ownership on the Evaluator contract.",
    points: 2,
    functionName: "ex2_boughtFakeNefturians",
    buttonLabel: "Verify FakeNefturians",
    collectionHref: "/fakeNefturians",
    collectionLabel: "Open FakeNefturians",
  },
  {
    id: 3,
    title: "Exercise 3: Claim a FakeMeebits",
    description:
      "Claim at least 1 FakeMeebits token with a signed voucher, then verify ownership on the Evaluator.",
    points: 2,
    functionName: "ex3_claimedFakeMeebits",
    buttonLabel: "Verify FakeMeebits",
    collectionHref: "/fakeMeebits",
    collectionLabel: "Open FakeMeebits",
  },
];

interface EvaluatorSnapshot {
  address: Address;
  balanceFormatted: string;
  symbol: string;
  hasSubmitted: boolean;
  progression: [boolean, boolean, boolean, boolean];
}

export default function HomePage() {
  const {
    address,
    ensName,
    chainId,
    providerType,
    isConnecting,
    isSepolia,
    connectInjected,
    connectWalletConnect,
    switchToSepolia,
    disconnect,
    getWalletClient,
  } = useWallet();

  const tx = useTxLifecycle();
  const [snapshot, setSnapshot] = useState<EvaluatorSnapshot | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState<number | null>(null);

  const isTxBusy =
    tx.status === "awaiting_signature" || tx.status === "pending";

  // Queries TD token balance and all 4 exercise flags from Sepolia for the connected address.
  const fetchEvaluatorData = useCallback(async (targetAddress: Address) => {
    const [balance, decimals, symbol, hasSubmitted, progression] =
      await Promise.all([
        sepoliaPublicClient.readContract({
          address: CONTRACTS.tdToken,
          abi: tdTokenAbi,
          functionName: "balanceOf",
          args: [targetAddress],
        }),
        sepoliaPublicClient.readContract({
          address: CONTRACTS.tdToken,
          abi: tdTokenAbi,
          functionName: "decimals",
        }),
        sepoliaPublicClient.readContract({
          address: CONTRACTS.tdToken,
          abi: tdTokenAbi,
          functionName: "symbol",
        }),
        sepoliaPublicClient.readContract({
          address: CONTRACTS.evaluator,
          abi: evaluatorAbi,
          functionName: "hasSubmitted",
          args: [targetAddress],
        }),
        Promise.all(
          [0, 1, 2, 3].map((id) =>
            sepoliaPublicClient.readContract({
              address: CONTRACTS.evaluator,
              abi: evaluatorAbi,
              functionName: "exerciseProgression",
              args: [targetAddress, BigInt(id)],
            })
          )
        ),
      ]);

    return {
      address: targetAddress,
      balanceFormatted: formatUnits(balance, decimals),
      symbol,
      hasSubmitted,
      progression: [
        Boolean(progression[0]),
        Boolean(progression[1]),
        Boolean(progression[2]),
        Boolean(progression[3]),
      ] as [boolean, boolean, boolean, boolean],
    };
  }, []);

  // Load Evaluator state whenever the connected wallet address changes.
  useEffect(() => {
    if (!address) {
      return;
    }

    let cancelled = false;
    const currentAddress = address;

    async function load() {
      try {
        const nextSnapshot = await fetchEvaluatorData(currentAddress);
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setReadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setReadError(
            err instanceof Error
              ? err.message
              : "Failed to read Evaluator contract data from Sepolia."
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, fetchEvaluatorData]);

  const handleRefresh = useCallback(async () => {
    if (!address) return;
    setIsRefreshing(true);
    try {
      const nextSnapshot = await fetchEvaluatorData(address);
      setSnapshot(nextSnapshot);
      setReadError(null);
    } catch (err) {
      setReadError(
        err instanceof Error
          ? err.message
          : "Failed to refresh Evaluator contract data."
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [address, fetchEvaluatorData]);

  // Simulates and sends an Evaluator write transaction, then refreshes balances on confirmation.
  const handleRunExercise = async (exercise: ExerciseItem) => {
    if (!address || !isSepolia) return;

    setActiveExerciseId(exercise.id);
    await tx.runTx(
      async () => {
        const walletClient = getWalletClient();
        const { request } = await sepoliaPublicClient.simulateContract({
          address: CONTRACTS.evaluator,
          abi: evaluatorAbi,
          functionName: exercise.functionName,
          account: address,
        });
        return walletClient.writeContract(request);
      },
      async () => {
        const nextSnapshot = await fetchEvaluatorData(address);
        setSnapshot(nextSnapshot);
        setReadError(null);
      }
    );
    setActiveExerciseId(null);
  };

  // Only show snapshot data that belongs to the currently connected address.
  const currentSnapshot =
    address && snapshot?.address === address ? snapshot : null;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">
          ERC721 UX 101 Dashboard
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your wallet on Ethereum Sepolia, track your{" "}
          <code className="font-mono">TD-ERC721-UX-101</code> workshop points,
          and complete each ERC721 exercise.
        </p>
      </section>

      {/* Wallet Summary Card */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Wallet Summary</h2>
            {address ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <a
                  href={etherscanAddressUrl(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={address}
                  className="font-mono font-medium underline hover:no-underline"
                >
                  {ensName ?? shortenAddress(address)}
                </a>
                <span className="text-zinc-400">|</span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {providerType === "walletconnect"
                    ? "WalletConnect v2"
                    : "Browser Wallet"}
                </span>
                <span className="text-zinc-400">|</span>
                {isSepolia ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Sepolia ({SEPOLIA_CHAIN_ID})
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Wrong Network ({chainId ?? "?"})
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No wallet connected yet. Connect via browser extension or
                WalletConnect QR to get started.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!address ? (
              <>
                <button
                  type="button"
                  onClick={connectInjected}
                  disabled={isConnecting}
                  className="cursor-pointer rounded-md bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {isConnecting ? "Connecting..." : "Connect Browser Wallet"}
                </button>
                <button
                  type="button"
                  onClick={connectWalletConnect}
                  disabled={isConnecting}
                  className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  WalletConnect QR
                </button>
              </>
            ) : (
              <>
                {!isSepolia && (
                  <button
                    type="button"
                    onClick={switchToSepolia}
                    className="cursor-pointer rounded-md bg-amber-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                  >
                    Switch to Sepolia
                  </button>
                )}
                <button
                  type="button"
                  onClick={disconnect}
                  className="cursor-pointer rounded-md border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 text-xs dark:border-zinc-800">
          <Link
            href="/chain-info"
            className="rounded-md bg-zinc-100 px-2.5 py-1.5 font-medium text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Chain Info
          </Link>
          <Link
            href="/fakeBayc"
            className="rounded-md bg-zinc-100 px-2.5 py-1.5 font-medium text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            FakeBAYC
          </Link>
          <Link
            href="/fakeNefturians"
            className="rounded-md bg-zinc-100 px-2.5 py-1.5 font-medium text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            FakeNefturians
          </Link>
          <Link
            href="/fakeMeebits"
            className="rounded-md bg-zinc-100 px-2.5 py-1.5 font-medium text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            FakeMeebits
          </Link>
        </div>
      </section>

      {/* Evaluator & Points Section */}
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Evaluator &amp; Points (TD-ERC721-UX-101)
            </h2>
            <p className="text-xs text-zinc-500">
              Evaluator:{" "}
              <a
                href={etherscanAddressUrl(CONTRACTS.evaluator)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline hover:no-underline"
              >
                {shortenAddress(CONTRACTS.evaluator)}
              </a>{" "}
              | Token:{" "}
              <a
                href={etherscanAddressUrl(CONTRACTS.tdToken)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline hover:no-underline"
              >
                {shortenAddress(CONTRACTS.tdToken)}
              </a>
            </p>
          </div>

          {address && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <span className="text-zinc-500">Registered: </span>
                <span className="font-medium">
                  {currentSnapshot
                    ? currentSnapshot.hasSubmitted
                      ? "Yes"
                      : "No"
                    : "..."}
                </span>
              </div>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <span className="text-zinc-500">Balance: </span>
                <span className="font-mono font-semibold">
                  {currentSnapshot
                    ? `${currentSnapshot.balanceFormatted} ${currentSnapshot.symbol}`
                    : "Loading..."}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          )}
        </div>

        <TxStatus
          status={tx.status}
          txHash={tx.txHash}
          error={tx.error}
          onReset={tx.reset}
        />

        {readError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
          >
            {readError}
          </div>
        )}

        {address && !isSepolia && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100"
          >
            <span>
              Switch to Sepolia (Chain ID {SEPOLIA_CHAIN_ID}) to submit
              exercises and earn points.
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

        {!address ? (
          <p className="rounded-md border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            Connect your wallet above to view your Evaluator progression and
            submit exercises.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {EXERCISES.map((exercise) => {
              const completed =
                currentSnapshot?.progression[exercise.id] ?? false;
              const isThisExerciseBusy =
                isTxBusy && activeExerciseId === exercise.id;

              return (
                <article
                  key={exercise.id}
                  className="flex flex-col justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold">
                        {exercise.title}
                      </h3>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          completed
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {completed ? "Completed" : "Pending"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {exercise.description}
                    </p>
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      Reward: {exercise.points} pts
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRunExercise(exercise)}
                      disabled={!isSepolia || isTxBusy}
                      className="cursor-pointer rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                      {isThisExerciseBusy
                        ? tx.status === "awaiting_signature"
                          ? "Confirm in Wallet..."
                          : "Confirming..."
                        : `${exercise.buttonLabel} (${exercise.points} pts)`}
                    </button>

                    {exercise.collectionHref && exercise.collectionLabel && (
                      <Link
                        href={exercise.collectionHref}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {exercise.collectionLabel}
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
