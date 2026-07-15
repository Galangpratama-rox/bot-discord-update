const axios = require("axios");
const FormData = require("form-data");
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
 * Download gambar dari URL dan return sebagai Buffer.
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: {
      // Pura-pura browser untuk bypass hotlink protection
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://otakudesu.blog/",
    },
  });

  return {
    buffer: Buffer.from(response.data),
    contentType: response.headers["content-type"] || "image/jpeg",
  };
}

/**
 * Buat Discord embed object dari data anime.
 * @param {Object} anime
 * @returns {Object} Discord embed object
 */
function buildEmbed(anime) {
  return {
    color: EMBED_COLOR,
    // Menaruh status update di bagian author (atas title)
    author: {
      name: `📢 Update Anime Terbaru!`,
    },
    title: `${anime.title} — ${anime.episode}`,
    url: `${SITE_BASE_URL}/detail/${anime.animeId}`,
    description: `Episode terbaru **${anime.title}** sudah tersedia di AnimeSaga!`,
    image: {
      url: "attachment://gambar.jpg",
    },
    footer: {
      text: `${anime.day} • ${anime.date} • AnimeSaga`,
    },
  };
}

/**
 * Kirim satu notifikasi anime ke Discord webhook menggunakan multipart/form-data
 * agar thumbnail bisa dikirim sebagai attachment.
 * @param {Object} anime
 */
async function sendAnimeNotification(anime) {
  const embed = buildEmbed(anime);

  const payload = {
    username: BOT_NAME,
    embeds: [embed],
  };

  try {
    // Coba download thumbnail untuk dijadikan attachment
    let imageBuffer = null;
    let contentType = "image/jpeg";

    if (anime.thumbnail) {
      try {
        const result = await downloadImage(anime.thumbnail);
        imageBuffer = result.buffer;
        contentType = result.contentType;
      } catch (imgError) {
        console.warn(`[WEBHOOK] ⚠️ Gagal download thumbnail "${anime.title}": ${imgError.message}`);
      }
    }

    if (imageBuffer) {
      // Kirim sebagai multipart/form-data dengan attachment
      const form = new FormData();
      form.append("payload_json", JSON.stringify(payload));
      form.append("files[0]", imageBuffer, {
        filename: "gambar.jpg",
        contentType: contentType,
      });

      await axios.post(WEBHOOK_URL, form, {
        headers: form.getHeaders(),
        timeout: 20000,
      });
    } else {
      // Fallback: kirim tanpa gambar jika download gagal
      const fallbackPayload = {
        ...payload,
        embeds: [{
          ...embed,
          image: undefined,
        }],
      };

      await axios.post(WEBHOOK_URL, fallbackPayload, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      });
    }

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

  console.log(
    `[WEBHOOK] Mengirim ${animeList.length} notifikasi ke Discord...`
  );

  for (let i = 0; i < animeList.length; i++) {
    const anime = animeList[i];

    try {
      await sendAnimeNotification(anime);
    } catch (error) {
      console.error(
        `[WEBHOOK] ❌ Gagal kirim notifikasi untuk "${anime.title}": ${error.message}`
      );
      // Lanjutkan ke anime berikutnya meski ada yang gagal
    }

    // Jeda 1.5 detik antar request untuk menghindari rate limit Discord
    if (i < animeList.length - 1) {
      await sleep(1500);
    }
  }

  console.log("[WEBHOOK] Selesai mengirim semua notifikasi.");
}

/**
 * Kirim pesan ringkasan jika banyak anime baru sekaligus (opsional).
 * @param {number} count - Jumlah anime baru
 */
async function sendSummaryMessage(count) {
  if (count === 0) return;

  const payload = {
    username: BOT_NAME,
    content: `✅ **${count} anime baru** telah dinotifikasikan!`,
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
