/* =====================================================
   GUIA PICKUP - JAVASCRIPT (ACCESIBILIDAD COGNITIVA)
   ===================================================== */

// Datos de los procesos con TEXTOS SIMPLIFICADOS
const procesosData = {
    "recepcion-repartidor": {
        id: "recepcion-repartidor",
        titulo: "Recibir paquetes del repartidor",
        descripcion: "Llega el repartidor con paquetes",
        icono: "🚚",
        pasos: [
            {
                imagen: "img/IMG_4966.JPG",
                highlightX: 33,
                highlightY: 28,
                texto: "Pulsa <strong>REPARTIDOR</strong>"
            },
            {
                imagen: "img/IMG_4968.JPG",
                highlightX: 35,
                highlightY: 35,
                texto: "Pulsa <strong>RECEPCION DE PAQUETES</strong>"
            },
            {
                imagen: "img/IMG_4970.JPG",
                highlightX: 33,
                highlightY: 33,
                texto: "Pulsa <strong>SEUR</strong>"
            },
            {
                imagen: "img/IMG_4971.JPG",
                highlightX: 38,
                highlightY: 32,
                texto: "Pulsa el <strong>boton grande</strong>.<br>Escanea cada paquete."
            },
            {
                imagen: "img/IMG_4971.JPG",
                highlightX: 90,
                highlightY: 10,
                texto: "Pulsa <strong>CONTINUAR</strong>"
            }
        ],
        mensajeExito: "Los paquetes estan guardados.",
        notas: [
            "Escanea todos los paquetes",
            "Cuenta que esten todos"
        ],
        avisoEspecial: null
    },
    "deposito-etiqueta": {
        id: "deposito-etiqueta",
        titulo: "Cliente deja un paquete",
        descripcion: "Tiene etiqueta impresa",
        icono: "🏷️",
        pasos: [
            {
                imagen: "img/IMG_4966.JPG",
                highlightX: 33,
                highlightY: 50,
                texto: "Pulsa <strong>CLIENTE</strong>"
            },
            {
                imagen: "img/IMG_4967.JPG",
                highlightX: 55,
                highlightY: 35,
                texto: "Pulsa <strong>DEPOSITO DE PAQUETES</strong>"
            },
            {
                imagen: "img/IMG_4972.JPG",
                highlightX: 35,
                highlightY: 32,
                texto: "Pulsa <strong>Una etiqueta de envio</strong>"
            },
            {
                imagen: null,
                highlightX: null,
                highlightY: null,
                texto: "Escanea la etiqueta.<br>Pide el <strong>telefono</strong> al cliente.<br>Pulsa <strong>CONTINUAR</strong>."
            }
        ],
        mensajeExito: "Guarda el paquete en la estanteria.",
        notas: [
            "La etiqueta va pegada al paquete",
            "Apunta el telefono del cliente"
        ],
        avisoEspecial: null
    },
    "deposito-qr": {
        id: "deposito-qr",
        titulo: "Devolucion con QR",
        descripcion: "Cliente tiene QR en el movil",
        icono: "📱",
        pasos: [
            {
                imagen: "img/IMG_4966.JPG",
                highlightX: 33,
                highlightY: 50,
                texto: "Pulsa <strong>CLIENTE</strong>"
            },
            {
                imagen: "img/IMG_4967.JPG",
                highlightX: 55,
                highlightY: 35,
                texto: "Pulsa <strong>DEPOSITO DE PAQUETES</strong>"
            },
            {
                imagen: "img/IMG_4972.JPG",
                highlightX: 55,
                highlightY: 32,
                texto: "Pulsa <strong>Un codigo QR</strong>"
            },
            {
                imagen: null,
                highlightX: null,
                highlightY: null,
                texto: "Escanea el <strong>QR del movil</strong> del cliente."
            },
            {
                imagen: null,
                highlightX: null,
                highlightY: null,
                texto: "Escribe en una etiqueta:<br><strong>El codigo + ES26626</strong><br>Pegala en el paquete."
            }
        ],
        mensajeExito: "Guarda el paquete en la estanteria.",
        notas: [
            "Siempre pon etiqueta al paquete",
            "Escribe claro el codigo"
        ],
        avisoEspecial: null
    },
    "entrega-cliente": {
        id: "entrega-cliente",
        titulo: "Cliente recoge paquete",
        descripcion: "Viene a buscar su paquete",
        icono: "🎁",
        pasos: [
            {
                imagen: "img/IMG_4966.JPG",
                highlightX: 33,
                highlightY: 50,
                texto: "Pulsa <strong>CLIENTE</strong>"
            },
            {
                imagen: "img/IMG_4967.JPG",
                highlightX: 35,
                highlightY: 35,
                texto: "Pulsa <strong>RECOGIDA DE PAQUETES</strong>"
            },
            {
                imagen: null,
                highlightX: null,
                highlightY: null,
                texto: "Pregunta: <strong>¿Tienes QR o DNI?</strong><br>Pulsa la opcion."
            },
            {
                imagen: null,
                highlightX: null,
                highlightY: null,
                texto: "Busca el paquete.<br>Escanea la <strong>etiqueta</strong>."
            },
            {
                imagen: null,
                highlightX: null,
                highlightY: null,
                texto: "El cliente <strong>firma en la pantalla</strong>.<br>Dale su paquete."
            }
        ],
        mensajeExito: "El cliente ya tiene su paquete.",
        notas: [
            "Si no tiene QR, usa el DNI",
            "El cliente debe firmar"
        ],
        avisoEspecial: "Si hay que cobrar: SOLO con tarjeta. Nunca dinero."
    }
};

