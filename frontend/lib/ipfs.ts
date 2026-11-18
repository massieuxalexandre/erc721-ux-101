export interface TokenAttribute {
  trait_type?: string;
  value?: string | number;
}

export interface TokenMetadata {
  image?: string;
  name?: string;
  description?: string;
  attributes?: TokenAttribute[];
}

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

/**
 * Converts `ipfs://` or gateway `/ipfs/` URIs into an ordered list of HTTP gateway URLs.
 * Public gateways (`ipfs.io`, `dweb.link`) come before Pinata to avoid Pinata 429 rate limits.
 */
export function toIpfsGatewayUrls(uri: string): string[] {
  const trimmed = uri.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("ipfs://")) {
    let path = trimmed.slice("ipfs://".length);
    if (path.startsWith("ipfs/")) {
      path = path.slice("ipfs/".length);
    }
    path = path.replace(/^\/+/, "");
    return IPFS_GATEWAYS.map((gateway) => `${gateway}${path}`);
  }

  const ipfsSegmentIndex = trimmed.indexOf("/ipfs/");
  if (ipfsSegmentIndex !== -1) {
    const path = trimmed
      .slice(ipfsSegmentIndex + "/ipfs/".length)
      .replace(/^\/+/, "");
    return IPFS_GATEWAYS.map((gateway) => `${gateway}${path}`);
  }

  return [trimmed];
}

/**
 * Decodes inline `data:application/json...` metadata URIs when a collection stores JSON on-chain.
 */
function parseInlineJsonUri(uri: string): TokenMetadata | null {
  const base64Prefix = "data:application/json;base64,";
  if (uri.startsWith(base64Prefix)) {
    const base64 = uri.slice(base64Prefix.length);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const jsonText = new TextDecoder().decode(bytes);
    return JSON.parse(jsonText) as TokenMetadata;
  }

  const utf8Prefix = "data:application/json,";
  if (uri.startsWith(utf8Prefix)) {
    const jsonText = decodeURIComponent(uri.slice(utf8Prefix.length));
    return JSON.parse(jsonText) as TokenMetadata;
  }

  return null;
}

/**
 * Fetches NFT JSON metadata from inline data URIs or IPFS/HTTP gateways with a 7s timeout per gateway.
 */
export async function fetchTokenMetadata(uri: string): Promise<TokenMetadata> {
  const inline = parseInlineJsonUri(uri.trim());
  if (inline) {
    return inline;
  }

  const candidateUrls = toIpfsGatewayUrls(uri);
  if (candidateUrls.length === 0) {
    throw new Error("Token URI is empty.");
  }

  let lastError: unknown;

  for (const url of candidateUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      const data = (await response.json()) as TokenMetadata;
      return data;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Unable to load token metadata (${lastError.message}).`
      : "Unable to load token metadata from IPFS."
  );
}
