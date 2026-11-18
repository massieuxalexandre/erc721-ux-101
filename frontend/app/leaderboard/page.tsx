"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { useWallet } from "@/components/WalletContext";
import { CONTRACTS, evaluatorAbi, tdTokenAbi } from "@/lib/contracts";
import { formatTxError } from "@/lib/errors";
import {
  etherscanAddressUrl,
  mainnetPublicClient,
  sepoliaPublicClient,
  shortenAddress,
} from "@/lib/viem";

const STUDENT_REGISTERED_EVENT = parseAbiItem(
  "event StudentRegistered(address indexed student)"
);
const POINTS_AWARDED_EVENT = parseAbiItem(
  "event PointsAwarded(address indexed student, uint256 exerciseId, uint256 points)"
);

const CHUNK_SIZE = BigInt(5000);
const DEFAULT_SCAN_WINDOW = BigInt(9500);

// Public Sepolia fallback used when a rate-limited RPC rejects wide eth_getLogs queries.
const fallbackSepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

interface StudentRow {
  address: Address;
  ensName: string | null;
  balance: bigint;
  balanceFormatted: string;
  progression: [boolean, boolean, boolean, boolean];
  completedCount: number;
}

interface LeaderboardSnapshot {
  rows: StudentRow[];
  symbol: string;
  decimals: number;
  totalPointsFormatted: string;
  scannedFromBlock: bigint;
  scannedToBlock: bigint;
  usedFallbackRpc: boolean;
  historyLimitReached: boolean;
}

interface ScanLogsResult {
  addresses: Address[];
  lowestScannedBlock: bigint;
  historyLimitReached: boolean;
}

/**
 * Checks whether an RPC error indicates pruned historical logs (e.g. publicnode code 4444).
 */
function isPrunedHistoryError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const record = err as Record<string, unknown>;
  if (record.code === 4444) return true;
  if (
    typeof record.message === "string" &&
    record.message.toLowerCase().includes("pruned history")
  ) {
    return true;
  }
  if (
    typeof record.details === "string" &&
    record.details.toLowerCase().includes("pruned history")
  ) {
    return true;
  }
  if (typeof record.cause === "object" && record.cause !== null) {
    return isPrunedHistoryError(record.cause);
  }
  return false;
}

/**
 * Fetches StudentRegistered & PointsAwarded logs across a block range in chunks.
 * Uses `toBlock: "latest"` on the top-most chunk for load-balanced RPCs, and stops
 * cleanly (without throwing) if an RPC reports pruned history (code 4444).
 */
async function scanEvaluatorLogsRange(
  client: typeof fallbackSepoliaClient,
  fromBlock: bigint,
  toBlock: bigint,
  useLatestForTop = false
): Promise<ScanLogsResult> {
  const discovered = new Set<Address>();
  let cursor = toBlock;
  let isTopChunk = true;
  let lowestScannedBlock = toBlock + BigInt(1);
  let historyLimitReached = false;

  while (cursor >= fromBlock) {
    const chunkStart =
      cursor >= fromBlock + CHUNK_SIZE
        ? cursor - CHUNK_SIZE + BigInt(1)
        : fromBlock;

    const queryLogs = (endBlock: bigint | "latest") =>
      client.getLogs({
        address: CONTRACTS.evaluator,
        events: [STUDENT_REGISTERED_EVENT, POINTS_AWARDED_EVENT],
        fromBlock: chunkStart,
        toBlock: endBlock,
      });

    let logs;
    try {
      logs = await queryLogs(useLatestForTop && isTopChunk ? "latest" : cursor);
    } catch (chunkErr) {
      if (isPrunedHistoryError(chunkErr)) {
        historyLimitReached = true;
        break;
      }

      const msg =
        chunkErr instanceof Error ? chunkErr.message.toLowerCase() : "";
      if (msg.includes("beyond current head")) {
        const retryEnd: bigint | "latest" = isTopChunk
          ? "latest"
          : cursor > chunkStart + BigInt(5)
            ? cursor - BigInt(5)
            : "latest";
        try {
          logs = await queryLogs(retryEnd);
        } catch (retryErr) {
          if (isPrunedHistoryError(retryErr)) {
            historyLimitReached = true;
            break;
          }
          throw retryErr;
        }
      } else {
        throw chunkErr;
      }
    }

    lowestScannedBlock = chunkStart;
    for (const log of logs) {
      if (log.args.student) {
        discovered.add(getAddress(log.args.student));
      }
    }

    isTopChunk = false;
    if (chunkStart === BigInt(0) || chunkStart <= fromBlock) {
      break;
    }
    cursor = chunkStart - BigInt(1);
  }

  return {
    addresses: Array.from(discovered),
    lowestScannedBlock,
    historyLimitReached,
  };
}

