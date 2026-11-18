"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isAddress, type Address } from "viem";
import { CONTRACTS, fakeNefturiansAbi } from "@/lib/contracts";
import {
  etherscanAddressUrl,
  sepoliaPublicClient,
  shortenAddress,
} from "@/lib/viem";

interface OwnedTokenItem {
  tokenId: string;
  tokenUri: string | null;
}

interface OwnerTokensState {
  address: string;
  balance: bigint;
  tokens: OwnedTokenItem[];
}

function FakeNefturiansOwnerContent() {
  const params = useParams<{ address: string }>();
  const rawAddress = params?.address ?? "";
  const validAddress = isAddress(rawAddress) ? (rawAddress as Address) : null;

  const [state, setState] = useState<OwnerTokensState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!validAddress) {
      return;
    }

    let cancelled = false;
    const ownerAddress = validAddress;

    async function loadOwnedTokens() {
      try {
        const balance = await sepoliaPublicClient.readContract({
          address: CONTRACTS.fakeNefturians,
          abi: fakeNefturiansAbi,
          functionName: "balanceOf",
          args: [ownerAddress],
        });

        const count = Number(balance);
        if (count === 0) {
          if (!cancelled) {
            setState({ address: rawAddress, balance, tokens: [] });
            setError(null);
          }
          return;
        }

        // Batch-read owned token IDs via ERC721Enumerable.tokenOfOwnerByIndex.
        const tokenIdResults = await sepoliaPublicClient.multicall({
          contracts: Array.from({ length: count }, (_, index) => ({
            address: CONTRACTS.fakeNefturians,
            abi: fakeNefturiansAbi,
            functionName: "tokenOfOwnerByIndex" as const,
            args: [ownerAddress, BigInt(index)] as const,
          })),
        });

        const tokenIds = tokenIdResults
          .filter(
            (res): res is { status: "success"; result: bigint } =>
              res.status === "success"
          )
          .map((res) => res.result);

        // Batch-read on-chain tokenURI strings for reference (no external API fetch).
        const uriResults = await sepoliaPublicClient.multicall({
          contracts: tokenIds.map((tokenId) => ({
            address: CONTRACTS.fakeNefturians,
            abi: fakeNefturiansAbi,
            functionName: "tokenURI" as const,
            args: [tokenId] as const,
          })),
        });

        const tokens: OwnedTokenItem[] = tokenIds.map((tokenId, idx) => {
          const uriRes = uriResults[idx];
          return {
            tokenId: tokenId.toString(),
            tokenUri:
              uriRes && uriRes.status === "success" ? uriRes.result : null,
          };
        });

        if (!cancelled) {
          setState({ address: rawAddress, balance, tokens });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load FakeNefturians tokens for this address."
          );
        }
      }
    }

    void loadOwnedTokens();
    return () => {
      cancelled = true;
    };
  }, [rawAddress, validAddress]);

  if (!validAddress) {
    return (
      <section
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-950 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100"
      >
        <h1 className="text-xl font-bold">Invalid Address</h1>
        <p className="mt-2 text-sm">
          <code className="break-all font-mono">{rawAddress}</code> is not a
          valid Ethereum address.
        </p>
        <Link
          href="/fakeNefturians"
          className="mt-4 inline-block rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
        >
          Back to FakeNefturians
        </Link>
      </section>
    );
  }

  const currentState = state?.address === rawAddress ? state : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            FakeNefturians Owner Tokens
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Owner:{" "}
            <a
              href={etherscanAddressUrl(validAddress)}
              target="_blank"
              rel="noopener noreferrer"
              title={validAddress}
              className="font-mono underline hover:no-underline"
            >
              {shortenAddress(validAddress, 6)}
            </a>
            {currentState && (
              <span> ({currentState.balance.toString()} tokens)</span>
            )}
          </p>
        </div>

        <Link
          href="/fakeNefturians"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Back to FakeNefturians
        </Link>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {!currentState && !error && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Loading FakeNefturians tokens for {shortenAddress(validAddress)}...
        </div>
      )}

      {currentState && currentState.tokens.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-base font-semibold">
            No FakeNefturians Tokens Owned
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This address does not own any FakeNefturians tokens on Sepolia yet.
          </p>
          <Link
            href="/fakeNefturians"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Buy a FakeNefturians Token
          </Link>
        </div>
      )}

      {currentState && currentState.tokens.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {currentState.tokens.map((token) => (
            <article
              key={token.tokenId}
              className="rounded-lg border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">
                  FakeNefturians #{token.tokenId}
                </h2>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  ID {token.tokenId}
                </span>
              </div>

              {token.tokenUri && (
                <p className="mt-3 break-all font-mono text-xs text-zinc-500">
                  URI: {token.tokenUri}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FakeNefturiansOwnerPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Loading FakeNefturians tokens...
        </div>
      }
    >
      <FakeNefturiansOwnerContent />
    </Suspense>
  );
}
