const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const QRCode = require('qrcode');
const os = require('os');
const { getDb, saveDb, ensureDb } = require('./database');

ensureDb();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to get local network IP address (e.g. 192.168.x.x)
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
function generateOrderId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${randomSuffix}`;
}

// --------------------------------------------------------------------------
// NETWORK INFO FOR MOBILE SCANNING
// --------------------------------------------------------------------------
app.get('/api/network-info', async (req, res) => {
  try {
    const localIp = getLocalIp();
    const mobileUrl = `http://${localIp}:${PORT}/order?table=1`;
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
// CUSTOMER & BOOTSTRAP API
// --------------------------------------------------------------------------

// Get initial store data for customer scanning a table QR
app.get('/api/bootstrap', (req, res) => {
  const { table } = req.query;
  const db = getDb();
  
  let currentTable = null;
  if (table) {
    currentTable = db.tables.find(t => t.number.toString().toLowerCase() === table.toString().toLowerCase() || t.id === table);
  }

  res.json({
    settings: db.settings,
    categories: db.categories,
    menus: db.menus,
    table: currentTable || { number: table || "1", name: `Meja ${table || 1}` }
  });
});

// Create new customer order (Self-Order)
app.post('/api/orders', async (req, res) => {
  try {
    const { tableNumber, customerName, customerPhone, items, paymentMethod, notes } = req.body;
    
    if (!items || !items.length) {
      return res.status(400).json({ error: "Item pesanan tidak boleh kosong." });
    }

    const db = getDb();
    const settings = db.settings;

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

    const taxAmount = Math.round((subtotal * settings.taxRate) / 100);
    const serviceAmount = Math.round((subtotal * settings.serviceRate) / 100);
    const total = subtotal + taxAmount + serviceAmount;

    const orderId = generateOrderId();
    const isQris = paymentMethod === 'QRIS';

    // Generate mock QRIS string and QR code image
    let qrisDataUrl = null;
    if (isQris) {
      const mockQrisPayload = `00020101021226${settings.restoName.toUpperCase()}520458125303360540${total}5802ID5911SCANDINE_ORD_ID${orderId}6304`;
      qrisDataUrl = await QRCode.toDataURL(mockQrisPayload, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 320,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
    }

    const newOrder = {
      id: orderId,
      tableNumber: tableNumber || "Meja 1",
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
      createdAt: new Date().toISOString()
    };

    db.orders.unshift(newOrder);
    saveDb(db);

    // If customer chooses Pay at Cashier, order immediately arrives at POS/Kitchen
    if (!isQris) {
      io.to('staff').emit('new_order', newOrder);
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

// Mock Payment Success (simulating webhook from Midtrans / Xendit / QRIS scan)
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

  // Notify customer's room & staff POS/Kitchen in real-time
  io.to(`order_${id}`).emit('order_updated', order);
  io.to('staff').emit('order_updated', order);
  io.to('staff').emit('new_order', order); // Trigger audible chime on POS

  res.json({ success: true, message: "Pembayaran berhasil diverifikasi.", order });
});

// --------------------------------------------------------------------------
// STAFF POS & KITCHEN APIS
// --------------------------------------------------------------------------

// Get all orders
app.get('/api/staff/orders', (req, res) => {
  const { status } = req.query;
  const db = getDb();
  let list = db.orders;

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

  saveDb(db);

  // Real-time broadcast
  io.to(`order_${id}`).emit('order_updated', order);
  io.to('staff').emit('order_updated', order);

  res.json({ success: true, order });
});

// --------------------------------------------------------------------------
// ADMIN / MERCHANT APIS
// --------------------------------------------------------------------------

app.get('/api/admin/menus', (req, res) => {
  const db = getDb();
  res.json(db.menus);
});

app.post('/api/admin/menus', (req, res) => {
  const db = getDb();
  const newMenu = {
    id: `menu-${Date.now()}`,
    ...req.body,
    isAvailable: req.body.isAvailable !== undefined ? req.body.isAvailable : true
  };
  db.menus.push(newMenu);
  saveDb(db);
  io.emit('menu_changed');
  res.status(201).json(newMenu);
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

app.get('/api/admin/tables', (req, res) => {
  const db = getDb();
  res.json(db.tables);
});

app.post('/api/admin/tables', (req, res) => {
  const { number, name } = req.body;
  const db = getDb();
  const newTable = {
    id: `table-${Date.now()}`,
    number: number || `${db.tables.length + 1}`,
    name: name || `Meja ${number}`,
    status: "AVAILABLE"
  };
  db.tables.push(newTable);
  saveDb(db);
  res.status(201).json(newTable);
});

// Generate QR Code for a table (Smart IP detection for phone camera scan)
app.get('/api/admin/tables/:tableNum/qr', async (req, res) => {
  try {
    const { tableNum } = req.params;
    const localIp = getLocalIp();
    
    // Use the LAN IP so phones scanning the QR code reach this machine
    const host = req.get('host');
    let effectiveHost = host;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      effectiveHost = `${localIp}:${PORT}`;
    }

    const orderUrl = `${req.protocol}://${effectiveHost}/order?table=${encodeURIComponent(tableNum)}`;
    
    const qrImage = await QRCode.toDataURL(orderUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#09090b',
        light: '#ffffff'
      }
    });

    res.json({
      tableNumber: tableNum,
      targetUrl: orderUrl,
      qrDataUrl: qrImage
    });
  } catch (err) {
    console.error("Error generating QR:", err);
    res.status(500).json({ error: "Gagal membuat QR Code." });
  }
});

// Sales Reports & Stats
app.get('/api/admin/stats', (req, res) => {
  const db = getDb();
  const completedOrders = db.orders.filter(o => o.paymentStatus === 'PAID');
  
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = completedOrders.length;
  const pendingOrders = db.orders.filter(o => o.orderStatus !== 'COMPLETED' && o.orderStatus !== 'CANCELLED').length;

  const itemCounts = {};
  completedOrders.forEach(order => {
    (order.items || []).forEach(it => {
      itemCounts[it.name] = (itemCounts[it.name] || 0) + it.qty;
    });
  });

  const topItems = Object.entries(itemCounts)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  res.json({
    totalRevenue,
    totalOrders,
    pendingOrders,
    topItems,
    recentOrders: db.orders.slice(0, 10)
  });
});

// --------------------------------------------------------------------------
// ROUTE ALIASES FOR UI PAGES
// --------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: PUBLIC_DIR });
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
// SOCKET.IO REAL-TIME CHANNELS
// --------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('join_staff', () => {
    socket.join('staff');
  });

  socket.on('watch_order', (orderId) => {
    socket.join(`order_${orderId}`);
  });
});

// Start Server on 0.0.0.0
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`=======================================================`);
  console.log(`  SCANDINE - SMART QR DINE-IN & POS SYSTEM (READY)`);
  console.log(`=======================================================`);
  console.log(`  * Portal Utama:     http://localhost:${PORT}`);
  console.log(`  * Customer QR Menu: http://localhost:${PORT}/order?table=1`);
  console.log(`  * Kasir & Kitchen:  http://localhost:${PORT}/pos`);
  console.log(`  * Admin Dashboard:  http://localhost:${PORT}/admin`);
  console.log(`-------------------------------------------------------`);
  console.log(`  * Akses dari HP:    http://${localIp}:${PORT}/order?table=1`);
  console.log(`=======================================================`);
});
