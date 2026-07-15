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
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "";

/**
 * Download gambar menggunakan ScraperAPI untuk bypass hotlink/IP block.
 * Fallback ke direct request jika SCRAPER_API_KEY tidak diset.
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function downloadImageBuffer(url) {
  const requestUrl = SCRAPER_API_KEY
    ? `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`
    : url;

  console.log(`[STORAGE] Downloading via ${SCRAPER_API_KEY ? "ScraperAPI" : "direct"}: ${url}`);

  const response = await axios.get(requestUrl, {
    responseType: "arraybuffer",
    timeout: 60000, // 60 detik
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
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
