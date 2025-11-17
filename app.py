from flask import Flask, request, jsonify
import pymysql.cursors
from flask_bcrypt import Bcrypt
from flask_cors import CORS

# --- 1. CONFIGURACIÓN ---
app = Flask(__name__)
CORS(app) # Habilita CORS
bcrypt = Bcrypt(app)

# Configuración de la Base de Datos
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '', # Contraseña vacía de XAMPP/instalación por defecto
    'database': 'delivery_app',
    'cursorclass': pymysql.cursors.DictCursor # ¡IMPORTANTE! Devuelve resultados como diccionarios
}

def get_db_connection():
    """Función para crear una nueva conexión a la BD"""
    try:
        conn = pymysql.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"Error al conectar a la BD: {e}")
        return None

# --- 2. PUNTO DE REGISTRO (/register) ---
@app.route('/register', methods=['POST'])
def register_user():
    data = request.json
    
    # Hashear la contraseña
    password_hash = bcrypt.generate_password_hash(data['password']).decode('utf-8')
    
    conn = get_db_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'Error de conexión con la base de datos'}), 500

    try:
        with conn.cursor() as cursor:
            query = ("INSERT INTO users (cedula, telefono, nombre, apellido, email, fecha_nacimiento, password_hash, role) "
                     "VALUES (%s, %s, %s, %s, %s, %s, %s, 'cliente')")
            
            cursor.execute(query, (
                data['cedula'],
                data['telefono'],
                data['nombre'],
                data['apellido'],
                data['email'],
                data['nacimiento'],
                password_hash
            ))
        conn.commit()
        
        return jsonify({'success': True, 'message': 'Registro exitoso.'}), 201
        
    except Exception as e:
        print(e)
        return jsonify({'success': False, 'message': f'Error en el registro: {e}'}), 500
    finally:
        if conn:
            conn.close()

# --- 3. PUNTO DE LOGIN (/login) ---
@app.route('/login', methods=['POST'])
def login_user():
    data = request.json
    user_or_id = data['user']
    password = data['pass']

    conn = get_db_connection()
    if conn is None:
        return jsonify({'success': False, 'message': 'Error de conexión con la base de datos'}), 500

    try:
        with conn.cursor() as cursor:
            # Determinar si es cédula (cliente) o username (admin/motorizado)
            if user_or_id.isnumeric():
                query = "SELECT * FROM users WHERE cedula = %s"
            else:
                query = "SELECT * FROM users WHERE username = %s"
                
            cursor.execute(query, (user_or_id,))
            user = cursor.fetchone() # fetchone() ya devuelve un diccionario gracias a DictCursor

        # Verificar si el usuario existe Y si la contraseña coincide
        if user and bcrypt.check_password_hash(user['password_hash'], password):
            # ¡Login Exitoso!
            return jsonify({
                'success': True,
                'message': 'Login exitoso.',
                'role': user['role'],
                'name': f"{user['nombre']} {user['apellido']}"
            }), 200
        else:
            # Credenciales incorrectas
            return jsonify({'success': False, 'message': 'Usuario, cédula o contraseña incorrectos.'}), 401

    except Exception as e:
        print(e)
        return jsonify({'success': False, 'message': f'Error en el servidor: {e}'}), 500
    finally:
        if conn:
            conn.close()

# --- 4. EJECUTAR EL SERVIDOR DE API ---
if __name__ == '__main__':
    # El puerto 5000 es el estándar de Flask
    app.run(debug=True, port=5000)