const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const QRCode = require('qrcode');
const os = require('os');
const { getDb, saveDb, ensureDb } = require('./database');

ensureDb();

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"]
  }
});

const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Upload Image Endpoint (Base64 to static disk file)
app.post('/api/upload', (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Data gambar tidak ditemukan." });
    }

    // Match data:image/...;base64,...
    const matches = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    let ext = 'png';
    let base64Data = image;

    if (matches && matches.length === 3) {
      ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      base64Data = matches[2];
    }

    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const prefix = filename ? filename.replace(/[^a-zA-Z0-9_-]/g, '_') : 'img';
    const cleanName = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
    const filePath = path.join(uploadsDir, cleanName);

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    const publicUrl = `/uploads/${cleanName}`;
    res.json({ success: true, url: publicUrl, filename: cleanName });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Gagal menyimpan gambar: " + err.message });
  }
});

// Helper to get local network IP address
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Helper for generating order ID
function generateOrderId(prefix = 'ORD') {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${randomSuffix}`;
}

// Helper to resolve Outlet
function resolveOutlet(db, outletParam) {
  if (!outletParam) {
    return db.outlets[0]; // Default to first outlet
  }
  const clean = outletParam.toString().toLowerCase();
  const found = db.outlets.find(o => o.id.toLowerCase() === clean || o.slug.toLowerCase() === clean);
  return found || db.outlets[0];
}

// Helper to resolve base URL (supports HTTPS domain behind reverse proxy, or LAN IP on localhost)
function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host') || '').toString().split(',')[0].trim();
  if (!host || host.includes('localhost') || host.includes('127.0.0.1')) {
    const localIp = getLocalIp();
    return `http://${localIp}:${PORT}`;
  }
  return `${proto}://${host}`;
}

// --------------------------------------------------------------------------
// NETWORK INFO FOR MOBILE SCANNING
// --------------------------------------------------------------------------
app.get('/api/network-info', async (req, res) => {
  try {
    const { outlet, table } = req.query;
    const localIp = getLocalIp();
    const outletSlug = outlet || 'senopati';
    const tableNum = table || '1';
    const baseUrl = getBaseUrl(req);
    const mobileUrl = `${baseUrl}/order?outlet=${encodeURIComponent(outletSlug)}&table=${encodeURIComponent(tableNum)}`;
    
    const qrCodeDataUrl = await QRCode.toDataURL(mobileUrl, {
      width: 320,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    });

    res.json({
      localIp,
      port: PORT,
      mobileUrl,
      qrCodeDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal membuat network info." });
  }
});

// --------------------------------------------------------------------------
// BUSINESSES & OUTLETS API
// --------------------------------------------------------------------------
app.get('/api/outlets', (req, res) => {
  const db = getDb();
  res.json({
    businesses: db.businesses,
    outlets: db.outlets.map(o => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      address: o.address,
      phone: o.phone,
      businessId: o.businessId,
      tableCount: (o.tables || []).length
    }))
  });
});

// Get all outlets with full details for admin management
app.get('/api/admin/outlets', (req, res) => {
  const db = getDb();
  const outletsWithUsers = db.outlets.map(o => {
    const manager = (db.users || []).find(u => u.allowedOutlets && u.allowedOutlets.includes(o.id));
    return {
      id: o.id,
      slug: o.slug,
      name: o.name,
      address: o.address,
      phone: o.phone,
      taxRate: o.taxRate,
      serviceRate: o.serviceRate,
      receiptFooter: o.receiptFooter,
      tableCount: (o.tables || []).length,
      managerUsername: manager ? manager.username : "-",
      managerName: manager ? manager.name : "-"
    };
  });
  res.json(outletsWithUsers);
});

// Tambah Cabang / Gerai Baru
app.post('/api/admin/outlets', (req, res) => {
  const { name, address, phone, taxRate, serviceRate, receiptFooter, managerUsername, managerPassword, managerName } = req.body;
  if (!name) return res.status(400).json({ error: "Nama cabang wajib diisi." });

  const db = getDb();
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `cabang-${Date.now()}`;
  const outletId = `outlet-${slug}`;

  if (db.outlets.some(o => o.id === outletId || o.slug === slug)) {
    return res.status(400).json({ error: "Nama cabang sudah ada. Gunakan nama yang berbeda." });
  }

  // Otomatis siapkan 10 meja awal untuk cabang baru
  const initialTables = [];
  for (let i = 1; i <= 10; i++) {
    const numStr = i < 10 ? `0${i}` : `${i}`;
    initialTables.push({
      id: `tbl-${slug}-${i}`,
      number: `${i}`,
      name: `Meja ${numStr}`,
      capacity: 4,
      status: "AVAILABLE",
      currentOrderId: null,
      occupiedSince: null
    });
  }

  const newOutlet = {
    id: outletId,
    businessId: db.businesses[0]?.id || "biz-1",
    slug,
    name: name.trim(),
    address: address ? address.trim() : "",
    phone: phone ? phone.trim() : "",
    taxRate: taxRate !== undefined ? Number(taxRate) : 10,
    serviceRate: serviceRate !== undefined ? Number(serviceRate) : 5,
    receiptFooter: receiptFooter ? receiptFooter.trim() : "Terima kasih atas kunjungan Anda!\nSilakan datang kembali.",
    outOfStockMenus: [],
    deliverySettings: {
      gofood: { enabled: true, merchantId: `GF-${slug.toUpperCase()}`, status: "ACTIVE" },
      grabfood: { enabled: true, merchantId: `GRAB-${slug.toUpperCase()}`, status: "ACTIVE" },
      shopeefood: { enabled: true, merchantId: `SHP-${slug.toUpperCase()}`, status: "ACTIVE" }
    },
    qrisSettings: {
      mode: "DYNAMIC_MOCK",
      merchantName: name.trim(),
      nmid: `ID${Math.floor(1000000000000 + Math.random() * 9000000000000)}`,
      staticQrImage: "https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=00020101021126580014ID.GO-JEK.WWW01189360091430000000000208123456780303UME5204581253033605802ID5911SCANDINE6304",
      gatewayProvider: "MIDTRANS",
      serverKey: "",
      clientKey: "",
      instructions: "Pindai QRIS di atas dengan m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (GoPay, OVO, ShopeePay, Dana)."
    },
    tables: initialTables
  };

  db.outlets.push(newOutlet);

  // Buat akun login khusus untuk Manager Cabang Baru ini jika diisi
  if (managerUsername && managerPassword) {
    if (!db.users) db.users = [];
    const exists = db.users.some(u => u.username.toLowerCase() === managerUsername.trim().toLowerCase());
    if (!exists) {
      db.users.push({
        id: `usr-${slug}`,
        username: managerUsername.trim().toLowerCase(),
        password: managerPassword,
        name: managerName ? managerName.trim() : `Manager ${name.trim()}`,
        role: "GERAI_MANAGER",
        businessId: db.businesses[0]?.id || "biz-1",
        allowedOutlets: [outletId],
        avatar: "👔"
      });
    }
  }

  saveDb(db);
  io.emit('store_updated');

  res.status(201).json({
    success: true,
    message: `Cabang baru "${name}" berhasil dibuat lengkap dengan 10 meja dan akun manager!`,
    outlet: newOutlet
  });
});

