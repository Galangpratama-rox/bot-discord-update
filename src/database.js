const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Validasi env yang wajib ada
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error(
    "[ERROR] SUPABASE_URL dan SUPABASE_ANON_KEY wajib diisi di file .env"
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Ambil semua animeId yang sudah tersimpan di database.
 * Dipakai untuk membandingkan dengan data dari API.
 * @returns {Promise<Set<string>>} Set berisi animeId yang sudah ada
 */
async function getExistingAnimeIds() {
  const { data, error } = await supabase
    .from("anime_updates")
    .select("anime_id");

  if (error) {
    throw new Error(`Gagal mengambil data dari database: ${error.message}`);
  }

  return new Set(data.map((row) => row.anime_id));
}

/**
 * Cek apakah kombinasi animeId + episode sudah ada di database.
 * Ini memastikan update episode baru tetap terdeteksi meskipun anime sudah ada.
 * @param {string} animeId
 * @param {string} episode
 * @returns {Promise<boolean>}
 */
async function isEpisodeExists(animeId, episode) {
  const { data, error } = await supabase
    .from("anime_updates")
    .select("id")
    .eq("anime_id", animeId)
    .eq("episode", episode)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal cek episode di database: ${error.message}`);
  }

  return data !== null;
}

/**
 * Simpan satu data anime ke database.
 * @param {Object} anime - Object anime dari API
 * @returns {Promise<Object>} Data yang berhasil disimpan
 */
async function saveAnime(anime) {
  const { data, error } = await supabase
    .from("anime_updates")
    .insert({
      anime_id: anime.animeId,
      title: anime.title,
      episode: anime.episode,
      thumbnail: anime.thumbnail,
      day: anime.day,
      date: anime.date,
      otakudesu_url: anime.otakudesuUrl,
      notified_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `Gagal menyimpan anime "${anime.title}": ${error.message}`
    );
  }

  return data;
}

/**
 * Simpan banyak anime sekaligus (batch insert).
 * @param {Array<Object>} animeList - Array anime dari API
 * @returns {Promise<Array>} Data yang berhasil disimpan
 */
async function saveAnimesBatch(animeList) {
  const records = animeList.map((anime) => ({
    anime_id: anime.animeId,
    title: anime.title,
    episode: anime.episode,
    thumbnail: anime.thumbnail,
    day: anime.day,
    date: anime.date,
    otakudesu_url: anime.otakudesuUrl,
    notified_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("anime_updates")
    .insert(records)
    .select();

  if (error) {
    throw new Error(`Gagal batch insert: ${error.message}`);
  }

  return data;
}

module.exports = {
  supabase,
  getExistingAnimeIds,
  isEpisodeExists,
  saveAnime,
  saveAnimesBatch,
};
