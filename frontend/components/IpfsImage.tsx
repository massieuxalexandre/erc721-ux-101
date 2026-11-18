"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { toIpfsGatewayUrls } from "@/lib/ipfs";

interface IpfsImageProps {
  src?: string;
  alt: string;
  width: number;
  height: number;
  lazy?: boolean;
  className?: string;
}

/**
 * Renders an NFT image from an IPFS or HTTP URI and automatically falls back
 * across multiple public IPFS gateways if a gateway fails or rate-limits.
 */
export function IpfsImage({
  src,
  alt,
  width,
  height,
  lazy = false,
  className = "",
}: IpfsImageProps) {
  const normalizedSrc = src?.trim() ?? "";
  const gatewayUrls = useMemo(
    () => (normalizedSrc ? toIpfsGatewayUrls(normalizedSrc) : []),
    [normalizedSrc]
  );

  // Track gateway attempt index keyed by `src` so changing `src` resets cleanly.
  const [attempt, setAttempt] = useState<{ src: string; index: number }>({
    src: normalizedSrc,
    index: 0,
  });

  const currentIndex = attempt.src === normalizedSrc ? attempt.index : 0;
  const activeUrl = gatewayUrls[currentIndex];

  if (!activeUrl) {
    return (
      <div
        role="img"
        aria-label={alt}
        style={{ aspectRatio: `${width} / ${height}` }}
        className={`flex w-full items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-100 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 ${className}`}
      >
        Image unavailable
      </div>
    );
  }

  return (
    <img
      src={activeUrl}
      alt={alt}
      width={width}
      height={height}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
      onError={() =>
        setAttempt({
          src: normalizedSrc,
          index: currentIndex + 1,
        })
      }
      className={className}
    />
  );
}