// Update data cabang
app.put('/api/admin/outlets/:id', (req, res) => {
  const { id } = req.params;
  const { name, address, phone, taxRate, serviceRate, receiptFooter } = req.body;
  const db = getDb();
  const outlet = db.outlets.find(o => o.id === id || o.slug === id);
  if (!outlet) return res.status(404).json({ error: "Cabang tidak ditemukan." });

  if (name !== undefined) outlet.name = name.trim();
  if (address !== undefined) outlet.address = address.trim();
  if (phone !== undefined) outlet.phone = phone.trim();
  if (taxRate !== undefined) outlet.taxRate = Number(taxRate) || 0;
  if (serviceRate !== undefined) outlet.serviceRate = Number(serviceRate) || 0;
  if (receiptFooter !== undefined) outlet.receiptFooter = receiptFooter.trim();

  saveDb(db);
  io.emit('store_updated');

  res.json({ success: true, message: "Data cabang berhasil diperbarui!", outlet });
});

// --------------------------------------------------------------------------
// CUSTOMER & BOOTSTRAP API (MULTI-OUTLET AWARE)
// --------------------------------------------------------------------------
app.get('/api/bootstrap', (req, res) => {
  const { outlet: outletQuery, table: tableQuery } = req.query;
  const db = getDb();
  
  const currentOutlet = resolveOutlet(db, outletQuery);
  const currentBiz = db.businesses.find(b => b.id === currentOutlet.businessId) || db.businesses[0];

  let currentTable = null;
  if (tableQuery) {
    currentTable = currentOutlet.tables.find(t => 
      t.number.toString().toLowerCase() === tableQuery.toString().toLowerCase() || t.id === tableQuery
    );
  }

  // Mark menus that are out of stock specifically at this outlet
  const outletOutOfStock = currentOutlet.outOfStockMenus || [];
  const menusForOutlet = db.menus
    .filter(m => m.businessId === currentBiz.id)
    .map(m => ({
      ...m,
      isAvailable: m.isAvailable && !outletOutOfStock.includes(m.id)
    }));

  const defaultLogo = "/img/logo.svg";
  const effectiveLogo = currentOutlet.logoUrl || currentBiz.logoUrl || defaultLogo;

  res.json({
    business: {
      ...currentBiz,
      logoUrl: effectiveLogo
    },
    outlet: {
      id: currentOutlet.id,
      slug: currentOutlet.slug,
      name: currentOutlet.name,
      address: currentOutlet.address,
      phone: currentOutlet.phone,
      taxRate: currentOutlet.taxRate,
      serviceRate: currentOutlet.serviceRate,
      deliverySettings: currentOutlet.deliverySettings,
      logoUrl: effectiveLogo,
      wifiSsid: currentOutlet.wifiSsid || "Resto_Guest",
      wifiPassword: currentOutlet.wifiPassword || "",
      qrTemplate: currentOutlet.qrTemplate || "acrylic",
      tables: currentOutlet.tables || []
    },
    categories: db.categories.filter(c => c.businessId === currentBiz.id),
    menus: menusForOutlet,
    table: currentTable || { number: tableQuery || "1", name: `Meja ${tableQuery || 1}` }
  });
});

