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
 * Download gambar menggunakan ScraperAPI dengan parameter premium + binary.
 * Validasi content-type sebelum return agar tidak upload HTML zonk ke Supabase.
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function downloadImageBuffer(url) {
  if (!SCRAPER_API_KEY) {
    throw new Error("SCRAPER_API_KEY belum diisi di .env");
  }

  // Gunakan premium=true dan binary=true khusus untuk file gambar
  const requestUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&premium=true&binary=true`;

  console.log(`[STORAGE] Downloading via ScraperAPI (premium+binary): ${url}`);

  const response = await axios.get(requestUrl, {
    responseType: "arraybuffer",
    timeout: 60000, // 60 detik
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const contentType = response.headers["content-type"] || "";

  // Validasi: jika response adalah HTML (kena Cloudflare/captcha), batalkan
  if (contentType.includes("text/html")) {
    throw new Error(
      `Response bukan gambar (content-type: ${contentType}) — kemungkinan kena blokir Cloudflare`
    );
  }

  return {
    buffer: Buffer.from(response.data),
    contentType: contentType || "image/jpeg",
  };
}

/**
 * Upload thumbnail ke Supabase Storage dan return public URL-nya.
 * Download dan upload dipisah try-catch agar error bisa diidentifikasi dengan jelas.
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
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);
    return data.publicUrl;
  }

  // === STEP 1: Download gambar via ScraperAPI ===
  let buffer, contentType;
  try {
    const result = await downloadImageBuffer(thumbnailUrl);
    buffer = result.buffer;
    contentType = result.contentType;
  } catch (err) {
    const status = err.response?.status || "no response";
    const message = err.message || "unknown error";

    if (message.includes("HTML")) {
      console.warn(`[STORAGE] ⚠️ Gagal DOWNLOAD (ScraperAPI): ScraperAPI mengembalikan HTML (Blokir), bukan gambar. | URL: ${thumbnailUrl}`);
    } else {
      console.warn(`[STORAGE] ⚠️ Gagal DOWNLOAD (ScraperAPI): ${message} | Status: ${status}`);
    }
    return null;
  }

  // === STEP 2: Upload ke Supabase Storage ===
  try {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn(`[STORAGE] ⚠️ Gagal UPLOAD (Supabase): ${error.message}`);
      return null;
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName);

    console.log(`[STORAGE] ✅ Upload berhasil: ${animeId}`);
    return data.publicUrl;
  } catch (err) {
    console.warn(`[STORAGE] ⚠️ Gagal UPLOAD (Supabase): ${err.message}`);
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
