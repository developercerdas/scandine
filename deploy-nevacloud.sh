#!/bin/bash
# ==============================================================================
# SCANDINE - AUTO DEPLOYMENT SCRIPT FOR NEVACLOUD (UBUNTU / DEBIAN)
# CV. ISTANA BARCODE COMPUTER & DEVELOPER CERDAS
# ==============================================================================

set -e

echo "=========================================================="
echo "  🚀 MEMULAI DEPLOYMENT SCANDINE DI NEVACLOUD"
echo "=========================================================="

# 1. Update sistem operasi
echo "📦 [1/6] Memperbarui paket sistem Ubuntu..."
sudo apt update -y && sudo apt upgrade -y
sudo apt install -y curl wget git ufw nginx

# 2. Install Node.js v20 LTS
echo "📦 [2/6] Memasang Node.js v20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

echo "   Node.js version: $(node -v)"
echo "   NPM version:     $(npm -v)"

# 3. Install PM2 Process Manager
echo "⚙️ [3/6] Memasang PM2 (agar aplikasi berjalan 24/7 non-stop)..."
sudo npm install -g pm2

# 4. Setup direktori aplikasi ScanDine
APP_DIR="/var/www/scandine"
echo "📂 [4/6] Menyiapkan source code aplikasi di $APP_DIR..."

if [ -d "$APP_DIR" ]; then
    echo "   Direktori ditemukan, memperbarui kode terbaru dari GitHub..."
    cd $APP_DIR
    git pull origin main
else
    echo "   Melakukan clone repositori dari GitHub..."
    sudo git clone https://github.com/developercerdas/scandine.git $APP_DIR
    cd $APP_DIR
fi

# Pastikan folder data dan uploads memiliki izin tulis
sudo mkdir -p $APP_DIR/data $APP_DIR/public/uploads
sudo chown -R $USER:$USER $APP_DIR
sudo chmod -R 755 $APP_DIR/public/uploads $APP_DIR/data

# Install dependensi Node.js
echo "   Menginstal dependensi npm..."
npm install

# 5. Jalankan aplikasi dengan PM2
echo "🚀 [5/6] Menjalankan ScanDine dengan PM2..."
pm2 delete scandine 2>/dev/null || true
PORT=3500 pm2 start server.js --name scandine

# Setup auto-start PM2 saat server VPS restart
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME || true

# 6. Konfigurasi Nginx Reverse Proxy (Akses langsung via Port 80 / IP tanpa :3500)
echo "🌐 [6/6] Mengonfigurasi Nginx Web Server & WebSocket..."

NGINX_CONF="/etc/nginx/sites-available/scandine"

sudo bash -c "cat > $NGINX_CONF" << 'EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:3500;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static uploads caching
    location /uploads/ {
        alias /var/www/scandine/public/uploads/;
        expires 30d;
        access_log off;
    }
}
EOF

# Aktifkan konfigurasi Nginx
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/scandine
sudo nginx -t
sudo systemctl restart nginx

# Konfigurasi Firewall UFW
sudo ufw allow 'Nginx Full' 2>/dev/null || true
sudo ufw allow OpenSSH 2>/dev/null || true

# Dapatkan IP Publik Server
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "IP_SERVER_ANDA")

echo "=========================================================="
echo "  🎉 SELAMAT! SCANDINE BERHASIL TERDEPLOY DI NEVACLOUD"
echo "=========================================================="
echo "  * URL Publik:       http://$SERVER_IP"
echo "  * Kasir & KDS:      http://$SERVER_IP/pos"
echo "  * Admin Backoffice: http://$SERVER_IP/admin"
echo "  * Menu Tamu Meja 1: http://$SERVER_IP/order?outlet=senopati&table=1"
echo "----------------------------------------------------------"
echo "  💡 TIPS DOMAIN & HTTPS (SSL GRATIS):"
echo "  Jika Anda memiliki domain (contoh: resto.com), arahkan A-Record ke IP $SERVER_IP,"
echo "  lalu jalankan perintah: sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx"
echo "=========================================================="