// Create new customer order (Supports Dine-In & Pick-Up)
app.post('/api/orders', async (req, res) => {
  try {
    const { 
      outletId, 
      tableNumber, 
      customerName, 
      customerPhone, 
      items, 
      paymentMethod, 
      channel = 'DINE_IN',
      pickupTime,
      notes 
    } = req.body;
    
    if (!items || !items.length) {
      return res.status(400).json({ error: "Item pesanan tidak boleh kosong." });
    }

    const db = getDb();
    const outlet = resolveOutlet(db, outletId);
    const biz = db.businesses.find(b => b.id === outlet.businessId) || db.businesses[0];

    // Validate and compute totals
    let subtotal = 0;
    const orderItems = items.map(item => {
      const menu = db.menus.find(m => m.id === item.menuId);
      const price = menu ? menu.price : item.price;
      const itemSubtotal = price * item.qty;
      subtotal += itemSubtotal;
      return {
        menuId: item.menuId,
        name: menu ? menu.name : item.name,
        price: price,
        qty: item.qty,
        options: item.options || [],
        notes: item.notes || "",
        subtotal: itemSubtotal
      };
    });

    const taxAmount = Math.round((subtotal * outlet.taxRate) / 100);
    const serviceAmount = Math.round((subtotal * outlet.serviceRate) / 100);
    const total = subtotal + taxAmount + serviceAmount;

    const prefix = channel === 'PICK_UP' ? 'PICK' : 'ORD';
    const orderId = generateOrderId(prefix);
    const isQris = paymentMethod === 'QRIS';

    // QRIS Generation according to Outlet's QRIS Settings
    let qrisDataUrl = null;
    const qrisConf = outlet.qrisSettings || {};
    if (isQris) {
      if (qrisConf.mode === 'STATIC_IMAGE' && qrisConf.staticQrImage) {
        qrisDataUrl = qrisConf.staticQrImage;
      } else {
        const merchantTag = (qrisConf.merchantName || biz.name).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const mockQrisPayload = `00020101021226${merchantTag}520458125303360540${total}5802ID5911${qrisConf.nmid || 'ID1020030040050'}6007JAKARTA6304`;
        qrisDataUrl = await QRCode.toDataURL(mockQrisPayload, {
          errorCorrectionLevel: 'H',
          margin: 2,
          width: 320,
          color: { dark: '#0f172a', light: '#ffffff' }
        });
      }
    }

    const newOrder = {
      id: orderId,
      businessId: biz.id,
      businessName: biz.name || "Kopi & Selera Nusantara",
      outletId: outlet.id,
      outletName: outlet.name,
      outletAddress: outlet.address || "",
      outletPhone: outlet.phone || "",
      receiptFooter: outlet.receiptFooter || "Terima kasih atas kunjungan Anda!\nSilakan datang kembali.",
      channel: channel, // 'DINE_IN' | 'PICK_UP' | 'GOFOOD' | 'GRABFOOD' | 'SHOPEEFOOD'
      tableNumber: channel === 'DINE_IN' ? (tableNumber || "Meja 1") : "Pick-Up",
      pickupTime: pickupTime || null,
      customerName: customerName || "Tamu",
      customerPhone: customerPhone || "-",
      notes: notes || "",
      items: orderItems,
      subtotal,
      tax: taxAmount,
      service: serviceAmount,
      total,
      paymentMethod: isQris ? 'QRIS' : 'CASHIER',
      paymentStatus: 'PENDING',
      orderStatus: isQris ? 'AWAITING_PAYMENT' : 'RECEIVED',
      qrisDataUrl,
      qrisInfo: {
        mode: qrisConf.mode || 'DYNAMIC_MOCK',
        merchantName: qrisConf.merchantName || biz.name,
        nmid: qrisConf.nmid || 'ID1020030040050',
        instructions: qrisConf.instructions || 'Pindai QRIS di atas dengan m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (GoPay, OVO, ShopeePay, Dana).'
      },
      createdAt: new Date().toISOString()
    };

    // If Dine-In, update table status to OCCUPIED
    if (channel === 'DINE_IN') {
      const tbl = outlet.tables.find(t => t.number.toString() === (tableNumber || "1").replace(/\D/g, ''));
      if (tbl) {
        tbl.status = 'OCCUPIED';
        tbl.currentOrderId = orderId;
        if (!tbl.occupiedSince) tbl.occupiedSince = new Date().toISOString();
      }
    }

    db.orders.unshift(newOrder);
    saveDb(db);

    // Notify staff for this specific outlet
    if (!isQris) {
      io.to(`staff_${outlet.id}`).emit('new_order', newOrder);
      io.to('staff_global').emit('new_order', newOrder);
    }

    res.status(201).json({
      success: true,
      order: newOrder
    });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ error: "Gagal membuat pesanan." });
  }
});

// Get specific order status
app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const order = db.orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }
  res.json(order);
});

// Mock Payment Success
app.post('/api/orders/:id/pay', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const order = db.orders.find(o => o.id === id);

  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }

  order.paymentStatus = 'PAID';
  if (order.orderStatus === 'AWAITING_PAYMENT') {
    order.orderStatus = 'RECEIVED';
  }
  order.paidAt = new Date().toISOString();

  saveDb(db);

  // Notify customer's room & outlet staff
  io.to(`order_${id}`).emit('order_updated', order);
  io.to(`staff_${order.outletId}`).emit('order_updated', order);
  io.to(`staff_${order.outletId}`).emit('new_order', order); // Audible chime on POS
  io.to('staff_global').emit('order_updated', order);

  res.json({ success: true, message: "Pembayaran berhasil diverifikasi.", order });
});

// --------------------------------------------------------------------------
// OMNICHANNEL ONLINE FOOD DELIVERY WEBHOOKS (GoFood, GrabFood, ShopeeFood)
// --------------------------------------------------------------------------

