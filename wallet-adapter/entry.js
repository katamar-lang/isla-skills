// Official Solana wallet-adapter pieces (no React), exposed as window.SolanaWalletAdapter.
import { getWallets } from "@wallet-standard/app";
import { StandardWalletAdapter } from "@solana/wallet-standard-wallet-adapter-base";
import { WalletReadyState, WalletNotReadyError, isWalletAdapterCompatibleStandardWallet } from "@solana/wallet-adapter-base";
import { registerMwa, createDefaultAuthorizationCache, createDefaultChainSelector, createDefaultWalletNotFoundHandler, SolanaMobileWalletAdapterWalletName } from "@solana-mobile/wallet-standard-mobile";
window.SolanaWalletAdapter = { getWallets, StandardWalletAdapter, isWalletAdapterCompatibleStandardWallet, WalletReadyState, WalletNotReadyError,
  registerMwa, createDefaultAuthorizationCache, createDefaultChainSelector, createDefaultWalletNotFoundHandler, SolanaMobileWalletAdapterWalletName };
