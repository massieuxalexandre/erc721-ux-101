"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isAddress, type Address } from "viem";
import { IpfsImage } from "@/components/IpfsImage";
import { CONTRACTS, fakeBAYCAbi } from "@/lib/contracts";
import { useTokenMetadata } from "@/lib/useTokenMetadata";
import {
  etherscanAddressUrl,
  sepoliaPublicClient,
  shortenAddress,
} from "@/lib/viem";

interface GalleryItem {
  tokenId: string;
  tokenUri: string | null;
}

interface GalleryState {
  address: string;
  balance: bigint;
  items: GalleryItem[];
}

/**
 * Renders a single FakeBAYC card and fetches its metadata independently via SWR
 * so fast cards appear right away and share cache with `/fakeBayc/[tokenId]`.
 */
function GalleryTokenCard({ tokenId, tokenUri }: GalleryItem) {
  const { data: metadata, error, isLoading } = useTokenMetadata(tokenUri);
  const traitCount = metadata?.attributes?.length ?? 0;

  return (
    <Link
      href={`/fakeBayc/${tokenId}`}
      className="group overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xs transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
    >
      <div className="aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {isLoading ? (
          <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
            Loading...
          </div>
        ) : (
          <IpfsImage
            src={metadata?.image}
            alt={`FakeBAYC #${tokenId}`}
            width={400}
            height={400}
            lazy
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        )}
      </div>
      <div className="flex items-center justify-between p-4">
        <span className="font-semibold">FakeBAYC #{tokenId}</span>
        <span className="text-xs text-zinc-500">
          {isLoading
            ? "Loading..."
            : error
              ? "Metadata unavailable"
              : `${traitCount} ${traitCount === 1 ? "trait" : "traits"}`}
        </span>
      </div>
    </Link>
  );
}

function FakeBaycGalleryContent() {
  const params = useParams<{ address: string }>();
  const rawAddress = params?.address ?? "";
  const validAddress = isAddress(rawAddress) ? (rawAddress as Address) : null;

  const [gallery, setGallery] = useState<GalleryState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!validAddress) {
      return;
    }

    let cancelled = false;
    const ownerAddress = validAddress;

    async function loadGallery() {
      try {
        const balance = await sepoliaPublicClient.readContract({
          address: CONTRACTS.fakeBAYC,
          abi: fakeBAYCAbi,
          functionName: "balanceOf",
          args: [ownerAddress],
        });

        const count = Number(balance);
        if (count === 0) {
          if (!cancelled) {
            setGallery({ address: rawAddress, balance, items: [] });
            setError(null);
          }
          return;
        }

        // Batch-read all owned token IDs via ERC721Enumerable.tokenOfOwnerByIndex.
        const tokenIdResults = await sepoliaPublicClient.multicall({
          contracts: Array.from({ length: count }, (_, index) => ({
            address: CONTRACTS.fakeBAYC,
            abi: fakeBAYCAbi,
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

        // Batch-read tokenURIs for the owned token IDs.
        const uriResults = await sepoliaPublicClient.multicall({
          contracts: tokenIds.map((tokenId) => ({
            address: CONTRACTS.fakeBAYC,
            abi: fakeBAYCAbi,
            functionName: "tokenURI" as const,
            args: [tokenId] as const,
          })),
        });

        const items: GalleryItem[] = tokenIds.map((tokenId, idx) => {
          const uriRes = uriResults[idx];
          return {
            tokenId: tokenId.toString(),
            tokenUri:
              uriRes && uriRes.status === "success" ? uriRes.result : null,
          };
        });

        if (!cancelled) {
          setGallery({ address: rawAddress, balance, items });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load FakeBAYC gallery."
          );
        }
      }
    }

    void loadGallery();
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
          href="/fakeBayc"
          className="mt-4 inline-block rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
        >
          Back to FakeBAYC
        </Link>
      </section>
    );
  }

  const currentGallery =
    gallery?.address === rawAddress ? gallery : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            FakeBAYC Gallery
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
            {currentGallery && (
              <span> ({currentGallery.balance.toString()} tokens)</span>
            )}
          </p>
        </div>

        <Link
          href="/fakeBayc"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Back to FakeBAYC
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

      {!currentGallery && !error && (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Loading FakeBAYC tokens for {shortenAddress(validAddress)}...
        </div>
      )}

      {currentGallery && currentGallery.items.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-base font-semibold">No FakeBAYC Tokens Owned</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This address does not own any FakeBAYC tokens on Sepolia yet.
          </p>
          <Link
            href="/fakeBayc"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Claim a FakeBAYC Token
          </Link>
        </div>
      )}

      {currentGallery && currentGallery.items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {currentGallery.items.map((item) => (
            <GalleryTokenCard
              key={item.tokenId}
              tokenId={item.tokenId}
              tokenUri={item.tokenUri}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FakeBaycGalleryPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Loading FakeBAYC gallery...
        </div>
      }
    >
      <FakeBaycGalleryContent />
    </Suspense>
  );
}
