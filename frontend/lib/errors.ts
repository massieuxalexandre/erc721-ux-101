import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";

/**
 * Extracts a numeric RPC error code if present anywhere in an unknown error object.
 */
function extractErrorCode(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as Record<string, unknown>;
  if (typeof record.code === "number") return record.code;
  if (typeof record.cause === "object" && record.cause !== null) {
    return extractErrorCode(record.cause);
  }
  return undefined;
}

/**
 * Converts viem, EIP-1193 wallet, and Solidity revert errors into clear,
 * user-friendly English messages (never raw JSON or stack traces).
 */
export function formatTxError(err: unknown): string {
  if (err instanceof BaseError) {
    // 1. User cancelled or rejected the signature/transaction in their wallet.
    const rejected = err.walk(
      (inner) => inner instanceof UserRejectedRequestError
    );
    if (rejected || extractErrorCode(err) === 4001) {
      return "Transaction was rejected in your wallet.";
    }

    // 2. On-chain or simulated Solidity revert (e.g. require("Evaluator: ...")).
    const reverted = err.walk(
      (inner) => inner instanceof ContractFunctionRevertedError
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      if (reverted.reason) {
        return `Transaction reverted: ${reverted.reason}`;
      }
      if (reverted.data?.errorName) {
        return `Transaction reverted: ${reverted.data.errorName}`;
      }
      return reverted.shortMessage || "Transaction reverted on-chain.";
    }

    // 3. Common RPC/gas balance issues.
    const shortMsg = err.shortMessage || "";
    if (shortMsg.toLowerCase().includes("insufficient funds")) {
      return "Insufficient Sepolia ETH to cover transaction value and gas fees.";
    }

    if (shortMsg) {
      return shortMsg;
    }
  }

  // Handle plain EIP-1193 provider errors that were not wrapped in viem BaseError.
  if (extractErrorCode(err) === 4001) {
    return "Transaction was rejected in your wallet.";
  }

  if (err instanceof Error && err.message) {
    const lower = err.message.toLowerCase();
    if (
      lower.includes("user rejected") ||
      lower.includes("user denied") ||
      lower.includes("rejected the request")
    ) {
      return "Transaction was rejected in your wallet.";
    }
    if (lower.includes("insufficient funds")) {
      return "Insufficient Sepolia ETH to cover transaction value and gas fees.";
    }
    // Avoid dumping huge raw JSON blobs into the alert banner.
    if (err.message.length < 220 && !err.message.trim().startsWith("{")) {
      return err.message;
    }
    return "Transaction failed. Please check your wallet and try again.";
  }

  return "An unexpected transaction error occurred.";
}