// Universal Delivery Ingest Handler
function ingestDeliveryOrder(channelName, channelTag, req, res) {
  try {
    const { outletId, externalOrderId, driverName, driverPhone, driverPin, customerName, items, total, notes } = req.body;
    const db = getDb();
    const outlet = resolveOutlet(db, outletId);
    const biz = db.businesses.find(b => b.id === outlet.businessId) || db.businesses[0];

    const orderId = generateOrderId(channelTag);
    const orderItems = (items || []).map(it => ({
      name: it.name,
      price: it.price || 0,
      qty: it.qty || 1,
      options: it.options || [],
      notes: it.notes || "",
      subtotal: (it.price || 0) * (it.qty || 1)
    }));

    const computedTotal = total || orderItems.reduce((s, i) => s + i.subtotal, 0);

    const newDeliveryOrder = {
      id: orderId,
      businessId: biz.id,
      outletId: outlet.id,
      outletName: outlet.name,
      channel: channelName, // 'GOFOOD' | 'GRABFOOD' | 'SHOPEEFOOD'
      externalOrderId: externalOrderId || `${channelTag}-${Math.floor(1000 + Math.random() * 9000)}`,
      tableNumber: channelName,
      customerName: customerName || "Pelanggan Online",
      customerPhone: "-",
      driverInfo: {
        name: driverName || "Driver Menuju Resto",
        phone: driverPhone || "-",
        pin: driverPin || Math.floor(1000 + Math.random() * 9000).toString()
      },
      notes: notes || "",
      items: orderItems,
      subtotal: computedTotal,
      tax: 0,
      service: 0,
      total: computedTotal,
      paymentMethod: channelName,
      paymentStatus: 'PAID', // Aggregator orders are pre-paid
      orderStatus: 'RECEIVED',
      createdAt: new Date().toISOString()
    };

    db.orders.unshift(newDeliveryOrder);
    saveDb(db);

    // Real-time broadcast to outlet kitchen & kasir with audio alert
    io.to(`staff_${outlet.id}`).emit('new_order', newDeliveryOrder);
    io.to('staff_global').emit('new_order', newDeliveryOrder);

    res.status(201).json({
      success: true,
      message: `Pesanan ${channelName} berhasil diterima di kasir & dapur ScanDine.`,
      order: newDeliveryOrder
    });
  } catch (err) {
    console.error(`Error ingesting ${channelName} order:`, err);
    res.status(500).json({ error: `Gagal memproses pesanan ${channelName}.` });
  }
}

// 1. GoFood Webhook
app.post('/api/webhooks/gofood', (req, res) => {
  ingestDeliveryOrder('GOFOOD', 'GF', req, res);
});

// 2. GrabFood Webhook
app.post('/api/webhooks/grabfood', (req, res) => {
  ingestDeliveryOrder('GRABFOOD', 'GRAB', req, res);
});

// 3. ShopeeFood Webhook
app.post('/api/webhooks/shopeefood', (req, res) => {
  ingestDeliveryOrder('SHOPEEFOOD', 'SHP', req, res);
});

// --------------------------------------------------------------------------
// TABLE MANAGEMENT APIS (FLOOR PLAN & STATUS)
// --------------------------------------------------------------------------
app.get('/api/staff/tables', (req, res) => {
  const { outlet: outletQuery } = req.query;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);

  // Compute live duration for occupied tables
  const tablesWithLiveInfo = outlet.tables.map(tbl => {
    let durationMinutes = 0;
    if (tbl.status === 'OCCUPIED' && tbl.occupiedSince) {
      const diffMs = Date.now() - new Date(tbl.occupiedSince).getTime();
      durationMinutes = Math.floor(diffMs / 60000);
    }
    return {
      ...tbl,
      durationMinutes
    };
  });

  res.json({
    outlet: { id: outlet.id, name: outlet.name, slug: outlet.slug },
    tables: tablesWithLiveInfo
  });
});

// Update table status (e.g. Clear table after guest leaves)
app.patch('/api/staff/tables/:tableId/status', (req, res) => {
  const { tableId } = req.params;
  const { status, outletId } = req.body;
  const db = getDb();
  const outlet = resolveOutlet(db, outletId);
  const tbl = outlet.tables.find(t => t.id === tableId || t.number.toString() === tableId.toString());

  if (!tbl) return res.status(404).json({ error: "Meja tidak ditemukan." });

  tbl.status = status; // 'AVAILABLE' | 'OCCUPIED' | 'BILL_PRINTED'
  if (status === 'AVAILABLE') {
    tbl.currentOrderId = null;
    tbl.occupiedSince = null;
  }

  saveDb(db);
  io.to(`staff_${outlet.id}`).emit('tables_updated');
  res.json({ success: true, table: tbl });
});

// --------------------------------------------------------------------------
// STAFF POS & KITCHEN APIS
// --------------------------------------------------------------------------
app.get('/api/staff/orders', (req, res) => {
  const { outlet: outletQuery, channel, status } = req.query;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);
  
  let list = db.orders.filter(o => o.outletId === outlet.id);

  if (channel && channel !== 'ALL') {
    list = list.filter(o => o.channel === channel);
  }

  if (status && status !== 'ALL') {
    list = list.filter(o => o.orderStatus === status);
  }

  res.json(list);
});

// Update order status
app.patch('/api/staff/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { orderStatus, paymentStatus } = req.body;
  const db = getDb();
  const order = db.orders.find(o => o.id === id);

  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  }

  if (orderStatus) order.orderStatus = orderStatus;
  if (paymentStatus) {
    order.paymentStatus = paymentStatus;
    if (paymentStatus === 'PAID' && !order.paidAt) {
      order.paidAt = new Date().toISOString();
    }
  }

  // If completed, update table to available
  if (orderStatus === 'COMPLETED' && order.channel === 'DINE_IN') {
    const outlet = db.outlets.find(o => o.id === order.outletId);
    if (outlet) {
      const tbl = outlet.tables.find(t => t.number.toString() === (order.tableNumber || "").replace(/\D/g, ''));
      if (tbl) {
        tbl.status = 'AVAILABLE';
        tbl.currentOrderId = null;
        tbl.occupiedSince = null;
      }
    }
  }

  saveDb(db);

  io.to(`order_${id}`).emit('order_updated', order);
  io.to(`staff_${order.outletId}`).emit('order_updated', order);
  io.to('staff_global').emit('order_updated', order);

  res.json({ success: true, order });
});

