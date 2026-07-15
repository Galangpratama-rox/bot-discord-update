-- ============================================================
-- Migration: Setup tabel anime_updates untuk Anime Discord Bot
-- Jalankan script ini di Supabase SQL Editor
-- ============================================================

-- Buat tabel utama untuk menyimpan history anime yang sudah dinotifikasi
CREATE TABLE IF NOT EXISTS public.anime_updates (
    id          BIGSERIAL PRIMARY KEY,
    anime_id    TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    episode     TEXT        NOT NULL,
    thumbnail   TEXT,
    day         TEXT,
    date        TEXT,
    otakudesu_url TEXT,
    notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk mempercepat query cek duplikat (anime_id + episode)
-- Ini adalah query yang paling sering dijalankan bot
CREATE UNIQUE INDEX IF NOT EXISTS idx_anime_updates_anime_episode
    ON public.anime_updates (anime_id, episode);

-- Index untuk query berdasarkan waktu notifikasi
CREATE INDEX IF NOT EXISTS idx_anime_updates_notified_at
    ON public.anime_updates (notified_at DESC);

-- Index untuk pencarian berdasarkan anime_id
CREATE INDEX IF NOT EXISTS idx_anime_updates_anime_id
    ON public.anime_updates (anime_id);

-- ============================================================
-- Row Level Security (RLS)
-- Aktifkan RLS agar hanya service role yang bisa write
-- ============================================================

-- Aktifkan RLS pada tabel
ALTER TABLE public.anime_updates ENABLE ROW LEVEL SECURITY;

-- Policy: izinkan SELECT untuk semua (anon key bisa baca)
CREATE POLICY "Allow public read" ON public.anime_updates
    FOR SELECT USING (true);

-- Policy: izinkan INSERT untuk semua (anon key bisa insert)
-- Jika ingin lebih aman, gunakan service_role key dan hapus policy ini
CREATE POLICY "Allow public insert" ON public.anime_updates
    FOR INSERT WITH CHECK (true);

-- ============================================================
-- Verifikasi: cek struktur tabel
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'anime_updates'
-- ORDER BY ordinal_position;
