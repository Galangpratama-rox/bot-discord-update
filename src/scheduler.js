const { fetchOngoingAnime } = require("./api");
const { isEpisodeExists, saveAnime } = require("./database");
const { sendBatchNotifications, sendSummaryMessage } = require("./webhook");

/**
 * Fungsi utama: ambil data dari API, bandingkan dengan database,
 * simpan yang baru, dan kirim ke Discord webhook.
 */
async function checkAndNotify() {
  const startTime = new Date();
  console.log(
    `\n${"=".repeat(60)}`
  );
  console.log(
    `[SCHEDULER] Mulai pengecekan pada: ${startTime.toLocaleString("id-ID", {
      timeZone: process.env.TIMEZONE || "Asia/Jakarta",
    })}`
  );
  console.log(`${"=".repeat(60)}`);

  try {
    // Langkah 1: Ambil data anime terbaru dari API
    const animeList = await fetchOngoingAnime();

    if (!animeList || animeList.length === 0) {
      console.log("[SCHEDULER] API tidak mengembalikan data anime.");
      return;
    }

    console.log(
      `[SCHEDULER] Memeriksa ${animeList.length} anime dari API...`
    );

    // Langkah 2: Filter anime yang belum ada di database
    // Cek berdasarkan kombinasi animeId + episode, bukan animeId saja
    // Ini agar update episode baru tetap terdeteksi
    const newAnimes = [];

    for (const anime of animeList) {
      try {
        const exists = await isEpisodeExists(anime.animeId, anime.episode);

        if (!exists) {
          console.log(
            `[SCHEDULER] 🆕 Baru: ${anime.title} - ${anime.episode}`
          );
          newAnimes.push(anime);
        } else {
          console.log(
            `[SCHEDULER] ⏭️  Sudah ada: ${anime.title} - ${anime.episode}`
          );
        }
      } catch (error) {
        console.error(
          `[SCHEDULER] Error cek database untuk "${anime.title}": ${error.message}`
        );
        // Skip anime ini jika ada error cek database
      }
    }

    console.log(
      `\n[SCHEDULER] Ditemukan ${newAnimes.length} anime/episode baru dari ${animeList.length} total.`
    );

    if (newAnimes.length === 0) {
      console.log("[SCHEDULER] Tidak ada update baru. Selesai.");
      return;
    }

    // Langkah 3: Simpan ke database dan kirim ke webhook
    console.log("\n[SCHEDULER] Menyimpan dan mengirim notifikasi...");

    const successfullySaved = [];

    for (const anime of newAnimes) {
      try {
        // Simpan ke database dulu
        await saveAnime(anime);
        console.log(`[DB] ✅ Tersimpan: ${anime.title} - ${anime.episode}`);
        successfullySaved.push(anime);
      } catch (error) {
        console.error(
          `[DB] ❌ Gagal simpan "${anime.title}": ${error.message}`
        );
        // Jika gagal simpan, jangan kirim webhook untuk anime ini
        // agar tidak ada duplikat notif jika ada retry
      }
    }

    // Langkah 4: Kirim ke Discord webhook untuk yang berhasil disimpan
    if (successfullySaved.length > 0) {
      await sendBatchNotifications(successfullySaved);
      await sendSummaryMessage(successfullySaved.length);
    }

    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(
      `\n[SCHEDULER] ✅ Selesai! ${successfullySaved.length} notifikasi terkirim dalam ${duration} detik.`
    );
  } catch (error) {
    console.error(`[SCHEDULER] ❌ Error tidak terduga: ${error.message}`);
    console.error(error.stack);
  }
}

module.exports = { checkAndNotify };