// Alias endpoints for updating order status from POS / Staff / KDS / Test scripts
app.patch('/api/orders/:id/status', (req, res, next) => {
  req.url = `/api/staff/orders/${req.params.id}/status`;
  app.handle(req, res, next);
});
app.post('/api/orders/:id/status', (req, res, next) => {
  req.url = `/api/staff/orders/${req.params.id}/status`;
  app.handle(req, res, next);
});

// Role-based protection middleware for admin APIs:
// When an explicit role is supplied in header or query, only OWNER and ADMIN are allowed!
app.use('/api/admin', (req, res, next) => {
  const role = req.headers['x-user-role'] || req.query.role;
  if (role && !['OWNER', 'ADMIN'].includes(role.toUpperCase())) {
    return res.status(403).json({ error: "Akses Ditolak: Hanya Pemilik (Owner) atau Super Admin yang diizinkan mengakses pengaturan ini." });
  }
  next();
});

// --------------------------------------------------------------------------
// ADMIN / MERCHANT APIS
// --------------------------------------------------------------------------
app.get('/api/admin/menus', (req, res) => {
  const db = getDb();
  res.json(db.menus);
});

app.get('/api/menus', (req, res) => {
  const db = getDb();
  res.json(db.menus);
});

// Update Menu Details (Nama, Harga, Gambar, Deskripsi, Kategori, Opsi/Varian)
app.put('/api/admin/menus/:id', (req, res) => {
  const { id } = req.params;
  const { name, price, description, image, categoryId, isAvailable, options } = req.body;
  const db = getDb();
  const menu = db.menus.find(m => m.id === id);
  if (!menu) return res.status(404).json({ error: "Menu tidak ditemukan" });

  if (name !== undefined) menu.name = name.trim();
  if (price !== undefined) menu.price = Number(price) || 0;
  if (description !== undefined) menu.description = description.trim();
  if (image !== undefined) menu.image = image.trim();
  if (categoryId !== undefined) menu.categoryId = categoryId;
  if (isAvailable !== undefined) menu.isAvailable = Boolean(isAvailable);

  if (options !== undefined && Array.isArray(options)) {
    menu.options = options.map(opt => ({
      name: opt.name ? opt.name.trim() : "Pilihan",
      choices: Array.isArray(opt.choices)
        ? opt.choices.map(c => typeof c === 'string' ? c.trim() : String(c)).filter(Boolean)
        : []
    })).filter(opt => opt.name && opt.choices.length > 0);
  }

  saveDb(db);
  io.emit('menu_changed');
  res.json({ success: true, menu });
});

// Tambah Menu Baru
app.post('/api/admin/menus', (req, res) => {
  const { name, price, description, image, categoryId, options } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: "Nama menu dan harga wajib diisi." });
  }

  const formattedOptions = (options && Array.isArray(options))
    ? options.map(opt => ({
        name: opt.name ? opt.name.trim() : "Pilihan",
        choices: Array.isArray(opt.choices)
          ? opt.choices.map(c => typeof c === 'string' ? c.trim() : String(c)).filter(Boolean)
          : []
      })).filter(opt => opt.name && opt.choices.length > 0)
    : [];

  const db = getDb();
  const newMenu = {
    id: `menu-${Date.now()}`,
    businessId: db.businesses[0]?.id || "biz-1",
    categoryId: categoryId || (db.categories[0]?.id || "cat-1"),
    name: name.trim(),
    description: description ? description.trim() : "",
    price: Number(price) || 0,
    image: image ? image.trim() : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
    isAvailable: true,
    options: formattedOptions
  };

  db.menus.push(newMenu);
  saveDb(db);
  io.emit('menu_changed');
  res.json({ success: true, menu: newMenu });
});

// Hapus Menu
app.delete('/api/admin/menus/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const idx = db.menus.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Menu tidak ditemukan" });

  db.menus.splice(idx, 1);
  saveDb(db);
  io.emit('menu_changed');
  res.json({ success: true });
});

app.patch('/api/admin/menus/:id/toggle', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const menu = db.menus.find(m => m.id === id);
  if (!menu) return res.status(404).json({ error: "Menu tidak ditemukan" });

  menu.isAvailable = !menu.isAvailable;
  saveDb(db);

  io.emit('menu_changed');
  res.json({ success: true, menu });
});

// Manage Tables
app.get('/api/admin/tables', (req, res) => {
  const { outlet: outletQuery } = req.query;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);
  res.json(outlet.tables || []);
});

app.post('/api/admin/tables', (req, res) => {
  const { number, name, capacity, outlet: outletQuery } = req.body;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);
  const newTable = {
    id: `tbl-${Date.now()}`,
    number: number || `${(outlet.tables || []).length + 1}`,
    name: name || `Meja ${number}`,
    capacity: parseInt(capacity) || 4,
    status: "AVAILABLE",
    currentOrderId: null,
    occupiedSince: null
  };
  outlet.tables.push(newTable);
  saveDb(db);
  io.emit('store_updated');
  res.status(201).json(newTable);
});

