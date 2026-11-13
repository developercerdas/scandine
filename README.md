# ScanDine - Smart QR Dine-In Ordering & POS System

**ScanDine** adalah sistem pemesanan restoran berbasis **Scan QR Menu (Self-Ordering / QR Dine-In)** yang terintegrasi secara *real-time* dengan layar kasir dan dapur, dibangun dengan arsitektur modern menggunakan **Node.js, Express, Socket.IO, dan HTML/CSS modern**.

---

## 🚀 Fitur Utama ScanDine

1. **📱 Pelanggan (Customer Mobile Web - Scan QR Meja):**
   - URL: `/order?table=1`
   - Pelanggan tidak perlu download aplikasi, langsung terbuka di browser HP setelah *scan* QR meja.
   - Katalog menu dengan kategori dinamis (Makanan Utama, Kopi & Minuman, Snack, Dessert).
   - Modal pilihan varian (tingkat kepedasan, jenis sambal, level gula, dll.) dan catatan khusus untuk koki/barista.
   - Keranjang belanja melayang (*floating cart*) dengan kalkulasi otomatis PPN (10%) & Service Charge (5%).
   - **2 Pilihan Pembayaran:**
     - **QRIS Dinamis:** Menghasilkan QRIS otomatis dengan barcode QR + tombol simulasi verifikasi webhook instan.
     - **Bayar di Kasir (Open Bill):** Tamu pesan langsung, pesanan langsung masuk dapur, bayar tunai/kartu di akhir makan.
   - **Pelacak Status Pesanan Real-Time:**
     - Langkah 1: Pesanan Diterima Dapur
     - Langkah 2: Sedang Dimasak
     - Langkah 3: Makanan Siap Diantar
     - Langkah 4: Pesanan Selesai

2. **🖥️ Layar Kasir & Dapur (Kitchen Display System - POS):**
   - URL: `/pos` atau `/kitchen`
   - **Audio Chime:** Bunyi bel notifikasi otomatis (*Web Audio API*) setiap ada pesanan baru masuk dari meja tanpa perlu refresh halaman.
   - Filter status pesanan (*Perlu Diproses, Sedang Dimasak, Siap Antar, Selesai*).
   - Tombol alur kerja cepat (*Mulai Masak*, *Makanan Siap*, *Selesai*, *Terima Kasir / Lunas*).
   - **🖨️ Cetak Struk Thermal (58mm):** Format struk kasir dan tiket dapur siap cetak langsung ke printer thermal.

3. **⚙️ Backoffice & Admin Restoran:**
   - URL: `/admin`
   - **Generator QR Code Meja:** Pilih meja, buat QR barcode otomatis, preview stiker meja, dan tombol cetak stiker meja.
   - **Kelola Ketersediaan Menu (Stok):** Saklar *Tersedia / Habis (Sold Out)* yang langsung memperbarui tampilan di semua HP tamu secara *live*.
   - **Laporan Penjualan Singkat:** Total omzet lunas, jumlah pesanan, dan menu paling laris.

---

## 🛠️ Cara Menjalankan Aplikasi

1. Buka terminal di folder project:
   ```bash
   cd D:\aplikasi\scandine
   ```

2. Jalankan server:
   ```bash
   node server.js
   ```

3. Buka di browser:
   - **Portal Utama:** [http://localhost:3500](http://localhost:3500)
   - **Menu Pelanggan (Meja 1):** [http://localhost:3500/order?table=1](http://localhost:3500/order?table=1)
   - **Layar Kasir & Dapur (POS):** [http://localhost:3500/pos](http://localhost:3500/pos)
   - **Admin & Generator QR Meja:** [http://localhost:3500/admin](http://localhost:3500/admin)

---

## 💳 Langkah Integrasi Payment Gateway Produksi (QRIS Asli)

Untuk menghubungkan QRIS asli:
1. Daftarkan akun di **Midtrans** (Core API Snap) atau **Xendit** (QR Code API).
2. Di file `server.js`, gantikan fungsi mock QRIS dengan API call:
   ```javascript
   const xenditResponse = await xenditClient.QRCode.createQRCode({
     externalID: orderId,
     type: 'DYNAMIC',
     callbackURL: 'https://domain-anda.com/api/payment/webhook',
     amount: total
   });
   const qrisString = xenditResponse.qr_string;
   ```
3. Buat rute `/api/payment/webhook` untuk menerima notifikasi pembayaran sukses dari Xendit/Midtrans dan panggil `io.to('staff').emit('new_order', order)`.
