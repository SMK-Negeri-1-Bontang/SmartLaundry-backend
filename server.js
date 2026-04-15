const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- AKSES FILE HTML ADMIN ---
app.use(express.static('public'));

// --- KONEKSI DATABASE ---
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'smartlaundry_db',
    password: '460808',    // Password Database Anda
    port: 5432,
});

// --- FITUR 1: REGISTER (PAKAI EMAIL) ---
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body; // Ganti phone -> email
    console.log(`[REGISTER] Mencoba mendaftar: ${name} - ${email}`);

    try {
        // Cek apakah Email sudah ada di database
        const checkUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (checkUser.rows.length > 0) {
            console.log("[REGISTER] Gagal: Email sudah terdaftar");
            return res.status(400).json({ message: 'Email sudah terdaftar' });
        }

        // SIMPAN USER BARU KE DATABASE
        const result = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
            [name, email, password] 
        );
        
        console.log("[REGISTER] SUKSES! User ID:", result.rows[0].id, "tersimpan di DB.");
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("[REGISTER] Error Database:", err);
        res.status(500).send('Server Error');
    }
});

// --- FITUR 2: LOGIN (PAKAI EMAIL) ---
app.post('/login', async (req, res) => {
    const { email, password } = req.body; // Ganti phone -> email
    console.log(`[LOGIN] Percobaan login: ${email}`);

    try {
        // Cari user di database berdasarkan Email dan Password
        const result = await pool.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
        
        if (result.rows.length > 0) {
            console.log("[LOGIN] SUKSES! User ditemukan di DB:", result.rows[0].name);
            res.json(result.rows[0]);
        } else {
            console.log("[LOGIN] Gagal: Data tidak cocok di database.");
            res.status(401).json({ message: 'Email atau Password salah' });
        }
    } catch (err) {
        console.error("[LOGIN] Error:", err);
        res.status(500).send('Server Error');
    }
});

// --- FITUR 3: DAFTAR LAYANAN ---
app.get('/services', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM services');
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// --- FITUR 4: BUAT ORDER (UPDATE DENGAN DATA DIRI & DURASI) ---
app.post('/orders', async (req, res) => {
    const { user_id, service_id, weight, address, notes, days } = req.body;
    console.log(`[ORDER] User ID: ${user_id} memesan untuk ${days} hari.`);

    try {
        // Ambil harga dasar layanan
        const serviceRes = await pool.query('SELECT price FROM services WHERE id = $1', [service_id]);
        const basePrice = parseFloat(serviceRes.rows[0].price);
        
        let totalPrice = 0;

        // LOGIKA HARGA BERDASARKAN DURASI
        if (days == 1) {
            // Cuci Kilat (1 Hari): Harga + 50%
            totalPrice = basePrice * weight * 1.5;
        } else {
            // Cuci Reguler (2 Hari): Harga Normal
            totalPrice = basePrice * weight;
        }

        // Simpan Order ke DB beserta Data Diri
        const orderRes = await pool.query(
            'INSERT INTO orders (user_id, service_id, weight, total_price, address, notes, days) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [user_id, service_id, weight, totalPrice, address, notes, days]
        );

        console.log("[ORDER] SUKSES! Order ID:", orderRes.rows[0].id, "disimpan.");
        res.status(201).json(orderRes.rows[0]);
    } catch (err) {
        console.error("[ORDER] Error:", err);
        res.status(500).send('Error creating order');
    }
});
// --- FITUR 5: LIHAT ORDER USER (USER) ---
app.get('/orders/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            'SELECT o.*, s.name as service_name FROM orders o JOIN services s ON o.service_id = s.id WHERE o.user_id = $1 ORDER BY o.created_at DESC',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Error fetching orders');
    }
});

// ================= FITUR ADMIN (WEB) =================

// --- FITUR 6: LIHAT SEMUA ORDER (ADMIN) ---
app.get('/admin/orders', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT o.*, u.name as user_name, s.name as service_name FROM orders o JOIN users u ON o.user_id = u.id JOIN services s ON o.service_id = s.id ORDER BY o.created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).send('Error fetching admin orders');
    }
});

// --- FITUR 7: UPDATE STATUS ORDER (ADMIN) ---
app.put('/admin/orders/:id', async (req, res) => {
    const { status } = req.body;
    const orderId = req.params.id;
    try {
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
        res.send('Status berhasil diupdate');
    } catch (err) {
        res.status(500).send('Error updating status');
    }
});

// --- FITUR 8: HITUNG PENDAPATAN (ADMIN) ---
app.get('/admin/income', async (req, res) => {
    try {
        const result = await pool.query('SELECT SUM(total_price) as total FROM orders WHERE status = $1', ['Done']);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).send('Error fetching income');
    }
});

// --- FITUR 9: HAPUS ORDER (USER & ADMIN) ---
app.delete('/orders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM orders WHERE id = $1', [id]);
        res.send('Order berhasil dihapus');
    } catch (err) {
        res.status(500).send('Error deleting order');
    }
});

// --- FITUR 9: HAPUS ORDER KHUSUS ADMIN ---
app.delete('/admin/orders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM orders WHERE id = $1', [id]);
        res.send('Order berhasil dihapus');
    } catch (err) {
        console.error("Error Delete:", err);
        res.status(500).send('Error deleting order');
    }
});

// --- JALANKAN SERVER ---
app.listen(3000, '0.0.0.0', () => {
    console.log('Server SmartLaundry siap di 0.0.0.0:3000');
});