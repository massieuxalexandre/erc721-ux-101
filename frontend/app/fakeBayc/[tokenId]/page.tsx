"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Address } from "viem";
import { IpfsImage } from "@/components/IpfsImage";
import { CONTRACTS, fakeBAYCAbi } from "@/lib/contracts";
import { useTokenMetadata } from "@/lib/useTokenMetadata";
import {
  etherscanAddressUrl,
  sepoliaPublicClient,
  shortenAddress,
} from "@/lib/viem";

interface TokenPageState {
  tokenId: string;
  exists: boolean;
  owner?: Address;
  tokenUri?: string;
}

function FakeBaycTokenContent() {
  const params = useParams<{ tokenId: string }>();
  const rawTokenId = params?.tokenId ?? "";
  const isValidTokenId = /^\d+$/.test(rawTokenId);

  const [state, setState] = useState<TokenPageState | null>(null);

  useEffect(() => {
    if (!isValidTokenId) {
      return;
    }

    let cancelled = false;
    const tokenIdBigInt = BigInt(rawTokenId);

    async function loadOnChainToken() {
      try {
        const [owner, tokenUri] = await Promise.all([
          sepoliaPublicClient.readContract({
            address: CONTRACTS.fakeBAYC,
            abi: fakeBAYCAbi,
            functionName: "ownerOf",
            args: [tokenIdBigInt],
          }),
          sepoliaPublicClient.readContract({
            address: CONTRACTS.fakeBAYC,
            abi: fakeBAYCAbi,
            functionName: "tokenURI",
            args: [tokenIdBigInt],
          }),
        ]);

        if (!cancelled) {
          setState({
            tokenId: rawTokenId,
            exists: true,
            owner,
            tokenUri,
          });
        }
      } catch {
        // ownerOf reverts cleanly when a tokenId has not been minted yet.
        if (!cancelled) {
          setState({
            tokenId: rawTokenId,
            exists: false,
          });
        }
      }
    }

    void loadOnChainToken();
    return () => {
      cancelled = true;
    };
  }, [isValidTokenId, rawTokenId]);

  const current = state?.tokenId === rawTokenId ? state : null;
  const {
    data: metadata,
    error: metadataError,
    isLoading: isMetadataLoading,
  } = useTokenMetadata(current?.exists ? current.tokenUri : null);

  if (!isValidTokenId) {
    return (
      <section
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-950 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-100"
      >
        <h1 className="text-xl font-bold">Invalid Token ID</h1>
        <p className="mt-2 text-sm">
          <code className="font-mono">{rawTokenId}</code> is not a valid
          non-negative integer token ID.
        </p>
        <Link
          href="/fakeBayc"
          className="mt-4 inline-block rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
        >
          Back to FakeBAYC
        </Link>
      </section>
    );
  }

  if (!current) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        Loading FakeBAYC #{rawTokenId}...
      </div>
    );
  }

  if (!current.exists) {
    return (
      <section
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100"
      >
        <h1 className="text-xl font-bold">
          FakeBAYC #{rawTokenId} does not exist
        </h1>
        <p className="mt-2 text-sm">
          No token with ID #{rawTokenId} has been minted on the FakeBAYC
          contract yet.
        </p>
        <Link
          href="/fakeBayc"
          className="mt-4 inline-block rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
        >
          Back to FakeBAYC
        </Link>
      </section>
    );
  }

  const attributes = metadata?.attributes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          FakeBAYC #{rawTokenId}
        </h1>
        <Link
          href="/fakeBayc"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Back to FakeBAYC
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          {isMetadataLoading ? (
            <div className="flex aspect-square w-full items-center justify-center rounded-md bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              Loading metadata from IPFS...
            </div>
          ) : (
            <IpfsImage
              src={metadata?.image}
              alt={`FakeBAYC #${rawTokenId}`}
              width={512}
              height={512}
              className="h-auto w-full rounded-md object-cover"
            />
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-base font-semibold">Token Details</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Owner
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs">
                  {current.owner && (
                    <>
                      <a
                        href={etherscanAddressUrl(current.owner)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={current.owner}
                        className="underline hover:no-underline"
                      >
                        {shortenAddress(current.owner, 6)}
                      </a>
                      <Link
                        href={`/fakeBayc/gallery/${current.owner}`}
                        className="rounded bg-zinc-100 px-2 py-0.5 font-sans font-medium text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                      >
                        View Owner Gallery
                      </Link>
                    </>
                  )}
                </dd>
              </div>

              {current.tokenUri && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Token URI
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {current.tokenUri}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-3 text-base font-semibold">Attributes</h2>

            {isMetadataLoading ? (
              <p className="text-sm text-zinc-500">Loading attributes...</p>
            ) : metadataError ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {metadataError.message}
              </p>
            ) : attributes.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No attributes found in token metadata.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {attributes.map((attr, idx) => (
                  <div
                    key={`${attr.trait_type ?? "trait"}-${idx}`}
                    className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {attr.trait_type ?? "Trait"}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {attr.value !== undefined ? String(attr.value) : "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function FakeBaycTokenPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Loading FakeBAYC token...
        </div>
      }
    >
      <FakeBaycTokenContent />
    </Suspense>
  );
}
