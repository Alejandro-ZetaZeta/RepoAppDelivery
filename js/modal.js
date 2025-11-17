// js/modal.js

// Referencias a los elementos del modal
const messageModal = document.getElementById('messageModal');
const modalBackdrop = document.getElementById('messageModalBackdrop');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalCloseButton = document.getElementById('modalCloseButton');

/**
 * Muestra el modal con el título y mensaje especificados.
 * @param {string} title - El título del modal.
 * @param {string} message - El mensaje a mostrar en el modal.
 */
function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message.replace(/\n/g, '<br>');
    
    messageModal.classList.remove('hidden');
    setTimeout(() => {
        modalBackdrop.classList.add('opacity-100');
        messageModal.querySelector('.relative').classList.add('opacity-100', 'scale-100');
    }, 10);
}

/**
 * Oculta el modal.
 */
function hideModal() {
    modalBackdrop.classList.remove('opacity-100');
    messageModal.querySelector('.relative').classList.remove('opacity-100', 'scale-100');
    setTimeout(() => {
        messageModal.classList.add('hidden');
    }, 300);
}

// Event listener para cerrar el modal
if (modalCloseButton) {
    modalCloseButton.addEventListener('click', hideModal);
}