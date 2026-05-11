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
      avatar TEXT,
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
    INSERT INTO users (id, name, email, password, phone, avatar, role, created_at)
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

  // ─── Done ───
  db.close();
  console.log('\n✨ Seed completed successfully!');
  console.log(`\n📋 Test accounts:`);
  console.log(`   Admin: admin@mock.com / password123`);
  console.log(`   User:  user@mock.com  / password123`);
}

seed();
