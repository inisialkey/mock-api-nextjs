import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { faker } from '@faker-js/faker';

// ─── Config ───────────────────────────────────────────
const DB_PATH = path.join(process.cwd(), 'data', 'mock.db');
const SEED_USERS = 30;
const SEED_PRODUCTS = 50;
const SEED_NOTIFICATIONS_PER_USER = 5;

// ─── Helpers ──────────────────────────────────────────
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function uuid(): string {
  return crypto.randomUUID();
}

// ─── Categories & Product Images ──────────────────────
const CATEGORIES = ['electronics', 'fashion', 'food', 'health', 'sports', 'books', 'home'];

const NOTIFICATION_TYPES = ['general', 'promo', 'order', 'system'] as const;

const NOTIFICATION_TEMPLATES = {
  general: [
    { title: 'Welcome!', body: 'Welcome to our app. Explore and enjoy!' },
    { title: 'Profile Updated', body: 'Your profile has been successfully updated.' },
    { title: 'New Feature', body: 'Check out our latest feature — dark mode is now available!' },
  ],
  promo: [
    { title: 'Flash Sale 🔥', body: 'Up to 70% off on electronics. Limited time only!' },
    { title: 'Weekend Deal', body: 'Free shipping on all orders this weekend.' },
    { title: 'Exclusive Offer', body: 'Use code MOCK50 for 50% off your next purchase.' },
  ],
  order: [
    { title: 'Order Confirmed', body: 'Your order #{{id}} has been confirmed.' },
    { title: 'Order Shipped', body: 'Your order #{{id}} is on its way!' },
    { title: 'Order Delivered', body: 'Your order #{{id}} has been delivered.' },
  ],
  system: [
    { title: 'Security Alert', body: 'A new device logged into your account.' },
    { title: 'App Update', body: 'A new version is available. Please update.' },
    { title: 'Maintenance', body: 'Scheduled maintenance on Sunday, 2:00 AM - 4:00 AM.' },
  ],
};

