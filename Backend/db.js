// ========== DATABASE CONNECTION (NEON PostgreSQL) ==========
const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool for Neon (requires SSL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false  // Required for Neon/Supabase
    },
    // Force IPv4 to avoid connection issues on some hosts
    family: 4
});

// Test connection on startup
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    } else {
        console.log('✅ Connected to PostgreSQL (Neon)');
        release();
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};