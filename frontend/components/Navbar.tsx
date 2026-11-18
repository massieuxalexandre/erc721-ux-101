"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/WalletContext";
import { etherscanAddressUrl, shortenAddress } from "@/lib/viem";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/chain-info", label: "Chain Info" },
  { href: "/fakeBayc", label: "FakeBAYC" },
  { href: "/fakeNefturians", label: "FakeNefturians" },
  { href: "/fakeMeebits", label: "FakeMeebits" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export function Navbar() {
  const pathname = usePathname();
  const {
    address,
    ensName,
    chainId,
    isConnecting,
    error,
    isSepolia,
    connectInjected,
    connectWalletConnect,
    switchToSepolia,
    disconnect,
    clearError,
  } = useWallet();

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            ERC721 UX 101
          </Link>

          <nav aria-label="Primary navigation" className="flex flex-wrap gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!address ? (
            <>
              <button
                type="button"
                onClick={connectInjected}
                disabled={isConnecting}
                className="cursor-pointer rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {isConnecting ? "Connecting..." : "Connect Browser Wallet"}
              </button>
              <button
                type="button"
                onClick={connectWalletConnect}
                disabled={isConnecting}
                className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                WalletConnect QR
              </button>
            </>
          ) : (
            <>
              {isSepolia ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Sepolia
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Wrong Network ({chainId ?? "?"})
                  </span>
                  <button
                    type="button"
                    onClick={switchToSepolia}
                    className="cursor-pointer rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                  >
                    Switch to Sepolia
                  </button>
                </div>
              )}

              <a
                href={etherscanAddressUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                title={address}
                className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-xs text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {ensName ?? shortenAddress(address)}
              </a>

              <button
                type="button"
                onClick={disconnect}
                className="cursor-pointer rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-200"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <span>{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="cursor-pointer rounded px-2 py-0.5 text-xs font-medium underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
