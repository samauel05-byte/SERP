-- Run this in the Supabase SQL editor for your project

-- 1. Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS direct_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  access_direct BOOLEAN NOT NULL DEFAULT true,
  access_cami BOOLEAN NOT NULL DEFAULT false,
  access_nala BOOLEAN NOT NULL DEFAULT false,
  portals_direct TEXT[] NOT NULL DEFAULT '{dgii,tss,trabajo,sirla}',
  user_key_salt TEXT,
  vault_key_iv TEXT,
  vault_key_ct TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Credentials table (encrypted, global)
CREATE TABLE IF NOT EXISTS direct_credentials (
  id TEXT PRIMARY KEY,
  institution TEXT NOT NULL,
  category TEXT NOT NULL,
  iv TEXT NOT NULL,
  ct TEXT NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- 3. Config table
CREATE TABLE IF NOT EXISTS direct_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 4. Enable RLS (server uses service role key so these are bypassed server-side)
ALTER TABLE direct_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_config ENABLE ROW LEVEL SECURITY;

-- 5. Deny all JWT-based access (server only uses service role)
CREATE POLICY "deny_jwt" ON direct_profiles FOR ALL USING (false);
CREATE POLICY "deny_jwt" ON direct_credentials FOR ALL USING (false);
CREATE POLICY "deny_jwt" ON direct_config FOR ALL USING (false);

-- 6. IR-2 Resumen DGII table
CREATE TABLE IF NOT EXISTS ir2_resumen (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rnc         TEXT NOT NULL,
  anio        INTEGER NOT NULL,
  nombre      TEXT NOT NULL DEFAULT '',
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(rnc, anio)
);
ALTER TABLE ir2_resumen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_jwt" ON ir2_resumen FOR ALL USING (false);
