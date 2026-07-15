const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
require("dotenv").config();

// Validasi env wajib
const requiredEnvs = ["DISCORD_BOT_TOKEN", "DISCORD_CHANNEL_ID"];
for (const key of requiredEnvs) {
  if (!process.env[key]) {
    console.error(`[ERROR] ${key} wajib diisi di file .env`);
    process.exit(1);
  }
}

const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://www.animesaga.online").replace(/\/$/, "");
const BOT_NAME = process.env.BOT_NAME || "AnimeSaga Bot";
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const EMBED_COLOR = 0x2f3136;

// Inisialisasi Discord client
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

let isReady = false;

/**
 * Login bot Discord dan tunggu sampai ready.
 */
async function initBot() {
  if (isReady) return;

  return new Promise((resolve, reject) => {
    client.once("ready", () => {
      console.log(`[BOT] ✅ Login sebagai: ${client.user.tag}`);
      isReady = true;
      resolve();
    });

    client.once("error", reject);
    client.login(process.env.DISCORD_BOT_TOKEN).catch(reject);
  });
}

/**
 * Buat Discord embed dari data anime.
 * @param {Object} anime
 * @returns {EmbedBuilder}
 */
function buildEmbed(anime) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: "📢 Update Anime Terbaru!" })
    .setTitle(`${anime.title} — ${anime.episode}`)
    .setURL(`${SITE_BASE_URL}/detail/${anime.animeId}`)
    .setDescription(`Episode terbaru **${anime.title}** sudah tersedia di AnimeSaga!`)
    .setFooter({ text: `${anime.day} • ${anime.date} • AnimeSaga` })
    .setTimestamp();

  if (anime.thumbnail) {
    embed.setImage(anime.thumbnail);
  }

  return embed;
}

/**
 * Buat button "Tonton" yang mengarah ke halaman detail anime.
 * @param {Object} anime
 * @returns {ActionRowBuilder}
 */
function buildButton(anime) {
  const button = new ButtonBuilder()
    .setLabel("▶ Tonton")
    .setStyle(ButtonStyle.Link)
    .setURL(`${SITE_BASE_URL}/detail/${anime.animeId}`);

  return new ActionRowBuilder().addComponents(button);
}

/**
 * Kirim satu notifikasi anime ke channel Discord.
 * @param {Object} anime
 */
async function sendAnimeNotification(anime) {
  await initBot();

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel) {
    throw new Error(`Channel dengan ID ${CHANNEL_ID} tidak ditemukan.`);
  }

  const embed = buildEmbed(anime);
  const row = buildButton(anime);

  await channel.send({
    embeds: [embed],
    components: [row],
  });

  console.log(`[BOT] ✅ Terkirim: ${anime.title} - ${anime.episode}`);
}

/**
 * Kirim beberapa notifikasi anime sekaligus dengan jeda antar pesan.
 * @param {Array<Object>} animeList
 */
async function sendBatchNotifications(animeList) {
  if (animeList.length === 0) {
    console.log("[BOT] Tidak ada notifikasi baru yang perlu dikirim.");
    return;
  }

  console.log(`[BOT] Mengirim ${animeList.length} notifikasi ke Discord...`);

  for (let i = 0; i < animeList.length; i++) {
    const anime = animeList[i];

    try {
      await sendAnimeNotification(anime);
    } catch (error) {
      console.error(`[BOT] ❌ Gagal kirim notifikasi untuk "${anime.title}": ${error.message}`);
    }

    // Jeda 1.5 detik antar pesan untuk menghindari rate limit Discord
    if (i < animeList.length - 1) {
      await sleep(1500);
    }
  }

  console.log("[BOT] Selesai mengirim semua notifikasi.");
}

/**
 * Kirim pesan ringkasan setelah semua notifikasi terkirim.
 * @param {number} count
 */
async function sendSummaryMessage(count) {
  // Summary message dinonaktifkan
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  initBot,
  sendAnimeNotification,
  sendBatchNotifications,
  sendSummaryMessage,
};
