require("dotenv").config();
const cron = require("node-cron");
const { checkAndNotify } = require("./scheduler");

// ============================
// Validasi env wajib saat startup
// ============================
const requiredEnvs = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "DISCORD_WEBHOOK_URL",
  "SITE_BASE_URL",
];

const missingEnvs = requiredEnvs.filter((key) => !process.env[key]);

if (missingEnvs.length > 0) {
  console.error(
    `[ERROR] Environment variable berikut wajib diisi di .env:\n  - ${missingEnvs.join(
      "\n  - "
    )}`
  );
  console.error(
    "[ERROR] Salin .env.example ke .env dan isi semua nilai yang diperlukan."
  );
  process.exit(1);
}

// ============================
// Konfigurasi scheduler
// ============================
const CHECK_INTERVAL_HOURS = parseInt(process.env.CHECK_INTERVAL_HOURS) || 2;
const TIMEZONE = process.env.TIMEZONE || "Asia/Jakarta";

// Bangun cron expression berdasarkan interval jam
// Contoh: interval 2 jam → "0 */2 * * *" (setiap jam 0, 2, 4, 6, dst)
const cronExpression = `0 */${CHECK_INTERVAL_HOURS} * * *`;

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║          🎌 Anime Discord Webhook Bot - Aktif 🎌           ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log(`\n[CONFIG] API URL        : ${process.env.ANIME_API_URL }`);
console.log(`[CONFIG] Supabase URL   : ${process.env.SUPABASE_URL}`);
console.log(`[CONFIG] Interval Cek   : Setiap ${CHECK_INTERVAL_HOURS} jam`);
console.log(`[CONFIG] Timezone       : ${TIMEZONE}`);
console.log(`[CONFIG] Cron Expression: ${cronExpression}`);
console.log();

// ============================
// Jalankan sekali saat pertama kali bot start
// ============================
console.log("[INIT] Menjalankan pengecekan pertama saat startup...");
checkAndNotify();

// ============================
// Jadwalkan pengecekan berkala setiap X jam
// ============================
const job = cron.schedule(
  cronExpression,
  () => {
    checkAndNotify();
  },
  {
    scheduled: true,
    timezone: TIMEZONE,
  }
);

console.log(
  `\n[SCHEDULER] Bot berjalan. Pengecekan berikutnya setiap ${CHECK_INTERVAL_HOURS} jam.`
);
console.log("[SCHEDULER] Tekan CTRL+C untuk menghentikan bot.\n");

// ============================
// Graceful shutdown
// ============================
process.on("SIGINT", () => {
  console.log("\n[SHUTDOWN] Menghentikan bot...");
  job.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[SHUTDOWN] Menerima SIGTERM, menghentikan bot...");
  job.stop();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("[ERROR] Unhandled Rejection:", reason);
});
