const axios = require("axios");
require("dotenv").config();

if (!process.env.DISCORD_WEBHOOK_URL) {
  console.error("[ERROR] DISCORD_WEBHOOK_URL wajib diisi di file .env");
  process.exit(1);
}

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.animesaga.online").replace(/\/$/, "");
const BOT_NAME = process.env.BOT_NAME || "AnimeSaga Bot";

// Satu warna solid untuk semua embed
const EMBED_COLOR = 0x2f3136;

/**
 * Buat Discord embed object dari data anime.
 * thumbnail sudah berupa public URL dari Supabase Storage.
 * @param {Object} anime
 * @returns {Object} Discord embed object
 */
function buildEmbed(anime) {
  const embed = {
    color: EMBED_COLOR,
    title: `${anime.title} — ${anime.episode}`,
    url: `${SITE_BASE_URL}/detail/${anime.animeId}`,
    description: `Episode terbaru **${anime.title}** sudah tersedia di AnimeSaga!`,
    footer: {
      text: `${anime.day} • ${anime.date} • AnimeSaga`,
    },
    timestamp: new Date().toISOString(),
  };

  // Pasang thumbnail jika ada
  if (anime.thumbnail) {
    embed.image = { url: anime.thumbnail };
  }

  return embed;
}

/**
 * Kirim satu notifikasi anime ke Discord webhook.
 * @param {Object} anime
 */
async function sendAnimeNotification(anime) {
  const embed = buildEmbed(anime);

  const payload = {
    username: BOT_NAME,
    content: "📢 **Update Anime Baru!**",
    embeds: [embed],
  };

  try {
    await axios.post(WEBHOOK_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    console.log(`[WEBHOOK] ✅ Terkirim: ${anime.title} - ${anime.episode}`);
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Webhook Discord error ${error.response.status}: ${JSON.stringify(error.response.data)}`
      );
    }
    throw new Error(`Gagal kirim webhook: ${error.message}`);
  }
}

/**
 * Kirim beberapa notifikasi anime sekaligus dengan jeda antar request.
 * Discord membatasi rate: 30 request per menit per webhook.
 * @param {Array<Object>} animeList
 */
async function sendBatchNotifications(animeList) {
  if (animeList.length === 0) {
    console.log("[WEBHOOK] Tidak ada notifikasi baru yang perlu dikirim.");
    return;
  }

  console.log(`[WEBHOOK] Mengirim ${animeList.length} notifikasi ke Discord...`);

  for (let i = 0; i < animeList.length; i++) {
    const anime = animeList[i];

    try {
      await sendAnimeNotification(anime);
    } catch (error) {
      console.error(
        `[WEBHOOK] ❌ Gagal kirim notifikasi untuk "${anime.title}": ${error.message}`
      );
    }

    // Jeda 1.5 detik antar request untuk menghindari rate limit Discord
    if (i < animeList.length - 1) {
      await sleep(1500);
    }
  }

  console.log("[WEBHOOK] Selesai mengirim semua notifikasi.");
}

/**
 * Kirim pesan ringkasan setelah semua notifikasi terkirim.
 * @param {number} count
 */
async function sendSummaryMessage(count) {
  if (count === 0) return;

  const payload = {
    username: BOT_NAME,
  };

  try {
    await axios.post(WEBHOOK_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });
  } catch (error) {
    console.error(`[WEBHOOK] Gagal kirim summary: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  sendAnimeNotification,
  sendBatchNotifications,
  sendSummaryMessage,
};