// Bulk Generate Tables (e.g. 10 Meja)
app.post('/api/admin/tables/generate', (req, res) => {
  const { count = 10, prefix = "Meja ", capacity = 4, mode = "replace", outlet: outletQuery } = req.body;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);
  const n = Math.max(1, Math.min(100, parseInt(count) || 10));

  if (!outlet.tables) outlet.tables = [];

  if (mode === 'replace') {
    outlet.tables = [];
    for (let i = 1; i <= n; i++) {
      const numStr = i < 10 ? `0${i}` : `${i}`;
      outlet.tables.push({
        id: `tbl-${Date.now()}-${i}`,
        number: `${i}`,
        name: `${prefix}${numStr}`,
        capacity: parseInt(capacity) || 4,
        status: "AVAILABLE",
        currentOrderId: null,
        occupiedSince: null
      });
    }
  } else {
    // Append
    const currentMax = outlet.tables.reduce((max, t) => Math.max(max, parseInt(t.number) || 0), 0);
    for (let i = 1; i <= n; i++) {
      const nextNum = currentMax + i;
      const numStr = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;
      outlet.tables.push({
        id: `tbl-${Date.now()}-${i}`,
        number: `${nextNum}`,
        name: `${prefix}${numStr}`,
        capacity: parseInt(capacity) || 4,
        status: "AVAILABLE",
        currentOrderId: null,
        occupiedSince: null
      });
    }
  }

  saveDb(db);
  io.emit('store_updated');
  res.json({ success: true, count: outlet.tables.length, tables: outlet.tables });
});

// Delete a Table
app.delete('/api/admin/tables/:id', (req, res) => {
  const { id } = req.params;
  const { outlet: outletQuery } = req.query;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);
  outlet.tables = (outlet.tables || []).filter(t => t.id !== id && t.number !== id);
  saveDb(db);
  io.emit('store_updated');
  res.json({ success: true });
});

// Batch QR Code Generation for All Tables
app.get('/api/admin/tables/batch-qr', async (req, res) => {
  try {
    const { outlet: outletQuery } = req.query;
    const db = getDb();
    const outlet = resolveOutlet(db, outletQuery);
    const localIp = getLocalIp();
    const host = req.get('host');
    let effectiveHost = host;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      effectiveHost = `${localIp}:${PORT}`;
    }

    const biz = (db.businesses && db.businesses[0]) || { name: "ScanDine Resto" };
    const effectiveLogo = outlet.logoUrl || biz.logoUrl || "/img/logo.svg";
    const wifiSsid = outlet.wifiSsid || "Resto_Guest";
    const wifiPassword = outlet.wifiPassword || "";
    const tableTentSubtitle = outlet.tableTentSubtitle || "Scan kamera HP untuk pesan & bayar langsung dari meja";
    const qrTemplate = outlet.qrTemplate || "acrylic";
    const baseUrl = getBaseUrl(req);

    const results = [];
    for (const table of (outlet.tables || [])) {
      const orderUrl = `${baseUrl}/order?outlet=${encodeURIComponent(outlet.slug)}&table=${encodeURIComponent(table.number)}`;
      const qrDataUrl = await QRCode.toDataURL(orderUrl, {
        width: 360,
        margin: 2,
        color: { dark: '#09090b', light: '#ffffff' }
      });
      results.push({
        id: table.id,
        number: table.number,
        name: table.name,
        capacity: table.capacity,
        orderUrl,
        targetUrl: orderUrl,
        qrDataUrl,
        qrCodeDataUrl: qrDataUrl,
        outletName: outlet.name,
        outletSlug: outlet.slug,
        businessName: biz.name || "ScanDine Resto",
        logoUrl: effectiveLogo,
        wifiSsid,
        wifiPassword,
        tableTentSubtitle,
        qrTemplate
      });
    }

    res.json({
      outletName: outlet.name,
      outletSlug: outlet.slug,
      businessName: biz.name || "ScanDine Resto",
      logoUrl: effectiveLogo,
      wifiSsid,
      wifiPassword,
      tableTentSubtitle,
      qrTemplate,
      tables: results
    });
  } catch (err) {
    console.error("Error generating batch QR:", err);
    res.status(500).json({ error: "Gagal membuat batch QR." });
  }
});

// Generate Table QR Code with Smart Outlet URL
app.get('/api/admin/tables/:tableNum/qr', async (req, res) => {
  try {
    const { tableNum } = req.params;
    const { outlet: outletQuery } = req.query;
    const db = getDb();
    const outlet = resolveOutlet(db, outletQuery);
    const baseUrl = getBaseUrl(req);

    const orderUrl = `${baseUrl}/order?outlet=${encodeURIComponent(outlet.slug)}&table=${encodeURIComponent(tableNum)}`;
    
    const qrImage = await QRCode.toDataURL(orderUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#09090b', light: '#ffffff' }
    });

    const biz = (db.businesses && db.businesses[0]) || { name: "ScanDine Resto" };
    const effectiveLogo = outlet.logoUrl || biz.logoUrl || "/img/logo.svg";

    res.json({
      outletName: outlet.name,
      outletSlug: outlet.slug,
      businessName: biz.name || "ScanDine Resto",
      tableNumber: tableNum,
      targetUrl: orderUrl,
      orderUrl: orderUrl,
      qrDataUrl: qrImage,
      qrCodeDataUrl: qrImage,
      logoUrl: effectiveLogo,
      wifiSsid: outlet.wifiSsid || "Resto_Guest",
      wifiPassword: outlet.wifiPassword || "",
      tableTentSubtitle: outlet.tableTentSubtitle || "Scan kamera HP untuk pesan & bayar langsung dari meja",
      qrTemplate: outlet.qrTemplate || "acrylic"
    });
  } catch (err) {
    console.error("Error generating QR:", err);
    res.status(500).json({ error: "Gagal membuat QR Code." });
  }
});

