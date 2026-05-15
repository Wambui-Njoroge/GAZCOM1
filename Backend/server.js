// ========== GAZCOM BACKEND - EXPRESS SERVER ==========
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const nodemailer = require('nodemailer');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// ========== CORS CONFIGURATION (FIXED) ==========
// Define allowed origins (your frontend URLs)
const allowedOrigins = [
    'https://gazcom-frontend.onrender.com',
    'http://localhost:5500',   // VS Code Live Server
    'http://127.0.0.1:5500',
    'http://localhost:3000',   // common dev ports
    'http://localhost:8080'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests explicitly
app.options('*', cors());

// ========== OTHER MIDDLEWARE ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== CLOUDINARY CONFIG ==========
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer storage for Cloudinary (product images)
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'gazcom/products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, height: 600, crop: 'limit' }]
    }
});
const upload = multer({ storage: storage });

// ========== JWT AUTH MIDDLEWARE ==========
function authenticateAdmin(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

// ========== EMAIL TRANSPORTER (for contact form) ==========
const transporter = process.env.EMAIL_USER && process.env.EMAIL_PASS ? nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
}) : null;

// ========== HELPER: Send Email ==========
async function sendEmail(to, subject, html) {
    if (!transporter) {
        console.log('Email not configured. Skipping email send.');
        return false;
    }
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: to,
            subject: subject,
            html: html
        });
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
}

// ========== PUBLIC ROUTES ==========

// Get all categories (for carousel & shop filter)
app.get('/api/categories', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, name, description, image_url, display_order FROM categories ORDER BY display_order NULLS LAST, id ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get all products (with optional category filter & search)
app.get('/api/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = `
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        `;
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
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get featured products (is_featured = true)
app.get('/api/products/featured', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT p.*, c.name as category_name 
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.is_featured = true 
             ORDER BY p.created_at DESC LIMIT 6`
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch featured products' });
    }
});

// Get single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            `SELECT p.*, c.name as category_name 
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = $1`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

// Submit contact message (public)
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message are required' });
        }
        
        // Save to database
        const result = await db.query(
            `INSERT INTO contact_messages (name, email, phone, subject, message, status, created_at)
             VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
             RETURNING id`,
            [name, email, phone || null, subject || 'General Inquiry', message]
        );
        
        // Send email notification to admin
        const adminHtml = `
            <h2>New Contact Message</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
            <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
            <p><strong>Message:</strong><br>${message.replace(/\n/g, '<br>')}</p>
        `;
        await sendEmail(process.env.EMAIL_USER, 'New Contact Message - GAZCOM', adminHtml);
        
        // Auto-reply to customer
        const customerHtml = `
            <h2>Thank you for contacting GAZCOM</h2>
            <p>Dear ${name},</p>
            <p>We have received your message and will get back to you within 24 hours.</p>
            <p><strong>Your message:</strong><br>${message.replace(/\n/g, '<br>')}</p>
            <p>Best regards,<br>GAZCOM General Merchants<br>+254 724 515 819</p>
        `;
        await sendEmail(email, 'We received your message - GAZCOM', customerHtml);
        
        res.status(201).json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// ========== ADMIN AUTH ROUTES ==========

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const result = await db.query(
            'SELECT id, username, email, password_hash, role FROM users WHERE username = $1 LIMIT 1',
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        res.json({ 
            token, 
            user: { id: user.id, username: user.username, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Verify token (for admin panel)
app.get('/api/admin/verify', authenticateAdmin, (req, res) => {
    res.json({ valid: true, admin: req.admin });
});

// ========== PROTECTED ADMIN ROUTES (require authentication) ==========

// ---- DASHBOARD STATS ----
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const productsCount = await db.query('SELECT COUNT(*) FROM products');
        const categoriesCount = await db.query('SELECT COUNT(*) FROM categories');
        const messagesCount = await db.query('SELECT COUNT(*) FROM contact_messages WHERE status = $1', ['pending']);
        res.json({
            totalProducts: parseInt(productsCount.rows[0].count),
            totalCategories: parseInt(categoriesCount.rows[0].count),
            pendingMessages: parseInt(messagesCount.rows[0].count)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ---- CATEGORY CRUD ----
app.get('/api/admin/categories', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM categories ORDER BY display_order, id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

app.post('/api/admin/categories', authenticateAdmin, async (req, res) => {
    try {
        const { name, description, image_url, display_order } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const result = await db.query(
            `INSERT INTO categories (name, description, image_url, display_order)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, description, image_url || null, display_order || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

app.put('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, image_url, display_order } = req.body;
        const result = await db.query(
            `UPDATE categories SET name=$1, description=$2, image_url=$3, display_order=$4, updated_at=NOW()
             WHERE id=$5 RETURNING *`,
            [name, description, image_url, display_order || 0, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Category not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update category' });
    }
});

app.delete('/api/admin/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM categories WHERE id=$1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// ---- PRODUCT CRUD ----
app.get('/api/admin/products', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

app.post('/api/admin/products', authenticateAdmin, async (req, res) => {
    try {
        const { name, description, category_id, sku, image_url, stock_quantity, specifications, is_featured } = req.body;
        if (!name || !category_id) return res.status(400).json({ error: 'Name and category required' });
        const result = await db.query(
            `INSERT INTO products (name, description, category_id, sku, image_url, stock_quantity, specifications, is_featured, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING *`,
            [name, description, category_id, sku, image_url, stock_quantity || 0, specifications, is_featured || false]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

app.put('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, category_id, sku, image_url, stock_quantity, specifications, is_featured } = req.body;
        const result = await db.query(
            `UPDATE products SET name=$1, description=$2, category_id=$3, sku=$4, image_url=$5, stock_quantity=$6, specifications=$7, is_featured=$8, updated_at=NOW()
             WHERE id=$9 RETURNING *`,
            [name, description, category_id, sku, image_url, stock_quantity, specifications, is_featured, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});

app.delete('/api/admin/products/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM products WHERE id=$1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ---- CLOUDINARY UPLOAD ----
app.post('/api/admin/upload', authenticateAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        res.json({ imageUrl: req.file.path });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ---- CONTACT MESSAGES (for admin panel) ----
app.get('/api/admin/messages', authenticateAdmin, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

app.put('/api/admin/messages/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await db.query('UPDATE contact_messages SET status=$1 WHERE id=$2', [status, id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// ========== HEALTH CHECK (optional) ==========
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`🚀 GAZCOM Backend running on port ${PORT}`);
    console.log(`📍 API available at http://localhost:${PORT}/api`);
    console.log(`✅ CORS enabled for: ${allowedOrigins.join(', ')}`);
});