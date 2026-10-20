export type Platform = "generic" | "shopify" | "wordpress";

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  options?: string[];
  placeholder?: string;
  help?: string;
  secret?: boolean;
}

export type ConnectorConfig = Record<string, string>;

export interface PublishItem {
  id: string;
  sourceText: string;
  frenchText: string;
  kind: string;
  pageUrl: string | null;
}

export interface PublishResult {
  published: string[]; // translation item ids pushed to the store
  message: string;
}

/**
 * A store integration. Scanning works for every platform through the public
 * website; connectors add authenticated store access: better URL discovery and
 * (once implemented) writing approved French translations back to the store.
 */
export interface StoreConnector {
  platform: Platform;
  label: string;
  description: string;
  configFields: ConfigField[];
  /** Whether publishTranslations is implemented yet. */
  canPublish: boolean;
  testConnection(config: ConnectorConfig): Promise<{ ok: boolean; message: string }>;
  /** Extra URLs to scan (e.g. from the store API). Return [] to rely on sitemap discovery. */
  discoverUrls(baseUrl: string, config: ConnectorConfig, limit: number): Promise<string[]>;
  publishTranslations(config: ConnectorConfig, items: PublishItem[]): Promise<PublishResult>;
}

export class NotImplementedError extends Error {}
