// --- 1. IMPORTAR LIBRERÍAS ---
const express = require('express');
// Usamos la versión 'promise' de mysql2 para poder usar async/await limpiamente
const mysql = require('mysql2/promise'); 
const bcrypt = require('bcryptjs');
const cors = require('cors');

// --- 2. CONFIGURACIÓN ---
const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE LA BASE DE DATOS (POOL) ---
// Usamos createPool en lugar de createConnection.
// Esto maneja automáticamente las reconexiones si TiDB cierra la conexión por inactividad.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 4000,
    ssl: { "rejectUnauthorized": true }, 
    waitForConnections: true,
    connectionLimit: 10, // Mantiene hasta 10 conexiones vivas
    queueLimit: 0
});

// Prueba de conexión inicial al arrancar (solo para loguear en consola)
pool.getConnection()
    .then(conn => {
        console.log('¡Conexión exitosa al Pool de TiDB!');
        conn.release(); // Importante: soltar la conexión de vuelta al pool
    })
    .catch(err => {
        console.error('Error fatal al conectar a la BD:', err);
    });

// ===================================================
// === RUTAS DE USUARIOS (AUTH) ===
// ===================================================

// --- REGISTRO ---
app.post('/register', async (req, res) => {
    const { cedula, telefono, nombre, apellido, email, nacimiento, password } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        
        const query = "INSERT INTO users (cedula, telefono, nombre, apellido, email, fecha_nacimiento, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?, 'cliente')";
        
        // Con pool, usamos execute o query directamente
        await pool.execute(query, [cedula, telefono, nombre, apellido, email, nacimiento, password_hash]);
        res.status(201).json({ success: true, message: 'Registro exitoso.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error en el registro: ${err.message}` });
    }
});

// --- LOGIN ---
app.post('/login', async (req, res) => {
    const { user: userOrId, pass: password } = req.body;
    try {
        let query = "";
        if (/^\d+$/.test(userOrId)) {
            query = "SELECT * FROM users WHERE cedula = ?";
        } else {
            query = "SELECT * FROM users WHERE username = ?";
        }

        const [results] = await pool.execute(query, [userOrId]);

        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario, cédula o contraseña incorrectos.' });
        }
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
            res.status(401).json({ success: false, message: 'Usuario, cédula o contraseña incorrectos.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// --- OBTENER MOTORIZADOS ---
app.get('/api/motorizados', async (req, res) => {
    try {
        const query = "SELECT id, nombre, apellido, estado FROM users WHERE role = 'motorizado'";
        const [results] = await pool.query(query);
        res.status(200).json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener motorizados.' });
    }
});

// ===================================================
// === RUTAS DEL CICLO DE SERVICIO ===
// ===================================================

// (CLIENTE) Crear solicitud
app.post('/api/servicios', async (req, res) => {
    const { id_cliente, punto_a, punto_b } = req.body;
    try {
        const query = "INSERT INTO servicios (id_cliente, punto_a, punto_b) VALUES (?, ?, ?)";
        await pool.execute(query, [id_cliente, punto_a, punto_b]);
        res.status(201).json({ success: true, message: 'Servicio solicitado exitosamente.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al crear servicio: ${err.message}` });
    }
});

// (ADMIN) Ver pendientes
app.get('/api/servicios/pendientes', async (req, res) => {
    try {
        const query = `
            SELECT s.id, s.punto_a, s.punto_b, u.nombre, u.apellido 
            FROM servicios s
            JOIN users u ON s.id_cliente = u.id
            WHERE s.estado_servicio = 'pendiente'
            ORDER BY s.created_at ASC
        `;
        const [servicios] = await pool.query(query);
        res.status(200).json(servicios);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al obtener servicios: ${err.message}` });
    }
});

// (ADMIN) Asignar servicio (CON TRANSACCIÓN PARA SEGURIDAD DE DATOS)
app.post('/api/servicios/asignar', async (req, res) => {
    const { id_servicio, id_motorizado } = req.body;
    let connection;
    try {
        // Obtenemos una conexión exclusiva para la transacción
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Asignar servicio
        await connection.execute(
            "UPDATE servicios SET id_motorizado = ?, estado_servicio = 'recogiendo' WHERE id = ?", 
            [id_motorizado, id_servicio]
        );
        
        // 2. Ocupar motorizado
        await connection.execute(
            "UPDATE users SET estado = 'ocupado' WHERE id = ?", 
            [id_motorizado]
        );
        
        await connection.commit(); // Guardar cambios
        res.status(200).json({ success: true, message: 'Servicio asignado correctamente.' });

    } catch (err) {
        if (connection) await connection.rollback(); // Deshacer si falla
        console.error(err);
        res.status(500).json({ success: false, message: `Error al asignar: ${err.message}` });
    } finally {
        if (connection) connection.release(); // Liberar conexión
    }
});

// (CLIENTE) Ver mis servicios
app.get('/api/servicios/cliente/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT s.id, s.punto_a, s.punto_b, s.estado_servicio, u.nombre AS nombre_motorizado
            FROM servicios s
            LEFT JOIN users u ON s.id_motorizado = u.id
            WHERE s.id_cliente = ?
            ORDER BY s.created_at DESC
        `;
        const [servicios] = await pool.execute(query, [id]);
        res.status(200).json(servicios);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al obtener mis servicios: ${err.message}` });
    }
});

// (MOTORIZADO) Ver servicio activo
app.get('/api/servicios/motorizado/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT s.id, s.punto_a, s.punto_b, s.estado_servicio, u.nombre, u.apellido
            FROM servicios s
            JOIN users u ON s.id_cliente = u.id
            WHERE s.id_motorizado = ? AND s.estado_servicio != 'entregado'
            LIMIT 1
        `;
        const [servicios] = await pool.execute(query, [id]);
        res.status(200).json(servicios.length > 0 ? servicios[0] : null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al obtener mi servicio: ${err.message}` });
    }
});

// (MOTORIZADO) Actualizar estado (CON TRANSACCIÓN)
app.post('/api/servicios/actualizar', async (req, res) => {
    const { id_servicio, id_motorizado, nuevo_estado } = req.body;
    
    if (!['recogiendo', 'en camino', 'entregado'].includes(nuevo_estado)) {
        return res.status(400).json({ success: false, message: 'Estado no válido.' });
    }
    
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.execute(
            "UPDATE servicios SET estado_servicio = ? WHERE id = ?", 
            [nuevo_estado, id_servicio]
        );
        
        if (nuevo_estado === 'entregado') {
            await connection.execute(
                "UPDATE users SET estado = 'disponible' WHERE id = ?", 
                [id_motorizado]
            );
        }
        
        await connection.commit();
        res.status(200).json({ success: true, message: 'Estado actualizado.' });

    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: `Error al actualizar: ${err.message}` });
    } finally {
        if (connection) connection.release();
    }
});

// --- ARRANQUE DEL SERVIDOR ---
const PORT = process.env.PORT || 5000;
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.listen(PORT, () => {
    console.log(`Servidor API corriendo en puerto ${PORT}`);
});