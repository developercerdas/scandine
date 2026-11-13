const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Multi-Merchant & Multi-Outlet Seed Data
const initialData = {
  businesses: [
    {
      id: "biz-1",
      slug: "selera-nusantara",
      name: "Kopi & Selera Nusantara",
      tagline: "Authentic Indonesian Taste & Modern Specialty Coffee",
      ownerName: "Djohan Hutagalung",
      ownerPhone: "0812-8899-7766",
      currency: "Rp",
      createdAt: "2026-01-10T08:00:00.000Z"
    },
    {
      id: "biz-2",
      slug: "bebek-juara",
      name: "Bebek Juara Rempah",
      tagline: "Bebek Goreng Crispy Bumbu Madura Pedas Nampol",
      ownerName: "Djohan Hutagalung",
      ownerPhone: "0812-8899-7766",
      currency: "Rp",
      createdAt: "2026-02-15T09:00:00.000Z"
    }
  ],
  outlets: [
    {
      id: "outlet-senopati",
      businessId: "biz-1",
      slug: "senopati",
      name: "Cabang Senopati (Pusat)",
      address: "Jl. Senopati No. 88, Kebayoran Baru, Jakarta Selatan",
      phone: "0812-8899-7766",
      taxRate: 10, // 10% PB1
      serviceRate: 5, // 5% Service Charge
      outOfStockMenus: [], // Array of menu IDs sold out at this branch
      deliverySettings: {
        gofood: { enabled: true, merchantId: "GF-JKT-0982", status: "ACTIVE" },
        grabfood: { enabled: true, merchantId: "GRAB-ID-4412", status: "ACTIVE" },
        shopeefood: { enabled: true, merchantId: "SHP-ID-8812", status: "ACTIVE" }
      },
      tables: [
        { id: "tbl-s-1", number: "1", name: "Meja 01 (Indoor)", capacity: 2, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-s-2", number: "2", name: "Meja 02 (Indoor)", capacity: 4, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-s-3", number: "3", name: "Meja 03 (Indoor)", capacity: 4, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-s-4", number: "4", name: "Meja 04 (Sofa Panjang)", capacity: 6, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-s-5", number: "5", name: "Meja 05 (Outdoor Garden)", capacity: 4, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-s-6", number: "6", name: "Meja 06 (Outdoor Garden)", capacity: 4, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-s-vip", number: "VIP-1", name: "VIP Meeting Room", capacity: 10, status: "AVAILABLE", currentOrderId: null, occupiedSince: null }
      ]
    },
    {
      id: "outlet-kemang",
      businessId: "biz-1",
      slug: "kemang",
      name: "Cabang Kemang Raya",
      address: "Jl. Kemang Raya No. 14A, Bangka, Mampang Prapatan, Jaksel",
      phone: "0813-7722-1100",
      taxRate: 10,
      serviceRate: 5,
      outOfStockMenus: [],
      deliverySettings: {
        gofood: { enabled: true, merchantId: "GF-KMG-1102", status: "ACTIVE" },
        grabfood: { enabled: true, merchantId: "GRAB-KMG-3391", status: "ACTIVE" },
        shopeefood: { enabled: true, merchantId: "SHP-KMG-7741", status: "ACTIVE" }
      },
      tables: [
        { id: "tbl-k-1", number: "1", name: "Meja 01 (Indoor)", capacity: 2, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-k-2", number: "2", name: "Meja 02 (Indoor)", capacity: 4, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-k-3", number: "3", name: "Meja 03 (Outdoor)", capacity: 4, status: "AVAILABLE", currentOrderId: null, occupiedSince: null },
        { id: "tbl-k-4", number: "4", name: "Meja 04 (Outdoor)", capacity: 4, status: "AVAILABLE", currentOrderId: null, occupiedSince: null }
      ]
    }
  ],
  categories: [
    { id: "cat-1", businessId: "biz-1", name: "Makanan Utama", icon: "🍛" },
    { id: "cat-2", businessId: "biz-1", name: "Kopi & Minuman", icon: "☕" },
    { id: "cat-3", businessId: "biz-1", name: "Cemilan & Snack", icon: "🍟" },
    { id: "cat-4", businessId: "biz-1", name: "Dessert & Manisan", icon: "🍰" }
  ],
  menus: [
    {
      id: "menu-1",
      businessId: "biz-1",
      categoryId: "cat-1",
      name: "Nasi Goreng Wagyu Selera",
      description: "Nasi goreng aromatik dengan potongan daging wagyu lembut, telur mata sapi, kerupuk udang, dan acar segar.",
      price: 58000,
      image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: [
        { name: "Tingkat Kepedasan", choices: ["Tidak Pedas", "Sedang", "Pedas Gurih", "Extra Pedas"] },
        { name: "Pilihan Telur", choices: ["Mata Sapi Setengah Matang", "Mata Sapi Matang", "Dadar"] }
      ]
    },
    {
      id: "menu-2",
      businessId: "biz-1",
      categoryId: "cat-1",
      name: "Ayam Bakar Madu Rempah",
      description: "1/4 ekor ayam ungkep bumbu rempah bakar madu legit, disajikan dengan nasi putih hangat dan sambal terasi.",
      price: 45000,
      image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: [
        { name: "Pilihan Bagian", choices: ["Paha Atas & Bawah", "Dada"] },
        { name: "Jenis Sambal", choices: ["Sambal Terasi Bakar", "Sambal Matah Bali", "Sambal Ijo"] }
      ]
    },
    {
      id: "menu-3",
      businessId: "biz-1",
      categoryId: "cat-1",
      name: "Mie Nyemek Khas Jawa",
      description: "Mie kuah kental gurih dengan suwiran ayam kampung, bakso sapi, sawi hijau, dan taburan bawang goreng renyah.",
      price: 36000,
      image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: [
        { name: "Tingkat Kepedasan", choices: ["Level 0 (Gurih)", "Level 1 (Sedang)", "Level 2 (Pedas Nampol)"] }
      ]
    },
    {
      id: "menu-4",
      businessId: "biz-1",
      categoryId: "cat-2",
      name: "Es Kopi Susu Gula Aren",
      description: "Espresso double shot arabika blend dengan fresh milk creamy dan sirup gula aren murni organik.",
      price: 24000,
      image: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: [
        { name: "Manis", choices: ["Normal Sweet", "Less Sweet (50%)", "No Sugar"] },
        { name: "Es Batu", choices: ["Normal Ice", "Less Ice"] }
      ]
    },
    {
      id: "menu-5",
      businessId: "biz-1",
      categoryId: "cat-2",
      name: "Matcha Latte Oat Milk",
      description: "Pure Uji Matcha import dari Kyoto dipadu dengan creamy oat milk yang lembut dan harum.",
      price: 35000,
      image: "https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: [
        { name: "Suhu", choices: ["Dingin (Iced)", "Hangat (Hot)"] },
        { name: "Tingkat Manis", choices: ["Normal Sweet", "Less Sweet"] }
      ]
    },
    {
      id: "menu-6",
      businessId: "biz-1",
      categoryId: "cat-2",
      name: "Artisan Iced Lychee Tea",
      description: "Black tea premium dengan sirup leci segar dan 2 buah leci utuh manis menyegarkan.",
      price: 26000,
      image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: []
    },
    {
      id: "menu-7",
      businessId: "biz-1",
      categoryId: "cat-3",
      name: "Truffle Fries with Parmesan",
      description: "Kentang goreng renyah beraroma minyak truffle asli dengan taburan keju parmesan dan dipping saus tar-tar.",
      price: 32000,
      image: "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: []
    },
    {
      id: "menu-8",
      businessId: "biz-1",
      categoryId: "cat-3",
      name: "Cireng Krispi Sambal Rujak",
      description: "Cireng khas Bandung kenyal gurih di dalam, garing di luar, dengan cocolan bumbu rujak pedas manis asam segar.",
      price: 22000,
      image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: []
    },
    {
      id: "menu-9",
      businessId: "biz-1",
      categoryId: "cat-4",
      name: "Pisang Goreng Madu Wijen",
      description: "Pisang raja manis karamelisasi madu murni dengan taburan biji wijen panggang renyah.",
      price: 25000,
      image: "https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?w=600&auto=format&fit=crop&q=80",
      isAvailable: true,
      options: []
    }
  ],
  orders: []
};

// Ensure data folder exists
function ensureDb() {
  const dataDir = path.dirname(DB_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  } else {
    // Check if migration to multi-outlet is needed
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed.businesses || !parsed.outlets) {
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
      }
    } catch (e) {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    }
  }
}

function getDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading DB file, returning initial data", err);
    return initialData;
  }
}

function saveDb(data) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  getDb,
  saveDb,
  ensureDb
};