export default function LeaderboardPage() {
  const { address: connectedAddress } = useWallet();

  const [snapshot, setSnapshot] = useState<LeaderboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanningEarlier, setIsScanningEarlier] = useState(false);

  // Manual student lookup form state.
  const [lookupInput, setLookupInput] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Keep known addresses and ENS cache across refreshes / earlier scans.
  const knownAddressesRef = useRef<Set<Address>>(new Set());
  const ensCacheRef = useRef<Map<Address, string | null>>(new Map());

  // Hydrates balances, exercise flags, and ENS names for a set of student addresses.
  const hydrateLeaderboard = useCallback(
    async (
      candidateAddresses: Address[],
      scannedFromBlock: bigint,
      scannedToBlock: bigint,
      usedFallbackRpc: boolean,
      historyLimitReached: boolean
    ): Promise<LeaderboardSnapshot> => {
      const uniqueMap = new Map<string, Address>();
      for (const addr of candidateAddresses) {
        const checksummed = getAddress(addr);
        uniqueMap.set(checksummed.toLowerCase(), checksummed);
      }

      // If the user is connected, include their address if they have submitted or hold points.
      let checkedConnectedAddress: Address | null = null;
      if (connectedAddress) {
        const checksummed = getAddress(connectedAddress);
        if (!uniqueMap.has(checksummed.toLowerCase())) {
          checkedConnectedAddress = checksummed;
        }
      }

      const [decimals, symbol] = await Promise.all([
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
      ]);

      if (checkedConnectedAddress) {
        const [connectedBalance, connectedSubmitted] = await Promise.all([
          sepoliaPublicClient.readContract({
            address: CONTRACTS.tdToken,
            abi: tdTokenAbi,
            functionName: "balanceOf",
            args: [checkedConnectedAddress],
          }),
          sepoliaPublicClient.readContract({
            address: CONTRACTS.evaluator,
            abi: evaluatorAbi,
            functionName: "hasSubmitted",
            args: [checkedConnectedAddress],
          }),
        ]);

        if (connectedSubmitted || connectedBalance > BigInt(0)) {
          uniqueMap.set(
            checkedConnectedAddress.toLowerCase(),
            checkedConnectedAddress
          );
          knownAddressesRef.current.add(checkedConnectedAddress);
        }
      }

      const students = Array.from(uniqueMap.values());

      if (students.length === 0) {
        return {
          rows: [],
          symbol,
          decimals,
          totalPointsFormatted: "0",
          scannedFromBlock,
          scannedToBlock,
          usedFallbackRpc,
          historyLimitReached,
        };
      }

      // Batch-fetch TD token balances and exerciseProgression(0..3) for all students.
      const [balanceResults, progressionResults] = await Promise.all([
        sepoliaPublicClient.multicall({
          contracts: students.map((student) => ({
            address: CONTRACTS.tdToken,
            abi: tdTokenAbi,
            functionName: "balanceOf" as const,
            args: [student] as const,
          })),
        }),
        sepoliaPublicClient.multicall({
          contracts: students.flatMap((student) =>
            [0, 1, 2, 3].map((exerciseId) => ({
              address: CONTRACTS.evaluator,
              abi: evaluatorAbi,
              functionName: "exerciseProgression" as const,
              args: [student, BigInt(exerciseId)] as const,
            }))
          ),
        }),
      ]);

      // Best-effort Mainnet ENS reverse-resolution for addresses not yet cached.
      const uncachedForEns = students.filter(
        (student) => !ensCacheRef.current.has(student)
      );
      if (uncachedForEns.length > 0) {
        const ensResults = await Promise.allSettled(
          uncachedForEns.map((student) =>
            mainnetPublicClient.getEnsName({ address: student })
          )
        );
        uncachedForEns.forEach((student, idx) => {
          const res = ensResults[idx];
          ensCacheRef.current.set(
            student,
            res && res.status === "fulfilled" ? res.value : null
          );
        });
      }

      let totalPoints = BigInt(0);

      const rows: StudentRow[] = students.map((student, idx) => {
        const balanceRes = balanceResults[idx];
        const balance =
          balanceRes && balanceRes.status === "success"
            ? balanceRes.result
            : BigInt(0);
        totalPoints += balance;

        const baseProgIdx = idx * 4;
        const progression: [boolean, boolean, boolean, boolean] = [0, 1, 2, 3].map(
          (offset) => {
            const progRes = progressionResults[baseProgIdx + offset];
            return progRes && progRes.status === "success"
              ? Boolean(progRes.result)
              : false;
          }
        ) as [boolean, boolean, boolean, boolean];

        const completedCount = progression.filter(Boolean).length;

        return {
          address: student,
          ensName: ensCacheRef.current.get(student) ?? null,
          balance,
          balanceFormatted: formatUnits(balance, decimals),
          progression,
          completedCount,
        };
      });

      // Sort descending by points, breaking ties by completed exercises count.
      rows.sort((a, b) => {
        if (b.balance !== a.balance) {
          return b.balance > a.balance ? 1 : -1;
        }
        if (b.completedCount !== a.completedCount) {
          return b.completedCount - a.completedCount;
        }
        return a.address.localeCompare(b.address);
      });

      return {
        rows,
        symbol,
        decimals,
        totalPointsFormatted: formatUnits(totalPoints, decimals),
        scannedFromBlock,
        scannedToBlock,
        usedFallbackRpc,
        historyLimitReached,
      };
    },
    [connectedAddress]
  );

  // Initial scan: tries full history on primary RPC, then falls back to chunked public RPC scan.
  const fetchInitialLeaderboard = useCallback(async (): Promise<{
    snapshot: LeaderboardSnapshot;
    warning: string | null;
  }> => {
    let scannedFromBlock = BigInt(0);
    let scannedToBlock = BigInt(0);
    let usedFallbackRpc = false;
    let historyLimitReached = false;
    let warning: string | null = null;

    try {
      const [latestBlock, logs] = await Promise.all([
        sepoliaPublicClient.getBlockNumber(),
        sepoliaPublicClient.getLogs({
          address: CONTRACTS.evaluator,
          events: [STUDENT_REGISTERED_EVENT, POINTS_AWARDED_EVENT],
          fromBlock: BigInt(0),
          toBlock: "latest",
        }),
      ]);

      scannedToBlock = latestBlock;
      for (const log of logs) {
        if (log.args.student) {
          knownAddressesRef.current.add(getAddress(log.args.student));
        }
      }
    } catch {
      // Primary RPC rejected wide getLogs (e.g. Alchemy 10-block cap): fall back to publicnode.
      usedFallbackRpc = true;
      try {
        const latestBlock = await fallbackSepoliaClient.getBlockNumber();
        const startBlock =
          latestBlock > DEFAULT_SCAN_WINDOW
            ? latestBlock - DEFAULT_SCAN_WINDOW + BigInt(1)
            : BigInt(0);

        const scanResult = await scanEvaluatorLogsRange(
          fallbackSepoliaClient,
          startBlock,
          latestBlock,
          true
        );
        for (const addr of scanResult.addresses) {
          knownAddressesRef.current.add(addr);
        }

        scannedFromBlock =
          scanResult.lowestScannedBlock <= latestBlock
            ? scanResult.lowestScannedBlock
            : latestBlock;
        scannedToBlock = latestBlock;
        historyLimitReached = scanResult.historyLimitReached;
      } catch (fallbackErr) {
        // Still hydrate connected/manual addresses even if public event scanning fails.
        warning = `Log scan warning: ${formatTxError(fallbackErr)}`;
      }
    }

    const nextSnapshot = await hydrateLeaderboard(
      Array.from(knownAddressesRef.current),
      scannedFromBlock,
      scannedToBlock,
      usedFallbackRpc,
      historyLimitReached
    );

    return { snapshot: nextSnapshot, warning };
  }, [hydrateLeaderboard]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { snapshot: nextSnapshot, warning } =
          await fetchInitialLeaderboard();
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setError(warning);
        }
      } catch (err) {
        if (!cancelled) {
          setError(formatTxError(err));
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchInitialLeaderboard]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const { snapshot: nextSnapshot, warning } =
        await fetchInitialLeaderboard();
      setSnapshot(nextSnapshot);
      setError(warning);
    } catch (err) {
      setError(formatTxError(err));
    } finally {
      setIsRefreshing(false);
    }
  };

  // Scans an earlier window when the fallback RPC scan stopped above block 0.
  const handleScanEarlier = async () => {
    if (
      !snapshot ||
      snapshot.scannedFromBlock === BigInt(0) ||
      snapshot.historyLimitReached
    ) {
      return;
    }
    setIsScanningEarlier(true);
    try {
      const nextTo = snapshot.scannedFromBlock - BigInt(1);
      const nextFrom =
        nextTo > DEFAULT_SCAN_WINDOW
          ? nextTo - DEFAULT_SCAN_WINDOW + BigInt(1)
          : BigInt(0);

      const scanResult = await scanEvaluatorLogsRange(
        fallbackSepoliaClient,
        nextFrom,
        nextTo
      );
      for (const addr of scanResult.addresses) {
        knownAddressesRef.current.add(addr);
      }

      const updatedFromBlock =
        scanResult.lowestScannedBlock <= nextTo
          ? scanResult.lowestScannedBlock
          : snapshot.scannedFromBlock;

      const nextSnapshot = await hydrateLeaderboard(
        Array.from(knownAddressesRef.current),
        updatedFromBlock,
        snapshot.scannedToBlock,
        true,
        scanResult.historyLimitReached
      );
      setSnapshot(nextSnapshot);
      setError(null);
    } catch (err) {
      setError(formatTxError(err));
    } finally {
      setIsScanningEarlier(false);
    }
  };

  // Manually adds any valid Ethereum address to the table and fetches its live score.
  const handleLookupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = lookupInput.trim();
    if (!isAddress(trimmed)) {
      setLookupError("Enter a valid Ethereum address (0x...).");
      return;
    }

    setLookupError(null);
    const checksummed = getAddress(trimmed);
    knownAddressesRef.current.add(checksummed);

    try {
      const nextSnapshot = await hydrateLeaderboard(
        Array.from(knownAddressesRef.current),
        snapshot?.scannedFromBlock ?? BigInt(0),
        snapshot?.scannedToBlock ?? BigInt(0),
        snapshot?.usedFallbackRpc ?? false,
        snapshot?.historyLimitReached ?? false
      );
      setSnapshot(nextSnapshot);
      setLookupInput("");
      setError(null);
    } catch (err) {
      setLookupError(formatTxError(err));
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
          <div className="flex flex-wrap gap-2">
            {snapshot &&
              snapshot.scannedFromBlock > BigInt(0) &&
              !snapshot.historyLimitReached && (
                <button
                  type="button"
                  onClick={handleScanEarlier}
                  disabled={isScanningEarlier || isRefreshing}
                  className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  {isScanningEarlier
                    ? "Scanning Earlier..."
                    : "Scan Earlier Blocks"}
                </button>
              )}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isScanningEarlier}
              className="cursor-pointer rounded-md bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Live Sepolia ranking of addresses that registered or earned{" "}
          <code className="font-mono">TD-ERC721-UX-101</code> points on the{" "}
          <a
            href={etherscanAddressUrl(CONTRACTS.evaluator)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Evaluator
          </a>{" "}
          contract.
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="overflow-hidden break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {/* Summary Stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Total Students
          </p>
          <p className="mt-1 font-mono text-xl font-bold">
            {snapshot ? snapshot.rows.length : "..."}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Total Points Distributed
          </p>
          <p className="mt-1 font-mono text-xl font-bold">
            {snapshot
              ? `${snapshot.totalPointsFormatted} ${snapshot.symbol}`
              : "..."}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Scanned Block Range
          </p>
          <p className="mt-1 font-mono text-sm font-semibold">
            {snapshot
              ? `#${snapshot.scannedFromBlock.toLocaleString()} to #${snapshot.scannedToBlock.toLocaleString()}`
              : "Scanning Sepolia logs..."}
          </p>
          {snapshot?.usedFallbackRpc && (
            <p className="mt-1 text-xs text-zinc-500">
              {snapshot.historyLimitReached
                ? "Public RPC unpruned history limit reached"
                : "Chunked scan via public Sepolia RPC"}
            </p>
          )}
        </div>
      </section>

      {/* Manual Student Lookup */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold">Look Up Student Address</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Add any address manually if it registered outside the scanned block
          window.
        </p>
        <form onSubmit={handleLookupSubmit} className="mt-3 flex gap-2">
          <label htmlFor="leaderboard-lookup-address" className="sr-only">
            Student Address
          </label>
          <input
            id="leaderboard-lookup-address"
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
            Add / Check
          </button>
        </form>
        {lookupError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {lookupError}
          </p>
        )}
      </section>

      {/* Leaderboard Table */}
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        {!snapshot ? (
          <div className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
            Scanning Evaluator events and querying balances on Sepolia...
          </div>
        ) : snapshot.rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No students found in this block range yet. Try clicking{" "}
            <strong>Scan Earlier Blocks</strong> or adding an address above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Student
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Exercises
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {snapshot.rows.map((row, idx) => {
                  const isCurrentUser =
                    connectedAddress !== null &&
                    row.address.toLowerCase() === connectedAddress.toLowerCase();

                  return (
                    <tr
                      key={row.address}
                      className={
                        isCurrentUser
                          ? "bg-emerald-50/60 dark:bg-emerald-950/20"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                      }
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        #{idx + 1}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={etherscanAddressUrl(row.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={row.address}
                            className="font-mono text-xs font-medium underline hover:no-underline"
                          >
                            {row.ensName ?? shortenAddress(row.address, 6)}
                          </a>
                          {isCurrentUser && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {row.progression.map((done, exIdx) => (
                            <span
                              key={exIdx}
                              className={`rounded px-2 py-0.5 text-xs font-medium ${
                                done
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              Ex {exIdx}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {row.balanceFormatted} {snapshot.symbol}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
