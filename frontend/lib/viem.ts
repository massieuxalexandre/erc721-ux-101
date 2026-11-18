import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

// Fall back to viem's default public transport if the env var is not set at build time.
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim();

// Read-only client for all Sepolia contract queries and transaction receipts.
export const sepoliaPublicClient = createPublicClient({
  chain: sepolia,
  transport: sepoliaRpcUrl ? http(sepoliaRpcUrl) : http(),
});

// Read-only Ethereum Mainnet client used exclusively for ENS reverse resolution (getEnsName).
export const mainnetPublicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com"),
});

/**
 * Formats an Ethereum address like "0x1234...abcd" for display in the UI.
 */
export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) {
    return address;
  }
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Builds a Sepolia Etherscan link for a transaction hash.
 */
export function etherscanTxUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

/**
 * Builds a Sepolia Etherscan link for an account or contract address.
 */
export function etherscanAddressUrl(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