// ─── Main Seed Function ───────────────────────────────
function seed() {
  console.log('🌱 Starting database seed...\n');

  // Ensure data directory
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Remove existing DB
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('   Removed existing database');
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ─── Create Tables ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      discount_price REAL,
      category TEXT NOT NULL,
      image TEXT,
      images TEXT,
      stock INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT DEFAULT 'general' CHECK(type IN ('general', 'promo', 'order', 'system')),
      data TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      user_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('   ✅ Tables created');

  // ─── Seed Users ───
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password, phone, avatar_url, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const password = hashPassword('password123');
  const userIds: string[] = [];

  // Fixed test accounts
  const adminId = uuid();
  const userId = uuid();
  userIds.push(adminId, userId);

  insertUser.run(
    adminId,
    'Admin User',
    'admin@mock.com',
    password,
    '+6281234567890',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    'admin',
    faker.date.past({ years: 1 }).toISOString()
  );

  insertUser.run(
    userId,
    'Test User',
    'user@mock.com',
    password,
    '+6281234567891',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=user',
    'user',
    faker.date.past({ years: 1 }).toISOString()
  );

  // Random users
  for (let i = 0; i < SEED_USERS; i++) {
    const id = uuid();
    userIds.push(id);
    insertUser.run(
      id,
      faker.person.fullName(),
      faker.internet.email().toLowerCase(),
      password,
      faker.phone.number({ style: 'international' }),
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${faker.string.alphanumeric(8)}`,
      'user',
      faker.date.past({ years: 1 }).toISOString()
    );
  }
  console.log(`   ✅ ${userIds.length} users seeded`);

  // ─── Seed Products ───
  const insertProduct = db.prepare(`
    INSERT INTO products (id, name, description, price, discount_price, category, image, images, stock, rating, rating_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < SEED_PRODUCTS; i++) {
    const category = faker.helpers.arrayElement(CATEGORIES);
    const price = parseFloat(faker.commerce.price({ min: 10000, max: 5000000 }));
    const hasDiscount = faker.datatype.boolean({ probability: 0.3 });
    const discountPrice = hasDiscount ? Math.round(price * (1 - faker.number.float({ min: 0.1, max: 0.5 }))) : null;
    const rating = parseFloat(faker.number.float({ min: 3.0, max: 5.0, fractionDigits: 1 }).toFixed(1));

    const imageId = faker.number.int({ min: 1, max: 200 });
    const image = `https://picsum.photos/seed/${imageId}/400/400`;
    const images = JSON.stringify(
      Array.from({ length: faker.number.int({ min: 2, max: 5 }) }, (_, j) =>
        `https://picsum.photos/seed/${imageId + j}/400/400`
      )
    );

    insertProduct.run(
      uuid(),
      faker.commerce.productName(),
      faker.commerce.productDescription(),
      price,
      discountPrice,
      category,
      image,
      images,
      faker.number.int({ min: 0, max: 500 }),
      rating,
      faker.number.int({ min: 5, max: 1000 }),
      faker.date.past({ years: 1 }).toISOString()
    );
  }
  console.log(`   ✅ ${SEED_PRODUCTS} products seeded`);

  // ─── Seed Notifications ───
  const insertNotification = db.prepare(`
    INSERT INTO notifications (id, user_id, title, body, type, data, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let notifCount = 0;
  for (const uid of userIds.slice(0, 10)) {
    for (let i = 0; i < SEED_NOTIFICATIONS_PER_USER; i++) {
      const type = faker.helpers.arrayElement(NOTIFICATION_TYPES);
      const template = faker.helpers.arrayElement(NOTIFICATION_TEMPLATES[type]);
      const orderId = faker.string.alphanumeric(8).toUpperCase();

      insertNotification.run(
        uuid(),
        uid,
        template.title,
        template.body.replace('{{id}}', orderId),
        type,
        JSON.stringify({ order_id: orderId }),
        faker.datatype.boolean({ probability: 0.4 }) ? 1 : 0,
        faker.date.recent({ days: 30 }).toISOString()
      );
      notifCount++;
    }
  }
  console.log(`   ✅ ${notifCount} notifications seeded`);

  // ─── Seed Chat Rooms & Messages ───

  // Add chat tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT DEFAULT 'private' CHECK(type IN ('private', 'group')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_room_members (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, user_id),
      FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text' CHECK(type IN ('text', 'image', 'file')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const insertRoom = db.prepare('INSERT INTO chat_rooms (id, name, type) VALUES (?, ?, ?)');
  const insertMember = db.prepare('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)');
  const insertMessage = db.prepare(
    'INSERT INTO chat_messages (id, room_id, sender_id, content, type, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  // Private chat between admin & test user
  const privateRoomId = uuid();
  insertRoom.run(privateRoomId, null, 'private');
  insertMember.run(privateRoomId, adminId);
  insertMember.run(privateRoomId, userId);

  const privateMsgs = [
    { sender: adminId, content: 'Halo, selamat datang di app kita!' },
    { sender: userId, content: 'Terima kasih! App-nya keren 🔥' },
    { sender: adminId, content: 'Ada fitur baru lho, coba cek halaman produk' },
    { sender: userId, content: 'Siap, saya cek sekarang' },
    { sender: adminId, content: 'Kalau ada bug, langsung lapor ya 👍' },
  ];

  for (let i = 0; i < privateMsgs.length; i++) {
    const msg = privateMsgs[i];
    const createdAt = new Date(Date.now() - (privateMsgs.length - i) * 60000).toISOString();
    insertMessage.run(uuid(), privateRoomId, msg.sender, msg.content, 'text', createdAt);
  }

  // Group chat with multiple users
  const groupRoomId = uuid();
  insertRoom.run(groupRoomId, 'Tim Mobile Dev', 'group');
  insertMember.run(groupRoomId, adminId);
  insertMember.run(groupRoomId, userId);
  for (let i = 0; i < Math.min(5, userIds.length - 2); i++) {
    insertMember.run(groupRoomId, userIds[i + 2]);
  }

  const groupMsgs = [
    { sender: adminId, content: 'Selamat datang di grup Tim Mobile Dev!' },
    { sender: userId, content: 'Halo semuanya 👋' },
    { sender: userIds[2], content: 'Siap, sprint baru dimulai hari ini' },
    { sender: adminId, content: 'Jangan lupa daily standup jam 10 ya' },
    { sender: userIds[3], content: 'Noted boss 🫡' },
    { sender: userId, content: 'PR review-nya sudah saya approve' },
    { sender: adminId, content: 'Good job team! 🚀' },
  ];

  for (let i = 0; i < groupMsgs.length; i++) {
    const msg = groupMsgs[i];
    const createdAt = new Date(Date.now() - (groupMsgs.length - i) * 60000).toISOString();
    insertMessage.run(uuid(), groupRoomId, msg.sender, msg.content, 'text', createdAt);
  }

  console.log(`   ✅ 2 chat rooms with messages seeded`);

  // ─── Seed App Config ───

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      type TEXT DEFAULT 'string' CHECK(type IN ('string', 'number', 'boolean', 'json')),
      description TEXT,
      platform TEXT DEFAULT 'all' CHECK(platform IN ('all', 'ios', 'android')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      description TEXT,
      platform TEXT DEFAULT 'all' CHECK(platform IN ('all', 'ios', 'android')),
      min_version TEXT,
      max_version TEXT,
      user_percentage INTEGER DEFAULT 100,
      whitelist_user_ids TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS force_update (
      platform TEXT PRIMARY KEY CHECK(platform IN ('ios', 'android')),
      current_version TEXT NOT NULL,
      min_version TEXT NOT NULL,
      update_url TEXT NOT NULL,
      release_notes TEXT,
      is_force INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      id INTEGER PRIMARY KEY DEFAULT 1,
      is_active INTEGER DEFAULT 0,
      title TEXT DEFAULT 'Maintenance',
      message TEXT DEFAULT 'We are currently performing maintenance. Please try again later.',
      start_at TEXT,
      end_at TEXT,
      allowed_versions TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // App Configs
  const insertConfig = db.prepare(
    'INSERT INTO app_config (key, value, type, description, platform) VALUES (?, ?, ?, ?, ?)'
  );

  const configs = [
    { key: 'app_name', value: 'MockApp', type: 'string', desc: 'Application display name', platform: 'all' },
    { key: 'app_tagline', value: 'Your everyday companion', type: 'string', desc: 'Tagline shown on splash/login', platform: 'all' },
    { key: 'max_upload_size', value: '10485760', type: 'number', desc: 'Max file upload size in bytes (10MB)', platform: 'all' },
    { key: 'pagination_limit', value: '20', type: 'number', desc: 'Default items per page', platform: 'all' },
    { key: 'otp_timeout', value: '120', type: 'number', desc: 'OTP expiry in seconds', platform: 'all' },
    { key: 'support_email', value: 'support@mockapp.com', type: 'string', desc: 'Customer support email', platform: 'all' },
    { key: 'support_phone', value: '+6281234567890', type: 'string', desc: 'Customer support phone', platform: 'all' },
    { key: 'support_whatsapp', value: 'https://wa.me/6281234567890', type: 'string', desc: 'WhatsApp support link', platform: 'all' },
    { key: 'terms_url', value: 'https://mockapp.com/terms', type: 'string', desc: 'Terms of service URL', platform: 'all' },
    { key: 'privacy_url', value: 'https://mockapp.com/privacy', type: 'string', desc: 'Privacy policy URL', platform: 'all' },
    { key: 'onboarding_enabled', value: 'true', type: 'boolean', desc: 'Show onboarding on first launch', platform: 'all' },
    { key: 'max_cart_items', value: '50', type: 'number', desc: 'Maximum items in cart', platform: 'all' },
    { key: 'currency', value: 'IDR', type: 'string', desc: 'Default currency code', platform: 'all' },
    { key: 'locale', value: 'id-ID', type: 'string', desc: 'Default locale', platform: 'all' },
    { key: 'google_maps_style', value: '[]', type: 'json', desc: 'Custom Google Maps styling', platform: 'all' },
    { key: 'ios_review_prompt_delay', value: '7', type: 'number', desc: 'Days before showing app review prompt', platform: 'ios' },
    { key: 'android_in_app_update', value: 'true', type: 'boolean', desc: 'Enable in-app update for Android', platform: 'android' },
  ];

  for (const c of configs) {
    insertConfig.run(c.key, c.value, c.type, c.desc, c.platform);
  }
  console.log(`   ✅ ${configs.length} app configs seeded`);

  // Feature Flags
  const insertFlag = db.prepare(
    `INSERT INTO feature_flags (key, enabled, description, platform, min_version, max_version, user_percentage, whitelist_user_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const flags = [
    { key: 'dark_mode', enabled: 1, desc: 'Enable dark mode toggle', platform: 'all', min: null, max: null, pct: 100, whitelist: null },
    { key: 'new_checkout_flow', enabled: 1, desc: 'New checkout UI with stepper', platform: 'all', min: '2.0.0', max: null, pct: 50, whitelist: JSON.stringify([adminId, userId]) },
    { key: 'biometric_login', enabled: 1, desc: 'Allow fingerprint/face login', platform: 'all', min: '1.5.0', max: null, pct: 100, whitelist: null },
    { key: 'stories_feature', enabled: 0, desc: 'Instagram-like stories on home', platform: 'all', min: '3.0.0', max: null, pct: 0, whitelist: JSON.stringify([adminId]) },
    { key: 'voice_search', enabled: 0, desc: 'Voice search in product search', platform: 'all', min: '2.5.0', max: null, pct: 10, whitelist: null },
    { key: 'live_chat_support', enabled: 1, desc: 'In-app live chat with CS', platform: 'all', min: null, max: null, pct: 100, whitelist: null },
    { key: 'ar_product_preview', enabled: 0, desc: 'AR preview for products', platform: 'ios', min: '3.0.0', max: null, pct: 5, whitelist: null },
    { key: 'google_pay', enabled: 1, desc: 'Google Pay payment method', platform: 'android', min: '2.0.0', max: null, pct: 100, whitelist: null },
    { key: 'apple_pay', enabled: 1, desc: 'Apple Pay payment method', platform: 'ios', min: '2.0.0', max: null, pct: 100, whitelist: null },
    { key: 'referral_program', enabled: 1, desc: 'Referral invite & earn feature', platform: 'all', min: '2.2.0', max: null, pct: 80, whitelist: null },
    { key: 'product_recommendations', enabled: 1, desc: 'AI-based product recommendations', platform: 'all', min: null, max: null, pct: 100, whitelist: null },
    { key: 'flash_sale_countdown', enabled: 1, desc: 'Show countdown timer on flash sale', platform: 'all', min: null, max: null, pct: 100, whitelist: null },
  ];

  for (const f of flags) {
    insertFlag.run(f.key, f.enabled, f.desc, f.platform, f.min, f.max, f.pct, f.whitelist);
  }
  console.log(`   ✅ ${flags.length} feature flags seeded`);

  // Force Update
  const insertForceUpdate = db.prepare(
    'INSERT INTO force_update (platform, current_version, min_version, update_url, release_notes, is_force) VALUES (?, ?, ?, ?, ?, ?)'
  );

  insertForceUpdate.run(
    'android',
    '2.1.0',
    '1.5.0',
    'https://play.google.com/store/apps/details?id=com.mockapp',
    'Bug fixes, performance improvements, and new checkout experience.',
    1
  );

  insertForceUpdate.run(
    'ios',
    '2.1.0',
    '1.5.0',
    'https://apps.apple.com/app/mockapp/id123456789',
    'Bug fixes, performance improvements, and new checkout experience.',
    1
  );
  console.log(`   ✅ Force update config seeded (Android & iOS)`);

  // Maintenance (default: off)
  db.prepare(
    `INSERT INTO maintenance (id, is_active, title, message, start_at, end_at, allowed_versions)
     VALUES (1, 0, 'Scheduled Maintenance', 'We are improving our systems. Please try again shortly.', NULL, NULL, ?)`
  ).run(JSON.stringify(['2.1.0']));
  console.log(`   ✅ Maintenance config seeded (inactive)`);

  // ─── E-commerce: Categories, Addresses, Orders ──────────────────────

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      image_url TEXT,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      street TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'ID',
      notes TEXT,
      is_default INTEGER DEFAULT 0,
      latitude REAL,
      longitude REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
      added_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (user_id, product_id),
      FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','confirmed','processing','shipped','out_for_delivery','delivered','cancelled','refunded')),
      subtotal REAL NOT NULL,
      shipping_fee REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'IDR',
      payment_method TEXT
        CHECK(payment_method IS NULL OR payment_method IN ('bank_transfer','credit_card','e_wallet','cod')),
      payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(payment_status IN ('pending','paid','failed','refunded')),
      shipping_address_id TEXT,
      shipping_address_snapshot TEXT,
      tracking_number TEXT,
      notes TEXT,
      placed_at TEXT DEFAULT (datetime('now')),
      confirmed_at TEXT,
      shipped_at TEXT,
      delivered_at TEXT,
      cancelled_at TEXT,
      cancellation_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (shipping_address_id) REFERENCES addresses(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT NOT NULL,
      product_image TEXT,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );
  `);

  // Categories — slugs match the existing `CATEGORIES` constant used by products
  const insertCategory = db.prepare(
    `INSERT INTO categories (id, slug, name, description, icon, image_url, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const categoryDefs = [
    { slug: 'electronics', name: 'Electronics',  icon: 'devices',        desc: 'Phones, laptops, gadgets, and accessories.' },
    { slug: 'fashion',     name: 'Fashion',      icon: 'checkroom',      desc: 'Clothing, footwear, and accessories.' },
    { slug: 'food',        name: 'Food & Drinks', icon: 'restaurant',    desc: 'Groceries, snacks, beverages.' },
    { slug: 'health',      name: 'Health & Beauty', icon: 'spa',         desc: 'Personal care, supplements, cosmetics.' },
    { slug: 'sports',      name: 'Sports & Outdoor', icon: 'sports_soccer', desc: 'Fitness gear, outdoor equipment, sportswear.' },
    { slug: 'books',       name: 'Books',        icon: 'menu_book',      desc: 'Novels, textbooks, comics.' },
    { slug: 'home',        name: 'Home & Living', icon: 'chair',         desc: 'Furniture, decor, kitchen.' },
  ];
  for (let i = 0; i < categoryDefs.length; i++) {
    const c = categoryDefs[i];
    insertCategory.run(
      uuid(),
      c.slug,
      c.name,
      c.desc,
      c.icon,
      `https://picsum.photos/seed/${c.slug}/600/400`,
      i + 1
    );
  }
  console.log(`   ✅ ${categoryDefs.length} categories seeded`);

  // Addresses — 2 per fixed test user (admin + user)
  const insertAddress = db.prepare(
    `INSERT INTO addresses (id, user_id, label, recipient_name, phone, street, city, province, postal_code, country, notes, is_default, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const addressDefs = [
    { user: adminId, label: 'Home',   recipient: 'Admin User', phone: '+6281234567890', street: 'Jl. Sudirman No. 1', city: 'Jakarta Selatan', province: 'DKI Jakarta', postal: '12190', notes: 'Apartment 12A, Tower B', is_default: 1, lat: -6.2088, lng: 106.8456 },
    { user: adminId, label: 'Office', recipient: 'Admin User', phone: '+6281234567890', street: 'Jl. Gatot Subroto No. 42', city: 'Jakarta Selatan', province: 'DKI Jakarta', postal: '12930', notes: 'Floor 5', is_default: 0, lat: -6.2335, lng: 106.8284 },
    { user: userId,  label: 'Home',   recipient: 'Test User',  phone: '+6281234567891', street: 'Jl. Asia Afrika No. 158', city: 'Bandung',          province: 'Jawa Barat',  postal: '40112', notes: 'Pagar hijau, samping warung',     is_default: 1, lat: -6.9217, lng: 107.6045 },
    { user: userId,  label: 'Kampus', recipient: 'Test User',  phone: '+6281234567891', street: 'Jl. Ganesha No. 10',     city: 'Bandung',          province: 'Jawa Barat',  postal: '40132', notes: 'Kost Pak Budi, kamar 7',         is_default: 0, lat: -6.8915, lng: 107.6107 },
  ];
  const addressIdsByUser: Record<string, string[]> = {};
  for (const a of addressDefs) {
    const id = uuid();
    addressIdsByUser[a.user] = addressIdsByUser[a.user] || [];
    addressIdsByUser[a.user].push(id);
    insertAddress.run(
      id, a.user, a.label, a.recipient, a.phone,
      a.street, a.city, a.province, a.postal, 'ID',
      a.notes, a.is_default, a.lat, a.lng
    );
  }
  console.log(`   ✅ ${addressDefs.length} addresses seeded`);

  // Orders — 3 orders for the fixed Test User, varied statuses
  interface SeedProduct { id: string; name: string; price: number; image: string | null }
  const sampleProducts = db
    .prepare('SELECT id, name, price, image FROM products WHERE is_active = 1 LIMIT 8')
    .all() as SeedProduct[];

  if (sampleProducts.length >= 4 && addressIdsByUser[userId]?.[0]) {
    const insertOrder = db.prepare(
      `INSERT INTO orders (id, reference, user_id, status, subtotal, shipping_fee, discount, tax, total, currency, payment_method, payment_status, shipping_address_id, shipping_address_snapshot, tracking_number, notes, placed_at, confirmed_at, shipped_at, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertOrderItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_image, quantity, unit_price, subtotal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const userAddressId = addressIdsByUser[userId][0];
    const addressSnapshot = JSON.stringify({
      label: 'Home',
      recipient_name: 'Test User',
      phone: '+6281234567891',
      street: 'Jl. Asia Afrika No. 158',
      city: 'Bandung',
      province: 'Jawa Barat',
      postal_code: '40112',
      country: 'ID',
    });

    interface ItemPlan { product: SeedProduct; qty: number; subtotal: number }
    const planItems = (picks: SeedProduct[], quantities: number[]): ItemPlan[] =>
      picks.map((p, i) => ({
        product: p,
        qty: quantities[i],
        subtotal: Math.round(p.price * quantities[i]),
      }));
    const insertItems = (orderId: string, items: ItemPlan[]) => {
      for (const it of items) {
        insertOrderItem.run(
          uuid(), orderId,
          it.product.id, it.product.name, it.product.image,
          it.qty, it.product.price, it.subtotal
        );
      }
    };

    // 1. Delivered order (45 days ago)
    {
      const id = uuid();
      const items = planItems([sampleProducts[0], sampleProducts[1]], [1, 2]);
      const subtotal = items.reduce((a, x) => a + x.subtotal, 0);
      const shippingFee = 25000;
      const total = subtotal + shippingFee;
      const placedAt    = new Date(Date.now() - 45 * 86400000).toISOString();
      const confirmedAt = new Date(Date.now() - 45 * 86400000 + 3600000).toISOString();
      const shippedAt   = new Date(Date.now() - 44 * 86400000).toISOString();
      const deliveredAt = new Date(Date.now() - 42 * 86400000).toISOString();
      insertOrder.run(
        id, 'ORD-2026-00001', userId, 'delivered',
        subtotal, shippingFee, 0, 0, total, 'IDR',
        'credit_card', 'paid',
        userAddressId, addressSnapshot,
        'JNE-001-IDX-90A12', 'Mohon diletakkan di teras.',
        placedAt, confirmedAt, shippedAt, deliveredAt
      );
      insertItems(id, items);
    }

    // 2. Shipped, currently in transit (3 days ago)
    {
      const id = uuid();
      const items = planItems([sampleProducts[2], sampleProducts[3], sampleProducts[4]], [1, 1, 1]);
      const subtotal = items.reduce((a, x) => a + x.subtotal, 0);
      const shippingFee = 30000;
      const total = subtotal + shippingFee;
      const placedAt    = new Date(Date.now() - 3 * 86400000).toISOString();
      const confirmedAt = new Date(Date.now() - 3 * 86400000 + 1800000).toISOString();
      const shippedAt   = new Date(Date.now() - 1 * 86400000).toISOString();
      insertOrder.run(
        id, 'ORD-2026-00002', userId, 'shipped',
        subtotal, shippingFee, 0, 0, total, 'IDR',
        'bank_transfer', 'paid',
        userAddressId, addressSnapshot,
        'JNE-002-IDX-77B43', null,
        placedAt, confirmedAt, shippedAt, null
      );
      insertItems(id, items);
    }

    // 3. Pending payment (15 minutes ago)
    {
      const id = uuid();
      const items = planItems([sampleProducts[5]], [1]);
      const subtotal = items.reduce((a, x) => a + x.subtotal, 0);
      const shippingFee = 15000;
      const total = subtotal + shippingFee;
      const placedAt = new Date(Date.now() - 15 * 60000).toISOString();
      insertOrder.run(
        id, 'ORD-2026-00003', userId, 'pending',
        subtotal, shippingFee, 0, 0, total, 'IDR',
        'e_wallet', 'pending',
        userAddressId, addressSnapshot,
        null, null,
        placedAt, null, null, null
      );
      insertItems(id, items);
    }

    console.log(`   ✅ 3 sample orders seeded for Test User`);
  }

  // ─── Done ───
  db.close();
  console.log('\n✨ Seed completed successfully!');
  console.log(`\n📋 Test accounts:`);
  console.log(`   Admin: admin@mock.com / password123`);
  console.log(`   User:  user@mock.com  / password123`);
  console.log(`\n💬 WebSocket: ws://localhost:3000`);
  console.log(`   Connect with: { auth: { token: "<access_token>" } }`);
  console.log(`\n⚙️  Remote Config: GET /api/config?platform=android&app_version=2.0.0`);
}

seed();
