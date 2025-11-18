// js/main.js

// Define la URL de tu API de Flask
const API_URL = 'https://repoappdelivery.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    // Lógica para el formulario de Login (en index.html)
    const loginForm = document.getElementById('loginForm');
    const loginUserOrId = document.getElementById('loginUserOrId');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => { // 'async' para usar 'await'
            e.preventDefault();
            loginError.classList.add('hidden');

            const userOrId = loginUserOrId.value;
            const password = loginPassword.value;

            // --- INICIO DE LA LÓGICA REAL (FETCH A LA API DE FLASK) ---
            
            try {
                // Llama a la ruta /login de tu API
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user: userOrId,
                        pass: password 
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // Login exitoso
                    let redirectUrl = '';
                    
                    // Almacenar el nombre de usuario para mostrar en el dashboard
                    localStorage.setItem('userName', data.name);
                    localStorage.setItem('userId', data.userId);
                    
                    if (data.role === 'admin') {
                        redirectUrl = 'admin.html';
                    } else if (data.role === 'motorizado') {
                        redirectUrl = 'driver.html';
                    } else {
                        redirectUrl = 'client.html';
                    }
                    
                    window.location.href = redirectUrl;

                } else {
                    // Error de login (enviado desde Flask)
                    loginError.textContent = data.message;
                    loginError.classList.remove('hidden');
                }

            } catch (error) {
                console.error('Error en fetch:', error);
                loginError.textContent = 'Error de conexión con el servidor API.';
                loginError.classList.remove('hidden');
            }
            // --- FIN DE LA LÓGICA REAL ---
        });
    }

    // Lógica para el formulario de Registro (en register.html)
    const registerForm = document.getElementById('registerForm');
    const registerError = document.getElementById('registerError');

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => { // 'async'
            e.preventDefault();
            registerError.classList.add('hidden');

            const regData = {
                cedula: document.getElementById('regCedula').value,
                telefono: document.getElementById('regTelefono').value,
                nombre: document.getElementById('regNombre').value,
                apellido: document.getElementById('regApellido').value,
                email: document.getElementById('regEmail').value,
                nacimiento: document.getElementById('regNacimiento').value,
                password: document.getElementById('regPassword').value,
            };

            // --- INICIO DE LA LÓGICA REAL (FETCH A LA API DE FLASK) ---
            try {
                // Llama a la ruta /register de tu API
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(regData)
                });

                const data = await response.json();

                if (data.success) {
                    // Registro exitoso
                    if (typeof showModal === 'function') {
                        showModal('¡Registro Exitoso!', data.message + '\nAhora puedes iniciar sesión.');
                    } else {
                        alert(data.message + '\nAhora puedes iniciar sesión.');
                    }
                    
                    // Esperar a que el usuario cierre el modal antes de redirigir
                    setTimeout(() => {
                        window.location.href = 'index.html'; 
                    }, 2000);

                } else {
                    // Error de registro (enviado desde Flask)
                    registerError.textContent = data.message;
                    registerError.classList.remove('hidden');
                }

            } catch (error) {
                console.error('Error en fetch:', error);
                registerError.textContent = 'Error de conexión con el servidor API.';
                registerError.classList.remove('hidden');
            }
            // --- FIN DE LA LÓGICA REAL ---
        });
    }
});