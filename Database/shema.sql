-- ========== GAZCOM DATABASE SCHEMA (PostgreSQL / Neon) ==========

-- Enable UUID extension (optional, for IDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========== 1. USERS TABLE (admin only) ==========
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (username, email, password_hash, full_name, phone, role)
VALUES (
    'gazcom_admin',
    'gazcom.gm@gmail.com',
    '$2a$10$CwTycUXWue0Thq9StjUM0uQqQqQqQqQqQqQqQqQqQqQqQqQq',
    'GAZCOM Admin',
    '+254724515819',
    'admin'
) ON CONFLICT (username) DO NOTHING;

-- ========== 2. CATEGORIES TABLE ==========
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    icon VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert the 5 main categories (background images will be updated via admin panel)
INSERT INTO categories (name, description, image_url, display_order) VALUES
('PETROLEUM EQUIPMENTS', 'High-quality pumps, nozzles, storage tanks, and dispensing systems', 'https://images.unsplash.com/photo-1581091226033-d5c48150dbaa?w=1200', 1),
('PETROLEUM ELECTRICALS', 'Explosion-proof lighting, cables, control panels, and electrical accessories', 'https://images.unsplash.com/photo-1563206767-5b18f218e8de?w=1200', 2),
('PETROL STATION PARTS AND ACCESSORIES', 'Hose swivels, breakaways, dispenser parts, and safety accessories', 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=1200', 3),
('PETROLEUM GAS AND ACCESSORIES', 'LPG cylinders, regulators, valves, and gas detection systems', 'https://images.unsplash.com/photo-1581092335871-4b6e0d0e9b4a?w=1200', 4),
('PETROLEUM PERSONAL PROTECTIVE EQUIPMENTS', 'Flame-resistant coveralls, gloves, goggles, and safety gear', 'https://images.unsplash.com/photo-1581092335871-4b6e0d0e9b4a?w=1200', 5)
ON CONFLICT (name) DO NOTHING;

-- ========== 3. PRODUCTS TABLE ==========
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    sub_category VARCHAR(100),
    sku VARCHAR(100) UNIQUE,
    image_url TEXT,
    stock_quantity INTEGER DEFAULT 0,
    specifications TEXT,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- ========== 4. CONTACT MESSAGES TABLE ==========
CREATE TABLE IF NOT EXISTS contact_messages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    subject VARCHAR(200),
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON contact_messages(status);

-- ========== 5. ORDERS TABLE (optional – for tracking inquiries as orders) ==========
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'inquiry',
    shipping_address TEXT,
    payment_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========== 6. ORDER ITEMS (optional – linked to orders) ==========
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10,2) DEFAULT 0
);

-- ========== 7. PASSWORD RESETS (future use) ==========
CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========== UPDATE TIMESTAMP FUNCTION ==========
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========== VERIFY ADMIN INSERT ==========
-- After running, check that admin user exists:
-- SELECT username, email, role FROM users WHERE username = 'gazcom_admin';