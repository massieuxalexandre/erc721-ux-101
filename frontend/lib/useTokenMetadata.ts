"use client";

import useSWR from "swr";
import { fetchTokenMetadata, type TokenMetadata } from "@/lib/ipfs";

/**
 * Fetches and caches NFT metadata by `tokenUri` using SWR.
 *
 * Why immutable SWR settings?
 * - Content-addressed IPFS metadata for a tokenURI does not change once minted.
 * - Sharing the `["token-metadata", tokenUri]` key lets `/fakeBayc/gallery/[address]`
 *   and `/fakeBayc/[tokenId]` reuse cached metadata instantaneously without extra fetches.
 */
export function useTokenMetadata(tokenUri?: string | null) {
  return useSWR<TokenMetadata, Error>(
    tokenUri ? (["token-metadata", tokenUri] as const) : null,
    ([, uri]: readonly [string, string]) => fetchTokenMetadata(uri),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      shouldRetryOnError: false,
      dedupingInterval: 60_000,
    }
  );
}
