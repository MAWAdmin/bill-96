import { decrypt, encrypt } from "../crypto";
import { shopifyConnector } from "./shopify";
import { wordpressConnector } from "./wordpress";
import { NotImplementedError, type ConnectorConfig, type Platform, type StoreConnector } from "./types";

const genericConnector: StoreConnector = {
  platform: "generic",
  label: "Any website",
  description: "Scans the public website only. No store credentials needed.",
  canPublish: false,
  configFields: [],
  async testConnection() {
    return { ok: true, message: "No connection needed for generic websites." };
  },
  async discoverUrls() {
    return [];
  },
  async publishTranslations() {
    throw new NotImplementedError("Generic websites have no publish target. Export translations instead.");
  },
};

export const CONNECTORS: Record<Platform, StoreConnector> = {
  generic: genericConnector,
  shopify: shopifyConnector,
  wordpress: wordpressConnector,
};

export const PLATFORMS = Object.keys(CONNECTORS) as Platform[];

export function getConnector(platform: string): StoreConnector {
  return CONNECTORS[platform as Platform] ?? genericConnector;
}

export function sealConfig(config: ConnectorConfig): string {
  return encrypt(JSON.stringify(config));
}

export function openConfig(sealed: string | null): ConnectorConfig {
  if (!sealed) return {};
  try {
    return JSON.parse(decrypt(sealed));
  } catch {
    return {};
  }
}

export type { Platform, StoreConnector, ConnectorConfig };
