// --- 1. IMPORTAR LIBRERÍAS ---
const express = require('express');
const mysql = require('mysql2/promise'); 
const bcrypt = require('bcryptjs');
const cors = require('cors');

// --- 2. CONFIGURACIÓN ---
const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE LA BASE DE DATOS (POOL) ---
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

// Prueba de conexión
pool.getConnection()
    .then(conn => {
        console.log('✅ Conexión exitosa a TiDB Cloud!');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Error fatal al conectar a la BD:', err);
    });

// ===================================================
// === RUTAS DE AUTENTICACIÓN ===
// ===================================================

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
        res.status(500).json({ success: false, message: `Error: ${err.message}` });
    }
});

app.post('/login', async (req, res) => {
    const { user: userOrId, pass: password } = req.body;
    try {
        let query = "";
        if (/^\d+$/.test(userOrId)) {
            query = "SELECT * FROM users WHERE cedula = ?";
        } else {
            query = "SELECT * FROM users WHERE username = ? OR email = ?";
        }

        const [results] = await pool.execute(query, [userOrId, userOrId]);

        if (results.length === 0) return res.status(401).json({ success: false, message: 'Usuario incorrecto.' });
        
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            res.status(200).json({
                success: true,
                message: 'Login exitoso.',
                role: user.role,
                name: `${user.nombre} ${user.apellido}`,
                userId: user.id
            });
        } else {
            res.status(401).json({ success: false, message: 'Contraseña incorrecta.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error interno.' });
    }
});

// ===================================================
// === GESTIÓN DE USUARIOS (ADMIN) ===
// ===================================================

// Crear Usuario
app.post('/api/usuarios', async (req, res) => {
    const { nombre, apellido, cedula, telefono, fecha_nacimiento, correo, contrasena, rol, estado } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(contrasena, salt);
        const username = correo;

        const query = `
            INSERT INTO users 
            (nombre, apellido, cedula, telefono, fecha_nacimiento, email, password_hash, role, estado, username) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await pool.execute(query, [nombre, apellido, cedula, telefono, fecha_nacimiento, correo, password_hash, rol, estado, username]);
        res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'El usuario ya existe.' });
        res.status(500).json({ success: false, message: `Error: ${err.message}` });
    }
});

// ACTUALIZAR USUARIO (Solo Correo/Username como pediste)
app.put('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { correo, password } = req.body; // Solo permitimos editar esto
    
    try {
        let query = "UPDATE users SET email = ?, username = ? WHERE id = ?";
        let params = [correo, correo, id];

        // Si mandan contraseña, también la actualizamos
        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);
            query = "UPDATE users SET email = ?, username = ?, password_hash = ? WHERE id = ?";
            params = [correo, correo, password_hash, id];
        }

        await pool.execute(query, params);
        res.status(200).json({ success: true, message: 'Datos actualizados.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ELIMINAR USUARIO (Nueva función)
app.delete('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.execute("DELETE FROM users WHERE id = ?", [id]);
        res.status(200).json({ success: true, message: 'Usuario eliminado permanentemente.' });
    } catch (err) {
        res.status(500).json({ success: false, message: `No se pudo eliminar (puede tener pedidos asociados). Error: ${err.message}` });
    }
});

app.get('/api/clientes', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT id, nombre, apellido, cedula, telefono, email as correo FROM users WHERE role = 'cliente'");
        res.status(200).json(results);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/motorizados', async (req, res) => {
    try {
        const [results] = await pool.query("SELECT id, nombre, apellido, cedula, telefono, email as correo, fecha_nacimiento, estado FROM users WHERE role = 'motorizado'");
        res.status(200).json(results);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ===================================================
// === GESTIÓN DE AVISOS (NUEVO) ===
// ===================================================

// Publicar Aviso
app.post('/api/avisos', async (req, res) => {
    const { titulo, mensaje, fecha_programada, activo } = req.body;
    try {
        // Si no mandan fecha, usamos NOW()
        const fecha = fecha_programada ? fecha_programada : new Date();
        const query = "INSERT INTO avisos (titulo, mensaje, fecha_programada, activo) VALUES (?, ?, ?, ?)";
        await pool.execute(query, [titulo, mensaje, fecha, activo]);
        res.status(201).json({ success: true, message: 'Aviso publicado.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Obtener Aviso Activo (Para Clientes)
// Devuelve el aviso más reciente que esté activo y cuya fecha ya haya pasado (o sea ahora)
app.get('/api/avisos/activo', async (req, res) => {
    try {
        const query = `
            SELECT * FROM avisos 
            WHERE activo = TRUE AND fecha_programada <= NOW() 
            ORDER BY fecha_programada DESC, id DESC LIMIT 1
        `;
        const [results] = await pool.query(query);
        res.status(200).json(results.length > 0 ? results[0] : null);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===================================================
// === RUTAS DEL CICLO DE SERVICIO ===
// ===================================================

app.post('/api/servicios', async (req, res) => {
    const { id_cliente, punto_a, punto_b } = req.body;
    try {
        await pool.execute("INSERT INTO servicios (id_cliente, punto_a, punto_b) VALUES (?, ?, ?)", [id_cliente, punto_a, punto_b]);
        res.status(201).json({ success: true, message: 'Solicitud creada.' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/servicios/pendientes', async (req, res) => {
    try {
        const [servicios] = await pool.query(`
            SELECT s.id, s.punto_a, s.punto_b, u.nombre, u.apellido 
            FROM servicios s JOIN users u ON s.id_cliente = u.id
            WHERE s.estado_servicio = 'pendiente' ORDER BY s.created_at ASC
        `);
        res.status(200).json(servicios);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
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
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/servicios/motorizado/:id', async (req, res) => {
    try {
        const [servicios] = await pool.execute(`
            SELECT s.id, s.punto_a, s.punto_b, s.estado_servicio, u.nombre, u.apellido
            FROM servicios s JOIN users u ON s.id_cliente = u.id
            WHERE s.id_motorizado = ? AND s.estado_servicio != 'entregado' LIMIT 1
        `, [req.params.id]);
        res.status(200).json(servicios.length > 0 ? servicios[0] : null);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
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
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', server: 'Ubuntu' }));
app.listen(PORT, () => {
    console.log(`🚀 Servidor API corriendo en el puerto ${PORT}`);
});