// js/main.js

const API_URL = 'https://tugless-eryn-forlornly.ngrok-free.dev';

console.log("Conectando a API:", API_URL);

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

            // --- INICIO DE LA LÓGICA REAL (FETCH A LA API) ---
            
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
                    
                    // --- SEGURIDAD: Guardamos TODA la identidad ---
                    localStorage.setItem('userName', data.name);
                    localStorage.setItem('userId', data.userId);
                    localStorage.setItem('userRole', data.role); 
                    
                    if (data.role === 'admin') {
                        redirectUrl = 'admin.html';
                    } else if (data.role === 'motorizado') {
                        redirectUrl = 'driver.html';
                    } else {
                        redirectUrl = 'client.html';
                    }
                    
                    window.location.href = redirectUrl;

                } else {
                    // Error de login
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

            // --- INICIO DE LA LÓGICA REAL (FETCH A LA API) ---
            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(regData)
                });

                const data = await response.json();

                if (data.success) {
                    if (typeof showModal === 'function') {
                        showModal('¡Registro Exitoso!', data.message + '\nAhora puedes iniciar sesión.');
                    } else {
                        alert(data.message + '\nAhora puedes iniciar sesión.');
                    }
                    
                    setTimeout(() => {
                        window.location.href = 'index.html'; 
                    }, 2000);

                } else {
                    registerError.textContent = data.message;
                    registerError.classList.remove('hidden');
                }

            } catch (error) {
                console.error('Error en fetch:', error);
                registerError.textContent = 'Error de conexión con el servidor API.';
                registerError.classList.remove('hidden');
            }
        });
    }
});