# Panduan Build Android APK & Google Play Store (ScanDine POS)

Aplikasi ScanDine telah dikonfigurasi penuh dengan standar **TWA (Trusted Web Activity) & PWA**. Ini adalah standar resmi Google untuk merilis aplikasi web ke **Google Play Store**.

## Keunggulan Menggunakan TWA / PWA untuk Play Store:
1. **Database 100% Terhubung Real-Time**: Aplikasi di HP Android langsung mengakses server cloud Railway (`https://scandine-production-b6a8a689.up.railway.app`). Semua pesanan tamu, kasir, dan KDS dapur tersinkronisasi seketika via WebSockets.
2. **Auto-Update Tanpa Perlu Re-Upload APK**: Setiap update menu, harga, atau fitur di backoffice langsung berubah di HP pelanggan dan kasir tanpa pengguna harus update aplikasi di Play Store.
3. **Mendukung Mode Layar Penuh (Standalone)**: Tampilan tanpa bilah URL browser, persis seperti aplikasi Android native murni.

---

## Cara 1: Install Langsung di HP Android / Tablet (Tanpa Menunggu Play Store)
1. Buka link produksi di browser Chrome HP/Tablet:
   👉 `https://scandine-production-b6a8a689.up.railway.app`
2. Klik menu titik tiga (⋮) di pojok kanan atas browser.
3. Pilih **"Tambahkan ke Layar Utama"** atau **"Instal Aplikasi"**.
4. Ikon **ScanDine** akan langsung muncul di menu aplikasi HP Android Anda dan dapat dibuka sebagai aplikasi penuh!

---

## Cara 2: Generate APK / AAB untuk Publish ke Google Play Console
Gunakan tool resmi dari Google (**Bubblewrap CLI**):

```bash
# 1. Install Bubblewrap CLI
npm install -g @bubblewrap/cli

# 2. Masuk ke folder android
cd android

# 3. Inisialisasi & build APK / Bundle AAB
bubblewrap init --manifest=https://scandine-production-b6a8a689.up.railway.app/manifest.json
bubblewrap build
```

Hasil build berupa file `app-release-bundle.aab` yang siap langsung diunggah ke **Google Play Console**!
