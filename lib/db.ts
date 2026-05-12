import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'mock.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Singleton database connection
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initTables(_db);
  }
  return _db;
}

function initTables(db: Database.Database) {
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
      images TEXT, -- JSON array of image URLs
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
      data TEXT, -- JSON payload
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
      whitelist_user_ids TEXT, -- JSON array of user IDs
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
      allowed_versions TEXT, -- JSON array of versions that bypass maintenance
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- ─── E-commerce: Categories ─────────────────────────────────────────
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
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    -- ─── E-commerce: Addresses ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT,                          -- "Home", "Office", etc.
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      street TEXT NOT NULL,
      city TEXT NOT NULL,
      province TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'ID',  -- ISO 3166-1 alpha-2
      notes TEXT,
      is_default INTEGER DEFAULT 0,
      latitude REAL,
      longitude REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ─── E-commerce: Cart ──────────────────────────────────────────────
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

    -- ─── E-commerce: Orders ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,                  -- public ID, e.g., ORD-2026-00153
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
      shipping_address_snapshot TEXT,                  -- JSON of address at order time
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
      product_id TEXT,                                 -- nullable: product may be deleted later
      product_name TEXT NOT NULL,                      -- snapshot at order time
      product_image TEXT,                              -- snapshot
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL,                        -- snapshot
      subtotal REAL NOT NULL,                          -- quantity * unit_price
      FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user_id    ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_user   ON cart_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_addresses_user    ON addresses(user_id);
  `);
}

export default getDb;
