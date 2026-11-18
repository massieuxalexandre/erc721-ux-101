import { Suspense } from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { WalletProvider } from "@/components/WalletContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERC721 UX 101",
  description:
    "Sepolia workshop frontend for ERC721 collections and the Evaluator contract.",
};

function NavbarFallback() {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          ERC721 UX 101
        </span>
        <span className="h-8 w-36 rounded-md bg-zinc-100 dark:bg-zinc-900" />
      </div>
    </header>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-100">
        <WalletProvider>
          {/* Suspense boundary required by Next.js 16 cacheComponents for Navbar's usePathname() */}
          <Suspense fallback={<NavbarFallback />}>
            <Navbar />
          </Suspense>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
            {children}
          </main>
        </WalletProvider>
      </body>
    </html>
  );
}