// Omnichannel Sales Reports & Stats
app.get('/api/admin/stats', (req, res) => {
  const { outlet: outletQuery } = req.query;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);

  const outletOrders = db.orders.filter(o => o.outletId === outlet.id);
  const completedOrders = outletOrders.filter(o => o.paymentStatus === 'PAID');
  
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = completedOrders.length;
  const pendingOrders = outletOrders.filter(o => o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED').length;

  // Breakdown by Channel
  const channelBreakdown = {
    DINE_IN: completedOrders.filter(o => o.channel === 'DINE_IN').reduce((s, o) => s + (o.total || 0), 0),
    PICK_UP: completedOrders.filter(o => o.channel === 'PICK_UP').reduce((s, o) => s + (o.total || 0), 0),
    GOFOOD: completedOrders.filter(o => o.channel === 'GOFOOD').reduce((s, o) => s + (o.total || 0), 0),
    GRABFOOD: completedOrders.filter(o => o.channel === 'GRABFOOD').reduce((s, o) => s + (o.total || 0), 0),
    SHOPEEFOOD: completedOrders.filter(o => o.channel === 'SHOPEEFOOD').reduce((s, o) => s + (o.total || 0), 0)
  };

  res.json({
    outletName: outlet.name,
    totalRevenue,
    totalOrders,
    pendingOrders,
    channelBreakdown,
    recentOrders: outletOrders.slice(0, 10)
  });
});

// Store & Outlet Profile Settings (Nama Toko, Cabang, Struk, Logo, Wi-Fi & QR Akrilik)
app.get('/api/admin/store-profile', (req, res) => {
  const { outlet: outletQuery } = req.query;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);
  const biz = db.businesses.find(b => b.id === outlet.businessId) || db.businesses[0] || {};
  const effectiveLogo = outlet.logoUrl || biz.logoUrl || "/img/logo.svg";

  res.json({
    businessId: biz.id,
    businessName: biz.name || "ScanDine Restaurant",
    tagline: biz.tagline || "",
    ownerPhone: biz.ownerPhone || "",
    outletId: outlet.id,
    outletSlug: outlet.slug,
    outletName: outlet.name,
    address: outlet.address || "",
    phone: outlet.phone || "",
    taxRate: outlet.taxRate !== undefined ? outlet.taxRate : 10,
    serviceRate: outlet.serviceRate !== undefined ? outlet.serviceRate : 5,
    receiptFooter: outlet.receiptFooter || "Terima kasih atas kunjungan Anda!\nSilakan datang kembali.",
    logoUrl: effectiveLogo,
    wifiSsid: outlet.wifiSsid || "Resto_Guest",
    wifiPassword: outlet.wifiPassword || "",
    tableTentSubtitle: outlet.tableTentSubtitle || "Scan kamera HP untuk pesan & bayar langsung dari meja",
    qrTemplate: outlet.qrTemplate || "acrylic"
  });
});

app.put('/api/admin/store-profile', (req, res) => {
  const { outlet: outletQuery } = req.query;
  const {
    businessName,
    tagline,
    outletName,
    address,
    phone,
    taxRate,
    serviceRate,
    receiptFooter,
    logoUrl,
    wifiSsid,
    wifiPassword,
    tableTentSubtitle,
    qrTemplate
  } = req.body;

  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);
  const biz = db.businesses.find(b => b.id === outlet.businessId) || db.businesses[0];

  if (businessName !== undefined) biz.name = businessName.trim();
  if (tagline !== undefined) biz.tagline = tagline.trim();
  if (outletName !== undefined) outlet.name = outletName.trim();
  if (address !== undefined) outlet.address = address.trim();
  if (phone !== undefined) outlet.phone = phone.trim();
  if (taxRate !== undefined) outlet.taxRate = Number(taxRate) || 0;
  if (serviceRate !== undefined) outlet.serviceRate = Number(serviceRate) || 0;
  if (receiptFooter !== undefined) outlet.receiptFooter = receiptFooter.trim();
  if (logoUrl !== undefined) {
    outlet.logoUrl = logoUrl.trim();
    biz.logoUrl = logoUrl.trim();
  }
  if (wifiSsid !== undefined) outlet.wifiSsid = wifiSsid.trim();
  if (wifiPassword !== undefined) outlet.wifiPassword = wifiPassword.trim();
  if (tableTentSubtitle !== undefined) outlet.tableTentSubtitle = tableTentSubtitle.trim();
  if (qrTemplate !== undefined) outlet.qrTemplate = qrTemplate.trim();

  saveDb(db);
  io.emit('store_updated');

  res.json({
    success: true,
    message: "Profil toko, logo resto, dan format struk berhasil disimpan & disinkronkan!",
    profile: {
      businessName: biz.name,
      tagline: biz.tagline,
      outletName: outlet.name,
      address: outlet.address,
      phone: outlet.phone,
      taxRate: outlet.taxRate,
      serviceRate: outlet.serviceRate,
      receiptFooter: outlet.receiptFooter,
      logoUrl: outlet.logoUrl || biz.logoUrl,
      wifiSsid: outlet.wifiSsid,
      wifiPassword: outlet.wifiPassword,
      tableTentSubtitle: outlet.tableTentSubtitle,
      qrTemplate: outlet.qrTemplate
    }
  });
});

// --------------------------------------------------------------------------
// QRIS CONFIGURATION & PAYMENT GATEWAY APIS
// --------------------------------------------------------------------------
app.get('/api/admin/qris-settings', (req, res) => {
  const { outlet: outletQuery } = req.query;
  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);
  res.json(outlet.qrisSettings || {});
});

