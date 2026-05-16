// ========== GAZCOM BACKEND – COMPLETE (with all admin routes) ==========
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const nodemailer = require('nodemailer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- CORS (allow your frontend) ----------
const allowedOrigins = [
    'https://gazcom-frontend.onrender.com',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- Cloudinary ----------
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'gazcom/products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, height: 600, crop: 'limit' }]
    }
});
const upload = multer({ storage: storage });

// ---------- JWT Auth Middleware ----------
function authenticateAdmin(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
}

// ---------- Email (optional) ----------
const transporter = process.env.EMAIL_USER && process.env.EMAIL_PASS ? nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
}) : null;

async function sendEmail(to, subject, html) {
    if (!transporter) return false;
    try {
        await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
        return true;
    } catch (err) { return false; }
}

// ========== PUBLIC ROUTES ==========
app.get('/api/categories', async (req, res) => {
    try {
        const result = await db.query('SELECT id, name, description, image_url FROM categories ORDER BY display_order NULLS LAST, id');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = `SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1`;
        const params = [];
        if (category) { params.push(category); query += ` AND p.category_id = $${params.length}`; }
        if (search) { params.push(`%${search}%`); query += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`; }
        query += ` ORDER BY p.created_at DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/featured', async (req, res) => {
    try {
        const result = await db.query(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_featured = true LIMIT 6`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        if (!name || !email || !message) return res.status(400).json({ error: 'Missing fields' });
        await db.query(`INSERT INTO contact_messages (name, email, phone, subject, message, status) VALUES ($1,$2,$3,$4,$5,'pending')`, [name, email, phone, subject, message]);
        const adminHtml = `<h2>New Message</h2><p>From: ${name} (${email})</p><p>${message}</p>`;
        await sendEmail(process.env.EMAIL_USER, 'New Contact Message', adminHtml);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== ADMIN AUTH ==========
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await db.query('SELECT id, username, password_hash, role FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== PROTECTED ADMIN ROUTES ==========
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const products = await db.query('SELECT COUNT(*) FROM products');
        const categories = await db.query('SELECT COUNT(*) FROM categories');
        const messages = await db.query('SELECT COUNT(*) FROM contact_messages WHERE status = $1', ['pending']);
        res.json({
            totalProducts: parseInt(products.rows[0].count),
            totalCategories: parseInt(categories.rows[0].count),
            pendingMessages: parseInt(messages.rows[0].count)
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/products', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query(`SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/products', authenticateAdmin, async (req, res) => {
    try {
        const { name, description, category_id, sku, image_url, stock_quantity, specifications, is_featured } = req.body;
        if (!name || !category_id) return res.status(400).json({ error: 'Name and category required' });
        const result = await db.query(`INSERT INTO products (name, description, category_id, sku, image_url, stock_quantity, specifications, is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [name, description, category_id, sku, image_url, stock_quantity || 0, specifications, is_featured || false]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category_id, sku, image_url, stock_quantity, specifications, is_featured } = req.body;
        const result = await db.query(`UPDATE products SET name=$1, description=$2, category_id=$3, sku=$4, image_url=$5, stock_quantity=$6, specifications=$7, is_featured=$8, updated_at=NOW() WHERE id=$9 RETURNING *`, [name, description, category_id, sku, image_url, stock_quantity, specifications, is_featured, id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM products WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/categories', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM categories ORDER BY display_order, id');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/categories', authenticateAdmin, async (req, res) => {
    try {
        const { name, description, image_url, display_order } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const result = await db.query(`INSERT INTO categories (name, description, image_url, display_order) VALUES ($1,$2,$3,$4) RETURNING *`, [name, description, image_url, display_order || 0]);
        res.status(201).json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, image_url, display_order } = req.body;
        const result = await db.query(`UPDATE categories SET name=$1, description=$2, image_url=$3, display_order=$4, updated_at=NOW() WHERE id=$5 RETURNING *`, [name, description, image_url, display_order || 0, id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/messages', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/upload', authenticateAdmin, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ imageUrl: req.file.path });
});

// ---------- Health check ----------
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

app.listen(PORT, () => {
    console.log(` Backend running on port ${PORT}`);
    console.log(`CORS allowed for ${allowedOrigins.join(', ')}`);
});