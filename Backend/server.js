require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// FORCE CORS for your frontend
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://gazcom-frontend.onrender.com');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// HEALTH CHECK
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

// CATEGORIES (public)
app.get('/api/categories', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, description, image_url FROM categories ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// PRODUCTS (public)
app.get('/api/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1`;
        const params = [];
        if (category) {
            params.push(category);
            query += ` AND p.category_id = $${params.length}`;
        }
        if (search) {
            params.push(`%${search}%`);
            query += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
        }
        query += ` ORDER BY p.created_at DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// FEATURED PRODUCTS
app.get('/api/products/featured', async (req, res) => {
    try {
        const result = await db.query(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_featured = true LIMIT 6`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SINGLE PRODUCT
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CONTACT FORM
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });
        await db.query(`INSERT INTO contact_messages (name, email, phone, subject, message, status) VALUES ($1,$2,$3,$4,$5,'pending')`, [name, email, phone, subject, message]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ADMIN LOGIN (simplified)
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await db.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PROTECTED ROUTES (add your other admin routes if needed, but start with this)

app.listen(PORT, () => {
    console.log(`✅ Backend running on port ${PORT}`);
    console.log(`✅ CORS allowed for https://gazcom-frontend.onrender.com`);
});