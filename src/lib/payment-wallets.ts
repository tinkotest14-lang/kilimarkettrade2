export type NetworkWalletKey =
  | "BTC"
  | "ETH"
  | "USDT TRC20"
  | "USDC"
  | "SOL";

export const DEFAULT_PAYMENT_WALLETS: Record<NetworkWalletKey, string> = {
  BTC: "bc1q9x4h7u2k9p3s5r7y8w0p2x4q6n8j0m2l3k5t7v",
  ETH: "0x8A4dB4f0D1c9E7aF4A7d3b2C4d8F0dEcB21A8A2B",
  "USDT TRC20": "TQf4Gq4PqYxE5Z3aQ2H8v4VmB9CxL1mJEr",
  USDC: "0xC4e3d2f9B8dE1a8f9C2f3F2E5dA4A8A4c2F1F2A0",
  SOL: "7Y2X9pTbf8L3Aq9mCkzP81vQrA6L7yK4sD3wX5nQh6M",
};

const WALLET_STORAGE_KEY = "kili_payment_wallets";

function readStoredWallets(): Partial<Record<NetworkWalletKey, string>> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(WALLET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<Record<NetworkWalletKey, string>>;
  } catch {
    return {};
  }
}

export function getPaymentAddress(network: string) {
  const key = network as NetworkWalletKey;
  const overrides = readStoredWallets();
  return overrides[key] ?? DEFAULT_PAYMENT_WALLETS[key] ?? DEFAULT_PAYMENT_WALLETS.BTC;
}

export function setPaymentWallets(overrides: Partial<Record<NetworkWalletKey, string>>) {
  if (typeof window === "undefined") return;

  const next = { ...readStoredWallets(), ...overrides };
  window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("kili-payment-wallets-updated"));
}

export function clearPaymentWallets() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WALLET_STORAGE_KEY);
  window.dispatchEvent(new Event("kili-payment-wallets-updated"));
}

export const PAYMENT_WALLET_NETWORKS = Object.keys(DEFAULT_PAYMENT_WALLETS) as NetworkWalletKey[];
