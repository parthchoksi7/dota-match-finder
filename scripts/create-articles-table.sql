-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Creates the articles table for the SpectateEsports editorial pipeline.

CREATE TABLE IF NOT EXISTS articles (
  id           BIGSERIAL PRIMARY KEY,
  slug         TEXT        UNIQUE NOT NULL,
  title        TEXT        NOT NULL,
  subtitle     TEXT,
  published_at DATE        NOT NULL,
  tournament   TEXT        NOT NULL,
  tournament_label TEXT    NOT NULL,
  category     TEXT        NOT NULL CHECK (category IN ('News', 'Preview', 'Analysis')),
  reading_time INTEGER     NOT NULL DEFAULT 3,
  watch_query  TEXT,
  watch_label  TEXT,
  excerpt      TEXT        NOT NULL,
  sections     JSONB       NOT NULL DEFAULT '[]',
  status       TEXT        NOT NULL DEFAULT 'published'
                           CHECK (status IN ('published', 'draft', 'archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS articles_published_at_idx
  ON articles (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS articles_tournament_idx
  ON articles (tournament)
  WHERE status = 'published';

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS articles_updated_at ON articles;
CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Allow public reads (anon key) — no RLS needed for public editorial content
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'articles' AND policyname = 'Public read published articles'
  ) THEN
    CREATE POLICY "Public read published articles"
      ON articles FOR SELECT
      USING (status = 'published');
  END IF;
END$$;

-- Explicit grants for service_role (needed with Supabase's new sb_secret key format)
GRANT ALL ON TABLE articles TO service_role;
GRANT USAGE, SELECT ON SEQUENCE articles_id_seq TO service_role;
