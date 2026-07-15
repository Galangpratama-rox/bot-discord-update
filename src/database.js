const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");
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

const STORAGE_BUCKET = "thumbnails";

/**
 * Download gambar dari URL otakudesu dengan spoofed headers.
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function downloadImageBuffer(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://otakudesu.blog/",
      "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  return {
    buffer: Buffer.from(response.data),
    contentType: response.headers["content-type"] || "image/jpeg",
  };
}

/**
 * Upload thumbnail ke Supabase Storage dan return public URL-nya.
 * Jika sudah ada (anime yang sama), langsung return URL yang existing.
 * @param {string} animeId
 * @param {string} thumbnailUrl - URL asli dari API
 * @returns {Promise<string|null>} Public URL di Supabase Storage, atau null jika gagal
 */
async function uploadThumbnail(animeId, thumbnailUrl) {
  if (!thumbnailUrl) return null;

  const fileName = `${animeId}.jpg`;

  // Cek apakah sudah ada di storage
  const { data: existing } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list("", { search: fileName });

  if (existing && existing.length > 0) {
    // Sudah ada, langsung return public URL
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);
    return data.publicUrl;
  }

  // Belum ada, download dulu lalu upload
  try {
    const { buffer, contentType } = await downloadImageBuffer(thumbnailUrl);

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn(`[STORAGE] ⚠️ Gagal upload thumbnail ${animeId}: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);

    console.log(`[STORAGE] ✅ Upload thumbnail: ${animeId}`);
    return data.publicUrl;
  } catch (err) {
    console.warn(`[STORAGE] ⚠️ Gagal download/upload thumbnail ${animeId}: ${err.message}`);
    return null;
  }
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
  uploadThumbnail,
};
