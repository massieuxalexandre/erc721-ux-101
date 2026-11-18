"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA_CHAIN_HEX, SEPOLIA_CHAIN_ID } from "@/lib/contracts";
import { mainnetPublicClient } from "@/lib/viem";

export type WalletProviderType = "injected" | "walletconnect" | null;

type WcEthereumProvider = Awaited<
  ReturnType<
    typeof import("@walletconnect/ethereum-provider").EthereumProvider.init
  >
>;

// Minimal EIP-1193 provider interface compatible with browser wallets and WalletConnect.
interface WalletProviderLike {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void
  ) => unknown;
  disconnect?: () => Promise<void>;
}

declare global {
  interface Window {
    ethereum?: WalletProviderLike;
  }
}

interface WalletContextValue {
  address: Address | null;
  ensName: string | null;
  chainId: number | null;
  providerType: WalletProviderType;
  isConnecting: boolean;
  error: string | null;
  isSepolia: boolean;
  connectInjected: () => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  getWalletClient: () => WalletClient;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

/**
 * Converts a hex ("0xaa36a7") or decimal ("11155111" / 11155111) chain ID into a number.
 */
function parseChainId(rawChainId: unknown): number | null {
  if (typeof rawChainId === "number") {
    return Number.isFinite(rawChainId) ? rawChainId : null;
  }
  if (typeof rawChainId === "string") {
    const trimmed = rawChainId.trim();
    if (!trimmed) return null;
    const parsed = trimmed.startsWith("0x") || trimmed.startsWith("0X")
      ? Number.parseInt(trimmed, 16)
      : Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Extracts a numeric RPC error code if present on a wallet error object.
 */
function getRpcErrorCode(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as Record<string, unknown>;
  if (typeof record.code === "number") return record.code;
  if (typeof record.data === "object" && record.data !== null) {
    const data = record.data as Record<string, unknown>;
    if (typeof data.originalError === "object" && data.originalError !== null) {
      const original = data.originalError as Record<string, unknown>;
      if (typeof original.code === "number") return original.code;
    }
  }
  return undefined;
}

/**
 * Turns wallet/RPC errors into clear, beginner-friendly English messages.
 */
function formatWalletError(err: unknown, fallback: string): string {
  const code = getRpcErrorCode(err);
  if (code === 4001) {
    return "Request was rejected in your wallet.";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [ensResult, setEnsResult] = useState<{
    address: Address;
    name: string | null;
  } | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [providerType, setProviderType] = useState<WalletProviderType>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store the active EIP-1193 provider, WalletConnect singleton, and cleanup callback outside React state.
  const activeProviderRef = useRef<WalletProviderLike | null>(null);
  const wcProviderRef = useRef<WcEthereumProvider | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID;
  const ensName =
    address && ensResult?.address === address ? ensResult.name : null;

  // Reverse-resolve ENS name on Ethereum Mainnet whenever the connected address changes.
  useEffect(() => {
    if (!address) {
      return;
    }

    let cancelled = false;
    const currentAddress = address;

    async function resolveEnsName() {
      try {
        const resolved = await mainnetPublicClient.getEnsName({
          address: currentAddress,
        });
        if (!cancelled) {
          setEnsResult({ address: currentAddress, name: resolved });
        }
      } catch {
        // Silent fallback when no ENS record exists or Mainnet RPC is unreachable.
        if (!cancelled) {
          setEnsResult({ address: currentAddress, name: null });
        }
      }
    }

    void resolveEnsName();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetWalletState = useCallback(() => {
    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
      cleanupListenersRef.current = null;
    }
    activeProviderRef.current = null;
    setAddress(null);
    setChainId(null);
    setProviderType(null);
  }, []);

  // Subscribes to EIP-1193 wallet events so the UI reacts immediately to account/network changes.
  const attachListeners = useCallback(
    (provider: WalletProviderLike, type: Exclude<WalletProviderType, null>) => {
      if (cleanupListenersRef.current) {
        cleanupListenersRef.current();
        cleanupListenersRef.current = null;
      }

      const handleAccountsChanged = (rawAccounts: unknown) => {
        if (!Array.isArray(rawAccounts) || rawAccounts.length === 0) {
          resetWalletState();
          return;
        }
        const firstAccount = rawAccounts[0];
        if (typeof firstAccount === "string") {
          setAddress(getAddress(firstAccount));
        }
      };

      const handleChainChanged = (rawChainId: unknown) => {
        const nextChainId = parseChainId(rawChainId);
        if (nextChainId !== null) {
          setChainId(nextChainId);
        }
      };

      const handleDisconnect = () => {
        resetWalletState();
      };

      provider.on?.("accountsChanged", handleAccountsChanged);
      provider.on?.("chainChanged", handleChainChanged);
      if (type === "walletconnect") {
        provider.on?.("disconnect", handleDisconnect);
      }

      cleanupListenersRef.current = () => {
        provider.removeListener?.("accountsChanged", handleAccountsChanged);
        provider.removeListener?.("chainChanged", handleChainChanged);
        if (type === "walletconnect") {
          provider.removeListener?.("disconnect", handleDisconnect);
        }
      };
    },
    [resetWalletState]
  );

  // On initial mount, silently check if an injected wallet (Rabby/MetaMask) is already authorized.
  useEffect(() => {
    let cancelled = false;

    async function restoreInjectedSession() {
      if (typeof window === "undefined" || !window.ethereum) {
        return;
      }

      try {
        const provider = window.ethereum;
        const accounts = (await provider.request({
          method: "eth_accounts",
        })) as string[];

        if (cancelled || !accounts || accounts.length === 0) {
          return;
        }

        const rawChainId = await provider.request({ method: "eth_chainId" });
        if (cancelled) return;

        activeProviderRef.current = provider;
        setAddress(getAddress(accounts[0]));
        setChainId(parseChainId(rawChainId));
        setProviderType("injected");
        attachListeners(provider, "injected");
      } catch {
        // Ignore silent restore errors on page load.
      }
    }

    restoreInjectedSession();

    return () => {
      cancelled = true;
      if (cleanupListenersRef.current) {
        cleanupListenersRef.current();
        cleanupListenersRef.current = null;
      }
    };
  }, [attachListeners]);

  // Connects to a browser-injected EIP-1193 wallet (Rabby Wallet, MetaMask, etc.).
  const connectInjected = useCallback(async () => {
    setError(null);

    if (typeof window === "undefined" || !window.ethereum) {
      setError(
        "No browser wallet detected. Please install Rabby Wallet or MetaMask."
      );
      return;
    }

    setIsConnecting(true);
    try {
      const provider = window.ethereum;
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error("No account was returned by your browser wallet.");
      }

      const rawChainId = await provider.request({ method: "eth_chainId" });

      activeProviderRef.current = provider;
      setAddress(getAddress(accounts[0]));
      setChainId(parseChainId(rawChainId));
      setProviderType("injected");
      attachListeners(provider, "injected");
    } catch (err) {
      setError(formatWalletError(err, "Failed to connect browser wallet."));
    } finally {
      setIsConnecting(false);
    }
  }, [attachListeners]);

  // Connects via WalletConnect v2 QR code (dynamic import keeps this strictly client-side).
  const connectWalletConnect = useCallback(async () => {
    setError(null);

    const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim();
    if (
      !projectId ||
      projectId === "your_walletconnect_project_id" ||
      projectId === "your_project_id"
    ) {
      setError(
        "WalletConnect Project ID is missing. Set NEXT_PUBLIC_WC_PROJECT_ID in frontend/.env.local."
      );
      return;
    }

    if (!/^[a-fA-F0-9]{32}$/.test(projectId)) {
      setError(
        "Invalid WalletConnect Project ID. Expected a 32-character hex ID from cloud.reown.com (not an Ethereum address)."
      );
      return;
    }

    setIsConnecting(true);
    try {
      // Reuse the initialized WalletConnect provider so Core is never initialized twice.
      let wcProvider = wcProviderRef.current;
      if (!wcProvider) {
        const { EthereumProvider } = await import(
          "@walletconnect/ethereum-provider"
        );

        const sepoliaRpc =
          process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() ||
          "https://ethereum-sepolia-rpc.publicnode.com";

        wcProvider = await EthereumProvider.init({
          projectId,
          chains: [SEPOLIA_CHAIN_ID],
          optionalChains: [1],
          showQrModal: true,
          metadata: {
            name: "ERC721 UX 101",
            description: "Sepolia ERC721 UX workshop dApp",
            url: window.location.origin,
            icons: [],
          },
          rpcMap: {
            [SEPOLIA_CHAIN_ID]: sepoliaRpc,
            1: "https://ethereum-rpc.publicnode.com",
          },
        });
        wcProviderRef.current = wcProvider;
      }

      const accounts =
        wcProvider.session && wcProvider.accounts.length > 0
          ? wcProvider.accounts
          : await wcProvider.enable();
      if (!accounts || accounts.length === 0) {
        throw new Error("No account was returned by WalletConnect.");
      }

      const providerBridge = wcProvider as unknown as WalletProviderLike;
      const rawChainId =
        wcProvider.chainId ||
        (await wcProvider.request({ method: "eth_chainId" }));

      activeProviderRef.current = providerBridge;
      setAddress(getAddress(accounts[0]));
      setChainId(parseChainId(rawChainId));
      setProviderType("walletconnect");
      attachListeners(providerBridge, "walletconnect");
    } catch (err) {
      setError(formatWalletError(err, "Failed to connect via WalletConnect."));
    } finally {
      setIsConnecting(false);
    }
  }, [attachListeners]);

  // Requests the active wallet to switch to Sepolia, adding the network if missing (4902).
  const switchToSepolia = useCallback(async () => {
    setError(null);
    const provider =
      activeProviderRef.current ??
      (typeof window !== "undefined" ? window.ethereum : null);

    if (!provider) {
      setError("Connect a wallet before switching networks.");
      return;
    }

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_HEX }],
      });
    } catch (switchErr) {
      const code = getRpcErrorCode(switchErr);
      const message =
        switchErr instanceof Error ? switchErr.message.toLowerCase() : "";

      // Error 4902 means Sepolia is not yet configured in the user's wallet.
      if (code === 4902 || message.includes("unrecognized chain")) {
        try {
          const sepoliaRpc =
            process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() ||
            "https://ethereum-sepolia-rpc.publicnode.com";

          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_HEX,
                chainName: "Sepolia",
                nativeCurrency: {
                  name: "Sepolia Ether",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: [sepoliaRpc],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } catch (addErr) {
          setError(formatWalletError(addErr, "Failed to add Sepolia network."));
          return;
        }
      } else {
        setError(
          formatWalletError(switchErr, "Failed to switch to Sepolia network.")
        );
        return;
      }
    }

    try {
      const rawChainId = await provider.request({ method: "eth_chainId" });
      setChainId(parseChainId(rawChainId));
    } catch {
      // Ignore if chainChanged listener already updated state.
    }
  }, []);

  // Disconnects WalletConnect sessions and clears app wallet state.
  const disconnect = useCallback(async () => {
    setError(null);
    const provider = activeProviderRef.current;
    const currentType = providerType;

    resetWalletState();

    if (currentType === "walletconnect" && provider?.disconnect) {
      try {
        await provider.disconnect();
      } catch {
        // Ignore disconnect cleanup errors.
      }
    }
  }, [providerType, resetWalletState]);

  // Builds a viem WalletClient bound to the active EIP-1193 provider for write transactions.
  const getWalletClient = useCallback((): WalletClient => {
    const provider = activeProviderRef.current;
    if (!provider || !address) {
      throw new Error("Please connect your wallet before sending transactions.");
    }

    return createWalletClient({
      account: address,
      chain: sepolia,
      transport: custom(provider as EIP1193Provider),
    });
  }, [address]);

  return (
    <WalletContext.Provider
      value={{
        address,
        ensName,
        chainId,
        providerType,
        isConnecting,
        error,
        isSepolia,
        connectInjected,
        connectWalletConnect,
        switchToSepolia,
        disconnect,
        clearError,
        getWalletClient,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside a <WalletProvider>.");
  }
  return context;
}
