// --- 1. IMPORTAR LIBRERÍAS ---
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');

// --- 2. CONFIGURACIÓN ---
const app = express();
app.use(cors());
app.use(express.json());

// Configuración de la Base de Datos (en render)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT || 5000,
    ssl: { "rejectUnauthorized": true } 
}).promise(); // <-- .promise() para usar async/await más fácil

// (Quitamos db.connect, .promise() lo maneja diferente)
console.log('Intentando conectar a la BD...');
// Prueba de conexión inicial (opcional pero recomendado)
db.query('SELECT 1')
    .then(() => console.log('Conexión exitosa a la BD de MySQL.'))
    .catch(err => console.error('Error al conectar a la base de datos:', err));


// --- 3. PUNTO DE REGISTRO (/register) ---
app.post('/register', async (req, res) => {
    const { cedula, telefono, nombre, apellido, email, nacimiento, password } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const query = "INSERT INTO users (cedula, telefono, nombre, apellido, email, fecha_nacimiento, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?, 'cliente')";
        await db.query(query, [cedula, telefono, nombre, apellido, email, nacimiento, password_hash]);
        res.status(201).json({ success: true, message: 'Registro exitoso.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error en el registro: ${err.message}` });
    }
});

// --- 4. PUNTO DE LOGIN (/login) ---
app.post('/login', async (req, res) => {
    const { user: userOrId, pass: password } = req.body;
    try {
        let query = "";
        if (/^\d+$/.test(userOrId)) {
            query = "SELECT * FROM users WHERE cedula = ?";
        } else {
            query = "SELECT * FROM users WHERE username = ?";
        }

        const [results] = await db.query(query, [userOrId]);

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
                userId: user.id // <-- ¡IMPORTANTE! Devolvemos el ID
            });
        } else {
            res.status(401).json({ success: false, message: 'Usuario, cédula o contraseña incorrectos.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// --- 5. OBTENER MOTORIZADOS (Ruta antigua, la mantenemos por si acaso) ---
app.get('/api/motorizados', async (req, res) => {
    try {
        const query = "SELECT id, nombre, apellido, estado FROM users WHERE role = 'motorizado'";
        const [results] = await db.query(query);
        res.status(200).json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error al obtener motorizados.' });
    }
});


// ===================================================
// === INICIO DE NUEVAS RUTAS PARA CICLO DE SERVICIO ===
// ===================================================

// (CLIENTE) Crear una nueva solicitud de servicio
app.post('/api/servicios', async (req, res) => {
    const { id_cliente, punto_a, punto_b } = req.body;
    try {
        const query = "INSERT INTO servicios (id_cliente, punto_a, punto_b) VALUES (?, ?, ?)";
        await db.query(query, [id_cliente, punto_a, punto_b]);
        res.status(201).json({ success: true, message: 'Servicio solicitado exitosamente.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al crear servicio: ${err.message}` });
    }
});

// (ADMIN) Obtener todos los servicios PENDIENTES
app.get('/api/servicios/pendientes', async (req, res) => {
    try {
        // Unimos con la tabla 'users' para obtener el nombre del cliente
        const query = `
            SELECT s.id, s.punto_a, s.punto_b, u.nombre, u.apellido 
            FROM servicios s
            JOIN users u ON s.id_cliente = u.id
            WHERE s.estado_servicio = 'pendiente'
            ORDER BY s.created_at ASC
        `;
        const [servicios] = await db.query(query);
        res.status(200).json(servicios);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al obtener servicios: ${err.message}` });
    }
});

// (ADMIN) Asignar un motorizado a un servicio
app.post('/api/servicios/asignar', async (req, res) => {
    const { id_servicio, id_motorizado } = req.body;
    try {
        // 1. Asignar el servicio y ponerlo 'recogiendo'
        const queryServicio = "UPDATE servicios SET id_motorizado = ?, estado_servicio = 'recogiendo' WHERE id = ?";
        await db.query(queryServicio, [id_motorizado, id_servicio]);
        
        // 2. Poner al motorizado como 'ocupado'
        const queryMotorizado = "UPDATE users SET estado = 'ocupado' WHERE id = ?";
        await db.query(queryMotorizado, [id_motorizado]);
        
        res.status(200).json({ success: true, message: 'Servicio asignado correctamente.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al asignar: ${err.message}` });
    }
});

// (CLIENTE) Obtener el estado de SUS servicios
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
        const [servicios] = await db.query(query, [id]);
        res.status(200).json(servicios);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al obtener mis servicios: ${err.message}` });
    }
});

// (MOTORIZADO) Obtener el servicio ASIGNADO (activo)
app.get('/api/servicios/motorizado/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Buscamos el servicio activo (que no esté 'entregado')
        const query = `
            SELECT s.id, s.punto_a, s.punto_b, s.estado_servicio, u.nombre, u.apellido
            FROM servicios s
            JOIN users u ON s.id_cliente = u.id
            WHERE s.id_motorizado = ? AND s.estado_servicio != 'entregado'
            LIMIT 1
        `;
        const [servicios] = await db.query(query, [id]);
        res.status(200).json(servicios.length > 0 ? servicios[0] : null); // Devolvemos el servicio o null
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al obtener mi servicio: ${err.message}` });
    }
});

// (MOTORIZADO) Actualizar el estado de un servicio
app.post('/api/servicios/actualizar', async (req, res) => {
    const { id_servicio, id_motorizado, nuevo_estado } = req.body;
    
    // Validar que el estado sea uno de los permitidos
    if (!['recogiendo', 'en camino', 'entregado'].includes(nuevo_estado)) {
        return res.status(400).json({ success: false, message: 'Estado no válido.' });
    }
    
    try {
        // 1. Actualizar el estado del servicio
        const queryServicio = "UPDATE servicios SET estado_servicio = ? WHERE id = ?";
        await db.query(queryServicio, [nuevo_estado, id_servicio]);
        
        // 2. Si se entregó, liberar al motorizado
        if (nuevo_estado === 'entregado') {
            const queryMotorizado = "UPDATE users SET estado = 'disponible' WHERE id = ?";
            await db.query(queryMotorizado, [id_motorizado]);
        }
        
        res.status(200).json({ success: true, message: 'Estado actualizado.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: `Error al actualizar: ${err.message}` });
    }
});


// ===================================================
// === FIN DE NUEVAS RUTAS ===
// ===================================================


// --- 6. EJECUTAR EL SERVIDOR DE API ---
const PORT = process.env.PORT || 5000;
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/', (req, res) => res.status(200).send('<h1>API de Delivery App funcionando</h1>'));
app.listen(PORT, () => console.log(`Servidor API corriendo en el puerto ${PORT}`));