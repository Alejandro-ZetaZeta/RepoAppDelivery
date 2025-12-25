const express = require('express');
const mysql = require('mysql2/promise'); // Versión promesa
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURACIÓN ROBUSTA DE BASE DE DATOS (POOL)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 4000,
    ssl: { "rejectUnauthorized": true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test de conexión
pool.getConnection()
    .then(conn => {
        console.log('¡Conectado a TiDB vía Pool!');
        conn.release();
    })
    .catch(err => console.error('Error BD:', err));

// --- RUTAS DE AUTH ---

app.post('/register', async (req, res) => {
    const { cedula, telefono, nombre, apellido, email, nacimiento, password } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const query = "INSERT INTO users (cedula, telefono, nombre, apellido, email, fecha_nacimiento, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?, 'cliente')";
        await pool.execute(query, [cedula, telefono, nombre, apellido, email, nacimiento, password_hash]);
        res.status(201).json({ success: true, message: 'Registro exitoso.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/login', async (req, res) => {
    const { user: userOrId, pass: password } = req.body;
    try {
        let query = /^\d+$/.test(userOrId) ? "SELECT * FROM users WHERE cedula = ?" : "SELECT * FROM users WHERE username = ?";
        const [results] = await pool.execute(query, [userOrId]);
        
        if (results.length === 0) return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            res.status(200).json({
                success: true,
                message: 'Login exitoso',
                role: user.role,
                name: `${user.nombre} ${user.apellido}`,
                userId: user.id
            });
        } else {
            res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error servidor' });
    }
});

app.get('/api/motorizados', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT id, nombre, apellido, estado FROM users WHERE role = 'motorizado'");
        res.status(200).json(results);
    } catch (err) { res.status(500).json({error: err.message}); }
});

// --- RUTAS DE SERVICIOS ---

app.post('/api/servicios', async (req, res) => {
    const { id_cliente, punto_a, punto_b } = req.body;
    try {
        await pool.execute("INSERT INTO servicios (id_cliente, punto_a, punto_b) VALUES (?, ?, ?)", [id_cliente, punto_a, punto_b]);
        res.status(201).json({ success: true, message: 'Solicitado' });
    } catch (err) { res.status(500).json({error: err.message}); }
});

app.get('/api/servicios/pendientes', async (req, res) => {
    try {
        const [servicios] = await pool.query(`
            SELECT s.id, s.punto_a, s.punto_b, u.nombre, u.apellido 
            FROM servicios s JOIN users u ON s.id_cliente = u.id
            WHERE s.estado_servicio = 'pendiente' ORDER BY s.created_at ASC
        `);
        res.status(200).json(servicios);
    } catch (err) { res.status(500).json({error: err.message}); }
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
        res.status(200).json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally { if (conn) conn.release(); }
});

app.get('/api/servicios/cliente/:id', async (req, res) => {
    try {
        const [servicios] = await pool.execute(`
            SELECT s.id, s.punto_a, s.punto_b, s.estado_servicio, u.nombre AS nombre_motorizado
            FROM servicios s LEFT JOIN users u ON s.id_motorizado = u.id
            WHERE s.id_cliente = ? ORDER BY s.created_at DESC
        `, [req.params.id]);
        res.status(200).json(servicios);
    } catch (err) { res.status(500).json({error: err.message}); }
});

app.get('/api/servicios/motorizado/:id', async (req, res) => {
    try {
        const [servicios] = await pool.execute(`
            SELECT s.id, s.punto_a, s.punto_b, s.estado_servicio, u.nombre, u.apellido
            FROM servicios s JOIN users u ON s.id_cliente = u.id
            WHERE s.id_motorizado = ? AND s.estado_servicio != 'entregado' LIMIT 1
        `, [req.params.id]);
        res.status(200).json(servicios.length ? servicios[0] : null);
    } catch (err) { res.status(500).json({error: err.message}); }
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
        res.status(200).json({ success: true });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally { if (conn) conn.release(); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`API lista en puerto ${PORT}`));