// Estado de la aplicacion
let currentProcess = null;
let currentStep = 0;

// Elementos del DOM
const homeScreen = document.getElementById('home-screen');
const processScreen = document.getElementById('process-screen');
const completeScreen = document.getElementById('complete-screen');

const processCards = document.querySelectorAll('.process-card');
const infoToggle = document.getElementById('info-toggle');
const infoContent = document.getElementById('info-content');

const backToHomeBtn = document.getElementById('back-to-home');
const backToHomeFinalBtn = document.getElementById('back-to-home-final');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const finishBtn = document.getElementById('finish-btn');

const processTitle = document.getElementById('process-title');
const progressText = document.getElementById('progress-text');
const imageContainer = document.getElementById('image-container');
const stepImage = document.getElementById('step-image');
const highlight = document.getElementById('highlight');
const noImagePlaceholder = document.getElementById('no-image-placeholder');
const stepText = document.getElementById('step-text');

const completeTitle = document.getElementById('complete-title');
const successMessage = document.getElementById('success-message');
const notesList = document.getElementById('notes-list');
const specialWarning = document.getElementById('special-warning');

// Funciones de navegacion entre pantallas
function showScreen(screen) {
    homeScreen.classList.remove('active');
    processScreen.classList.remove('active');
    completeScreen.classList.remove('active');
    screen.classList.add('active');

    // Scroll al inicio
    window.scrollTo(0, 0);
}

function goToHome() {
    currentProcess = null;
    currentStep = 0;
    showScreen(homeScreen);
}

function startProcess(processId) {
    currentProcess = procesosData[processId];
    currentStep = 0;
    processTitle.textContent = currentProcess.titulo;
    showScreen(processScreen);
    updateStep();
}

function updateStep() {
    const paso = currentProcess.pasos[currentStep];
    const totalPasos = currentProcess.pasos.length;

    // Actualizar indicador de progreso (grande y claro)
    progressText.innerHTML = `Paso <span class="current-step">${currentStep + 1}</span> de ${totalPasos}`;

    // Mostrar imagen o placeholder
    if (paso.imagen) {
        imageContainer.style.display = 'block';
        noImagePlaceholder.classList.remove('active');
        stepImage.src = paso.imagen;

        // Posicionar el highlight
        highlight.style.display = 'block';
        highlight.style.left = `${paso.highlightX}%`;
        highlight.style.top = `${paso.highlightY}%`;
    } else {
        imageContainer.style.display = 'none';
        noImagePlaceholder.classList.add('active');
        highlight.style.display = 'none';
    }

    // Actualizar texto (instruccion simplificada)
    stepText.innerHTML = paso.texto;

    // Actualizar botones de navegacion
    prevBtn.disabled = currentStep === 0;
    prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';

    if (currentStep === totalPasos - 1) {
        nextBtn.innerHTML = 'Terminar <span>✓</span>';
    } else {
        nextBtn.innerHTML = 'Siguiente <span>→</span>';
    }

    // Scroll al inicio del paso
    window.scrollTo(0, 0);
}

function nextStep() {
    const totalPasos = currentProcess.pasos.length;

    if (currentStep < totalPasos - 1) {
        currentStep++;
        updateStep();
    } else {
        showCompleteScreen();
    }
}

function prevStep() {
    if (currentStep > 0) {
        currentStep--;
        updateStep();
    }
}

function showCompleteScreen() {
    completeTitle.textContent = currentProcess.titulo;

    // Mensaje de exito
    if (successMessage) {
        successMessage.innerHTML = `✅ ¡Bien hecho! ${currentProcess.mensajeExito}`;
    }

    // Renderizar notas
    notesList.innerHTML = currentProcess.notas
        .map(nota => `<li>${nota}</li>`)
        .join('');

    // Mostrar aviso especial si existe
    if (specialWarning) {
        if (currentProcess.avisoEspecial) {
            specialWarning.innerHTML = `💳 ${currentProcess.avisoEspecial}`;
            specialWarning.style.display = 'block';
        } else {
            specialWarning.style.display = 'none';
        }
    }

    showScreen(completeScreen);
}

// Toggle de informacion
function toggleInfo() {
    infoToggle.classList.toggle('active');
    infoContent.classList.toggle('active');
}

// Event listeners
processCards.forEach(card => {
    card.addEventListener('click', () => {
        const processId = card.dataset.process;
        startProcess(processId);
    });
});

if (infoToggle) {
    infoToggle.addEventListener('click', toggleInfo);
}

if (backToHomeBtn) {
    backToHomeBtn.addEventListener('click', goToHome);
}

if (backToHomeFinalBtn) {
    backToHomeFinalBtn.addEventListener('click', goToHome);
}

if (finishBtn) {
    finishBtn.addEventListener('click', goToHome);
}

if (prevBtn) {
    prevBtn.addEventListener('click', prevStep);
}

if (nextBtn) {
    nextBtn.addEventListener('click', nextStep);
}

// Soporte para gestos en movil (swipe)
let touchStartX = 0;
let touchEndX = 0;

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            nextStep();
        } else {
            if (currentStep > 0) {
                prevStep();
            }
        }
    }
}

if (processScreen) {
    processScreen.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    processScreen.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });
}

// Soporte para teclado
document.addEventListener('keydown', (e) => {
    if (!processScreen || !processScreen.classList.contains('active')) return;

    if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextStep();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStep > 0) {
            prevStep();
        }
    } else if (e.key === 'Escape') {
        goToHome();
    }
});

// Inicializacion
console.log('Guia Pickup cargada correctamente');
