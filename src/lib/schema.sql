CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_url text NOT NULL,
  platform text NOT NULL DEFAULT 'generic',
  connector_config text,
  glossary text NOT NULL DEFAULT '',
  auto_translate boolean NOT NULL DEFAULT true,
  max_pages integer NOT NULL DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sites_user_idx ON sites(user_id);

CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  mode text NOT NULL,
  input_urls jsonb NOT NULL DEFAULT '[]',
  max_pages integer NOT NULL,
  pages_total integer NOT NULL DEFAULT 0,
  pages_done integer NOT NULL DEFAULT 0,
  score integer,
  summary jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS scans_site_idx ON scans(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url text NOT NULL,
  final_url text,
  http_status integer,
  title text,
  html_lang text,
  page_language text,
  score integer,
  metrics jsonb,
  hreflang jsonb,
  blocks jsonb,
  console_errors jsonb,
  has_screenshot boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pages_scan_idx ON pages(scan_id);
-- The business name the page declares (og:site_name), added after launch.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS site_name text;

CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  code text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  details jsonb
);
CREATE INDEX IF NOT EXISTS issues_page_idx ON issues(page_id);
CREATE INDEX IF NOT EXISTS issues_scan_idx ON issues(scan_id);

CREATE TABLE IF NOT EXISTS translation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  source_hash text NOT NULL,
  source_text text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  context text,
  first_seen_url text,
  last_seen_scan_id uuid,
  occurrences integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  draft_text text,
  final_text text,
  provider text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, source_hash, kind)
);
CREATE INDEX IF NOT EXISTS translation_site_status_idx ON translation_items(site_id, status);
