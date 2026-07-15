const axios = require("axios");
require("dotenv").config();

const ANIME_API_URL = process.env.ANIME_API_URL;

/**
 * Fetch daftar anime ongoing terbaru dari API.
 * @returns {Promise<Array>} Array berisi objek anime
 */
async function fetchOngoingAnime() {
  try {
    console.log(`[API] Mengambil data dari: ${ANIME_API_URL}`);

    const response = await axios.get(ANIME_API_URL, {
      timeout: 15000, // 15 detik timeout
      headers: {
        "User-Agent": "AnimeDiscordBot/1.0",
        Accept: "application/json",
      },
    });

    const body = response.data;

    // Validasi struktur response API
    if (!body.success) {
      throw new Error(`API mengembalikan success: false`);
    }

    if (!body.data || !Array.isArray(body.data.animeList)) {
      throw new Error(`Struktur response API tidak valid, animeList tidak ditemukan`);
    }

    console.log(
      `[API] Berhasil mengambil ${body.data.animeList.length} anime dari API`
    );

    return body.data.animeList;
  } catch (error) {
    if (error.response) {
      // Error dari server API
      throw new Error(
        `API error ${error.response.status}: ${error.response.statusText}`
      );
    } else if (error.request) {
      // Request terkirim tapi tidak ada response (timeout/network)
      throw new Error(`Tidak bisa terhubung ke API: ${error.message}`);
    } else {
      throw new Error(`Error saat fetch API: ${error.message}`);
    }
  }
}

module.exports = { fetchOngoingAnime };