app.put('/api/admin/qris-settings', (req, res) => {
  const { outlet: outletQuery } = req.query;
  const {
    mode,
    merchantName,
    nmid,
    staticQrImage,
    gatewayProvider,
    serverKey,
    clientKey,
    instructions
  } = req.body;

  const db = getDb();
  const outlet = resolveOutlet(db, outletQuery);

  if (!outlet.qrisSettings) outlet.qrisSettings = {};

  if (mode !== undefined) outlet.qrisSettings.mode = mode;
  if (merchantName !== undefined) outlet.qrisSettings.merchantName = merchantName.trim();
  if (nmid !== undefined) outlet.qrisSettings.nmid = nmid.trim();
  if (staticQrImage !== undefined) outlet.qrisSettings.staticQrImage = staticQrImage.trim();
  if (gatewayProvider !== undefined) outlet.qrisSettings.gatewayProvider = gatewayProvider;
  if (serverKey !== undefined) outlet.qrisSettings.serverKey = serverKey.trim();
  if (clientKey !== undefined) outlet.qrisSettings.clientKey = clientKey.trim();
  if (instructions !== undefined) outlet.qrisSettings.instructions = instructions.trim();

  saveDb(db);
  io.emit('store_updated');

  res.json({
    success: true,
    message: "Konfigurasi QRIS Toko berhasil disimpan & disinkronkan!",
    qrisSettings: outlet.qrisSettings
  });
});

// Universal Webhook for QRIS Payment Gateways (Midtrans / Xendit)
app.post('/api/webhooks/qris', (req, res) => {
  try {
    const { order_id, transaction_status, external_id, status } = req.body;
    const targetOrderId = order_id || external_id;
    if (!targetOrderId) return res.status(400).json({ error: "Missing order_id" });

    const db = getDb();
    const order = db.orders.find(o => o.id === targetOrderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const isSuccess = transaction_status === 'settlement' || transaction_status === 'capture' || status === 'COMPLETED' || status === 'PAID';
    if (isSuccess) {
      order.paymentStatus = 'PAID';
      order.orderStatus = 'COOKING';
      saveDb(db);

      // Notify customer and kitchen
      io.to(`order_${order.id}`).emit('order_updated', order);
      io.to(`staff_${order.outletId}`).emit('new_order', order);
      io.to('staff_global').emit('new_order', order);
    }

    res.json({ success: true, orderId: targetOrderId, paymentStatus: order.paymentStatus });
  } catch (err) {
    res.status(500).json({ error: "Webhook processing error" });
  }
});

// --------------------------------------------------------------------------
// AUTHENTICATION & MULTI-GERAI PRIVACY API
// --------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }

  const db = getDb();
  const user = (db.users || []).find(u => 
    u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: "Username atau password salah." });
  }

  let assignedOutlet = null;
  if (user.allowedOutlets && user.allowedOutlets[0] !== '*') {
    const o = db.outlets.find(out => out.id === user.allowedOutlets[0] || out.slug === user.allowedOutlets[0]);
    if (o) {
      assignedOutlet = { id: o.id, slug: o.slug, name: o.name };
    }
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      allowedOutlets: user.allowedOutlets,
      avatar: user.avatar || "👤",
      assignedOutlet
    }
  });
});

app.get('/api/auth/users', (req, res) => {
  const db = getDb();
  res.json((db.users || []).map(u => ({
    username: u.username,
    name: u.name,
    role: u.role,
    allowedOutlets: u.allowedOutlets,
    avatar: u.avatar || "👤"
  })));
});

// --------------------------------------------------------------------------
// ROUTE ALIASES FOR UI PAGES
// --------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');

app.get('/', (req, res) => {
  const host = (req.get('host') || '').toLowerCase().split(':')[0];
  // Main domain scandine.web.id serves the official product Landing Page
  if (host === 'scandine.web.id' || host === 'www.scandine.web.id') {
    return res.sendFile('landing.html', { root: PUBLIC_DIR });
  }
  // Subdomains (demo.scandine.web.id, resto.scandine.web.id, localhost, etc.) serve the app hub
  res.sendFile('index.html', { root: PUBLIC_DIR });
});

app.get('/landing', (req, res) => {
  res.sendFile('landing.html', { root: PUBLIC_DIR });
});

app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: PUBLIC_DIR });
});

app.get('/order', (req, res) => {
  res.sendFile('customer.html', { root: PUBLIC_DIR });
});

app.get('/pos', (req, res) => {
  res.sendFile('pos.html', { root: PUBLIC_DIR });
});

app.get('/kitchen', (req, res) => {
  res.sendFile('pos.html', { root: PUBLIC_DIR });
});

app.get('/admin', (req, res) => {
  res.sendFile('admin.html', { root: PUBLIC_DIR });
});

// --------------------------------------------------------------------------
// SOCKET.IO REAL-TIME CHANNELS (PER OUTLET)
// --------------------------------------------------------------------------
io.on('connection', (socket) => {
  // Staff joins specific outlet room
  socket.on('join_staff', (outletId = 'outlet-senopati') => {
    socket.join(`staff_${outletId}`);
    socket.join('staff_global');
  });

  // Customer joins room for their specific order
  socket.on('watch_order', (orderId) => {
    socket.join(`order_${orderId}`);
  });
});

// Start Server on 0.0.0.0
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`=======================================================`);
  console.log(`  SCANDINE - SMART MULTI-OUTLET POS & OFD READY`);
  console.log(`=======================================================`);
  console.log(`  * Portal Utama:     http://localhost:${PORT}`);
  console.log(`  * Customer Meja 1:  http://localhost:${PORT}/order?outlet=senopati&table=1`);
  console.log(`  * Kasir & Kitchen:  http://localhost:${PORT}/pos?outlet=senopati`);
  console.log(`  * Admin Dashboard:  http://localhost:${PORT}/admin?outlet=senopati`);
  console.log(`-------------------------------------------------------`);
  console.log(`  * Akses dari HP:    http://${localIp}:${PORT}/order?outlet=senopati&table=1`);
  console.log(`=======================================================`);
});
