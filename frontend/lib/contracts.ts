import { parseAbi, type Address } from "viem";

// Network configuration for Ethereum Sepolia testnet.
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_HEX = "0xaa36a7";

// Deployed contract addresses on Sepolia from the workshop README.
export const CONTRACTS: Record<
  | "tdToken"
  | "evaluator"
  | "fakeBAYC"
  | "fakeNefturians"
  | "fakeMeebits"
  | "fakeMeebitsClaimer",
  Address
> = {
  tdToken: "0x996BA4faE3a3c2d07aC780401B07E103553eAB92",
  evaluator: "0xe446502701fA5808DB07D817B00B660fB5EA6bFB",
  fakeBAYC: "0x262fc337408995376b35f950e98b7fB60CF691f5",
  fakeNefturians: "0x4F4f92733eEEe8405764EaA6D2B7304B59642469",
  fakeMeebits: "0x589d269675BE36E4cFc3a4e04c9E5dad2ef2C4d6",
  fakeMeebitsClaimer: "0xA45C08F929dfEf9a2B3E9eB3A5f9728F594f215a",
};

/**
 * Minimal ABIs written with viem's human-readable `parseAbi`.
 *
 * Why `parseAbi` instead of huge JSON ABI files?
 * 1. We only list the exact functions and events our frontend uses, keeping the
 *    bundle small and the code easy to read.
 * 2. Viem infers full TypeScript types (argument types and return types) directly
 *    from these Solidity-style signature strings.
 */

// ERC20Points.sol: non-transferable workshop points token (TD Token).
export const tdTokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

// Evaluator.sol: tracks student registration and exercise completion (0..3).
export const evaluatorAbi = parseAbi([
  "function pointsERC20() view returns (address)",
  "function hasSubmitted(address student) view returns (bool)",
  "function exerciseProgression(address student, uint256 exerciseId) view returns (bool)",
  "function submitExercise()",
  "function ex1_claimedFakeBAYC()",
  "function ex2_boughtFakeNefturians()",
  "function ex3_claimedFakeMeebits()",
  "event StudentRegistered(address indexed student)",
  "event PointsAwarded(address indexed student, uint256 exerciseId, uint256 points)",
]);

// FakeBAYC.sol: ERC721Enumerable collection with free claiming.
export const fakeBAYCAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function tokenCounter() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function claimAToken()",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

// FakeNefturians.sol: ERC721Enumerable collection with a fixed ETH price.
export const fakeNefturiansAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function tokenCounter() view returns (uint256)",
  "function tokenPrice() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function buyAToken() payable",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

// FakeMeebits.sol: standard ERC721 (not Enumerable) minted via FakeMeebitsClaimer.
export const fakeMeebitsAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function whitelist(address account) view returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

// FakeMeebitsClaimer.sol: verifies signed vouchers and mints FakeMeebits tokens.
export const fakeMeebitsClaimerAbi = parseAbi([
  "function maxTokenId() view returns (uint256)",
  "function totalFunds() view returns (uint256)",
  "function fakeMeebits() view returns (address)",
  "function tokensThatWereClaimed(uint256 tokenId) view returns (bool)",
  "function whitelist(address account) view returns (bool)",
  "function claimAToken(uint256 _tokenToClaim, bytes _signature) payable",
  "event ATokenWasClaimed(uint256 indexed tokenNumber, address indexed tokenClaimer)",
]);
