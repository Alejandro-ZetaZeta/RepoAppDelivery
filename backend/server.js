const express = require('express');
const mysql = require('mysql2/promise'); 
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURACIÓN BASE DE DATOS
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 4000,
    ssl: { "rejectUnauthorized": true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test Conexión
pool.getConnection()
    .then(conn => { console.log('✅ BD Conectada'); conn.release(); })
    .catch(err => console.error('❌ Error BD:', err));

// --- AUTH ---
app.post('/register', async (req, res) => {
    const { cedula, telefono, nombre, apellido, email, nacimiento, password } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        await pool.execute("INSERT INTO users (cedula, telefono, nombre, apellido, email, fecha_nacimiento, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?, 'cliente')", [cedula, telefono, nombre, apellido, email, nacimiento, password_hash]);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/login', async (req, res) => {
    const { user: u, pass: p } = req.body;
    try {
        const q = /^\d+$/.test(u) ? "SELECT * FROM users WHERE cedula = ?" : "SELECT * FROM users WHERE username = ? OR email = ?";
        const [rows] = await pool.execute(q, [u, u]);
        if (rows.length === 0) return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
        const match = await bcrypt.compare(p, rows[0].password_hash);
        if (match) res.json({ success: true, role: rows[0].role, name: `${rows[0].nombre} ${rows[0].apellido}`, userId: rows[0].id });
        else res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- ADMIN USUARIOS ---
app.post('/api/usuarios', async (req, res) => {
    const { nombre, apellido, cedula, telefono, fecha_nacimiento, correo, contrasena, rol, estado } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(contrasena, salt);
        await pool.execute(
            "INSERT INTO users (nombre, apellido, cedula, telefono, fecha_nacimiento, email, password_hash, role, estado, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [nombre, apellido, cedula, telefono, fecha_nacimiento, correo, hash, rol, estado, correo]
        );
        res.status(201).json({ success: true });
    } catch (err) { 
        if(err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Usuario duplicado' });
        res.status(500).json({ success: false, message: err.message }); 
    }
});

app.put('/api/usuarios/:id', async (req, res) => {
    const { correo, password } = req.body;
    try {
        let q = "UPDATE users SET email = ?, username = ? WHERE id = ?";
        let p = [correo, correo, req.params.id];
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            q = "UPDATE users SET email = ?, username = ?, password_hash = ? WHERE id = ?";
            p = [correo, correo, hash, req.params.id];
        }
        await pool.execute(q, p);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        await pool.execute("DELETE FROM users WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/clientes', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, nombre, apellido, cedula, telefono, email as correo FROM users WHERE role = 'cliente'");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/motorizados', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, nombre, apellido, cedula, telefono, email as correo, fecha_nacimiento, estado FROM users WHERE role = 'motorizado'");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- AVISOS (NUEVO) ---
app.post('/api/avisos', async (req, res) => {
    const { titulo, mensaje, fecha_programada, activo } = req.body;
    try {
        const fecha = fecha_programada || new Date();
        await pool.execute("INSERT INTO avisos (titulo, mensaje, fecha_programada, activo) VALUES (?, ?, ?, ?)", [titulo, mensaje, fecha, activo]);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/avisos/activo', async (req, res) => {
    try {
        // Asegúrate de que la tabla 'avisos' exista en tu DB
        const [rows] = await pool.query("SELECT * FROM avisos WHERE activo = TRUE AND fecha_programada <= NOW() ORDER BY fecha_programada DESC LIMIT 1");
        res.json(rows.length ? rows[0] : null);
    } catch (err) { 
        // Si la tabla no existe, devolvemos null en vez de error 500 para no romper el frontend
        console.error("Error avisos:", err.message);
        res.json(null); 
    }
});

// --- SERVICIOS ---
app.post('/api/servicios', async (req, res) => {
    try {
        await pool.execute("INSERT INTO servicios (id_cliente, punto_a, punto_b) VALUES (?, ?, ?)", [req.body.id_cliente, req.body.punto_a, req.body.punto_b]);
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/servicios/pendientes', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT s.id, s.punto_a, s.punto_b, u.nombre, u.apellido FROM servicios s JOIN users u ON s.id_cliente = u.id WHERE s.estado_servicio = 'pendiente' ORDER BY s.created_at ASC");
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/servicios/asignar', async (req, res) => {
    const { id_servicio, id_motorizado } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();
        await conn.execute("UPDATE servicios SET id_motorizado = ?, estado_servicio = 'recogiendo' WHERE id = ?", [id_motorizado, id_servicio]);
        await conn.execute("UPDATE users SET estado = 'ocupado' WHERE id = ?", [id_motorizado]);
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally { if (conn) conn.release(); }
});

app.get('/api/servicios/cliente/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT s.id, s.punto_a, s.punto_b, s.estado_servicio, u.nombre AS nombre_motorizado FROM servicios s LEFT JOIN users u ON s.id_motorizado = u.id WHERE s.id_cliente = ? ORDER BY s.created_at DESC", [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/servicios/motorizado/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT s.id, s.punto_a, s.punto_b, s.estado_servicio, u.nombre, u.apellido FROM servicios s JOIN users u ON s.id_cliente = u.id WHERE s.id_motorizado = ? AND s.estado_servicio != 'entregado' LIMIT 1", [req.params.id]);
        res.json(rows.length ? rows[0] : null);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/servicios/actualizar', async (req, res) => {
    const { id_servicio, id_motorizado, nuevo_estado } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();
        await conn.execute("UPDATE servicios SET estado_servicio = ? WHERE id = ?", [nuevo_estado, id_servicio]);
        if (nuevo_estado === 'entregado') {
            await conn.execute("UPDATE users SET estado = 'disponible' WHERE id = ?", [id_motorizado]);
        }
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally { if (conn) conn.release(); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 API en puerto ${PORT}`));