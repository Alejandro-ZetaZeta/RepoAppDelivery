// --- 1. IMPORTAR LIBRERÍAS ---
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');

// --- 2. CONFIGURACIÓN ---
const app = express();
app.use(cors()); // Habilita CORS para todas las rutas
app.use(express.json()); // Permite al servidor entender JSON

// Configuración de la Base de Datos
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '12345', // Contraseña vacía de XAMPP/instalación por defecto
    database: 'delivery_app'
});

db.connect(err => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err);
        return;
    }
    console.log('Conexión exitosa a la BD de MySQL.');
});

// --- 3. PUNTO DE REGISTRO (/register) ---
app.post('/register', async (req, res) => {
    const { cedula, telefono, nombre, apellido, email, nacimiento, password } = req.body;

    try {
        // Hashear la contraseña
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        
        const query = "INSERT INTO users (cedula, telefono, nombre, apellido, email, fecha_nacimiento, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?, 'cliente')";
        
        db.query(query, [cedula, telefono, nombre, apellido, email, nacimiento, password_hash], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: `Error en el registro: ${err.message}` });
            }
            res.status(201).json({ success: true, message: 'Registro exitoso.' });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// --- 4. PUNTO DE LOGIN (/login) ---
app.post('/login', (req, res) => {
    const { user: userOrId, pass: password } = req.body;

    let query = "";
    // Determinar si es cédula (cliente) o username (admin/motorizado)
    if (/^\d+$/.test(userOrId)) { // /^\d+$/ es una expresión regular para ver si es solo números
        query = "SELECT * FROM users WHERE cedula = ?";
    } else {
        query = "SELECT * FROM users WHERE username = ?";
    }

    db.query(query, [userOrId], async (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Error en el servidor.' });
        }

        // 1. ¿Existe el usuario?
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: 'Usuario, cédula o contraseña incorrectos.' });
        }

        const user = results[0];

        // 2. ¿Coincide la contraseña?
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (isMatch) {
            // ¡Login Exitoso!
            res.status(200).json({
                success: true,
                message: 'Login exitoso.',
                role: user.role,
                name: `${user.nombre} ${user.apellido}`
            });
        } else {
            // Contraseña incorrecta
            res.status(401).json({ success: false, message: 'Usuario, cédula o contraseña incorrectos.' });
        }
    });
});

// --- 5. NUEVA RUTA: OBTENER MOTORIZADOS ---
app.get('/api/motorizados', (req, res) => {
    
    // Consultamos solo los motorizados y los campos que necesitamos
    const query = "SELECT nombre, apellido, estado FROM users WHERE role = 'motorizado'";
    
    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Error al obtener motorizados.' });
        }
        
        // Enviamos la lista de motorizados como respuesta
        res.status(200).json(results);
    });
});
// --- FIN DE NUEVA RUTA ---


// --- 6. EJECUTAR EL SERVIDOR DE API ---
const PORT = 5000; // El mismo puerto que usamos con Flask
app.listen(PORT, () => {
    console.log(`Servidor API corriendo en http://localhost:${PORT}`);
});