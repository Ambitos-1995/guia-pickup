/* =====================================================
   GUIA - Step-by-step pickup guide (preserved from v10)
   ===================================================== */
var Guia = (function () {
    'use strict';

    // Process data (unchanged from original)
    var procesosData = {
        "recepcion-repartidor-seur": {
            id: "recepcion-repartidor-seur",
            titulo: "Recibir paquetes SEUR",
            descripcion: "Llega el repartidor de SEUR",
            icono: "\uD83D\uDE9A",
            tipo: "repartidor",
            pasos: [
                { imagen: "img/fotos con circulos/1.png", texto: "Pulsa <strong>REPARTIDOR</strong>" },
                { imagen: "img/fotos con circulos/5.png", texto: "Pulsa <strong>RECEPCION DE PAQUETES</strong>" },
                { imagen: "img/fotos con circulos/7.png", texto: "Pulsa <strong>SEUR</strong>" },
                { imagen: "img/fotos con circulos/9.png", texto: "Pulsa el <strong>boton grande</strong>.<br>Escanea cada paquete." },
                { imagen: null, texto: "Pulsa <strong>CONTINUAR</strong>" }
            ],
            mensajeExito: "Los paquetes estan guardados.",
            notas: ["Escanea todos los paquetes", "Cuenta que esten todos"],
            avisoEspecial: null
        },
        "recepcion-repartidor-tipsa": {
            id: "recepcion-repartidor-tipsa",
            titulo: "Recibir paquetes TIPSA",
            descripcion: "Llega el repartidor de TIPSA",
            icono: "\uD83D\uDE9A",
            tipo: "repartidor",
            pasos: [
                { imagen: "img/fotos con circulos/1.png", texto: "Pulsa <strong>REPARTIDOR</strong>" },
                { imagen: "img/fotos con circulos/5.png", texto: "Pulsa <strong>RECEPCION DE PAQUETES</strong>" },
                { imagen: "img/fotos con circulos/8.png", texto: "Pulsa <strong>TIPSA</strong>" },
                { imagen: "img/fotos con circulos/9.png", texto: "Pulsa el <strong>boton grande</strong>.<br>Escanea cada paquete." },
                { imagen: null, texto: "Pulsa <strong>CONTINUAR</strong>" }
            ],
            mensajeExito: "Los paquetes estan guardados.",
            notas: ["Escanea todos los paquetes", "Cuenta que esten todos"],
            avisoEspecial: null
        },
        "recogida-repartidor": {
            id: "recogida-repartidor",
            titulo: "Repartidor recoge paquetes",
            descripcion: "Se lleva los paquetes depositados",
            icono: "\uD83D\uDCE6",
            tipo: "repartidor",
            pasos: [
                { imagen: "img/fotos con circulos/1.png", texto: "Pulsa <strong>REPARTIDOR</strong>" },
                { imagen: "img/fotos con circulos/6.png", texto: "Pulsa <strong>RECOGIDA DE PAQUETES</strong>" },
                { imagen: "img/fotos con circulos/7.png", texto: "Pulsa <strong>SEUR</strong> o <strong>TIPSA</strong>" },
                { imagen: "img/fotos con circulos/9.png", texto: "Escanea cada paquete que se lleva." },
                { imagen: null, texto: "Pulsa <strong>CONTINUAR</strong>" }
            ],
            mensajeExito: "Los paquetes estan registrados.",
            notas: ["Escanea todos los paquetes", "El repartidor se los lleva"],
            avisoEspecial: null
        },
        "deposito-etiqueta": {
            id: "deposito-etiqueta",
            titulo: "Cliente deja paquete",
            descripcion: "Tiene etiqueta impresa",
            icono: "\uD83C\uDFF7\uFE0F",
            tipo: "cliente",
            pasos: [
                { imagen: "img/fotos con circulos/2.png", texto: "Pulsa <strong>CLIENTE</strong>" },
                { imagen: "img/fotos con circulos/4.png", texto: "Pulsa <strong>DEPOSITO DE PAQUETES</strong>" },
                { imagen: "img/fotos con circulos/10.png", texto: "Pulsa <strong>Una etiqueta de envio</strong>" },
                { imagen: null, texto: "Escanea la etiqueta.<br>Pide el <strong>telefono</strong> al cliente.<br>Pulsa <strong>CONTINUAR</strong>." }
            ],
            mensajeExito: "Guarda el paquete en la estanteria.",
            notas: ["La etiqueta va pegada al paquete", "Apunta el telefono del cliente"],
            avisoEspecial: null
        },
        "deposito-qr": {
            id: "deposito-qr",
            titulo: "Devolucion con QR",
            descripcion: "Cliente tiene QR en el movil",
            icono: "\uD83D\uDCF1",
            tipo: "cliente",
            pasos: [
                { imagen: "img/fotos con circulos/2.png", texto: "Pulsa <strong>CLIENTE</strong>" },
                { imagen: "img/fotos con circulos/4.png", texto: "Pulsa <strong>DEPOSITO DE PAQUETES</strong>" },
                { imagen: "img/fotos con circulos/11.png", texto: "Pulsa <strong>Un codigo QR</strong>" },
                { imagen: null, texto: "Escanea el <strong>QR del movil</strong> del cliente." },
                { imagen: null, texto: "Escribe en una etiqueta:<br><strong>El codigo + ES26626</strong><br>Pegala en el paquete." }
            ],
            mensajeExito: "Guarda el paquete en la estanteria.",
            notas: ["Siempre pon etiqueta al paquete", "Escribe claro el codigo"],
            avisoEspecial: null
        },
        "entrega-cliente": {
            id: "entrega-cliente",
            titulo: "Cliente recoge paquete",
            descripcion: "Viene a buscar su paquete",
            icono: "\uD83C\uDF81",
            tipo: "cliente",
            pasos: [
                { imagen: "img/fotos con circulos/2.png", texto: "Pulsa <strong>CLIENTE</strong>" },
                { imagen: "img/fotos con circulos/3.png", texto: "Pulsa <strong>RECOGIDA DE PAQUETES</strong>" },
                { imagen: null, texto: "Pregunta: <strong>Tienes QR o DNI?</strong><br>Pulsa la opcion." },
                { imagen: null, texto: "Busca el paquete.<br>Escanea la <strong>etiqueta</strong>." },
                { imagen: null, texto: "El cliente <strong>firma en la pantalla</strong>.<br>Dale su paquete." }
            ],
            mensajeExito: "El cliente ya tiene su paquete.",
            notas: ["Si no tiene QR, usa el DNI", "El cliente debe firmar"],
            avisoEspecial: "Si hay que cobrar: SOLO con tarjeta. Nunca dinero."
        }
    };

    var currentProcess = null;
    var currentStep = 0;

    // DOM
    var guiaHome, guiaSteps, guiaComplete;
    var guiaGrid, progressText;
    var imageWrap, stepImage, noImage, noImageText, instruction;
    var prevBtn, nextBtn, finishBtn;
    var completeMsgEl, completeWarningEl, completeNotesEl;

    function init() {
        guiaHome = document.getElementById('guia-home');
        guiaSteps = document.getElementById('guia-steps');
        guiaComplete = document.getElementById('guia-complete');
        guiaGrid = document.getElementById('guia-grid');
        progressText = document.getElementById('guia-progress-text');
        imageWrap = document.getElementById('guia-image-wrap');
        stepImage = document.getElementById('guia-step-image');
        noImage = document.getElementById('guia-no-image');
        noImageText = document.getElementById('guia-no-image-text');
        instruction = document.getElementById('guia-instruction');
        prevBtn = document.getElementById('guia-prev');
        nextBtn = document.getElementById('guia-next');
        finishBtn = document.getElementById('guia-finish');
        completeMsgEl = document.getElementById('guia-complete-msg');
        completeWarningEl = document.getElementById('guia-complete-warning');
        completeNotesEl = document.getElementById('guia-complete-notes');

        // Render process cards
        renderProcessCards();

        prevBtn.addEventListener('click', prevStep);
        nextBtn.addEventListener('click', nextStep);
        finishBtn.addEventListener('click', backToGuiaHome);

        // Smart back button: steps/complete → guia-home, guia-home → screen-menu
        var backBtn = document.getElementById('guia-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function (e) {
                if (!guiaHome.classList.contains('hidden')) {
                    // Already on guia-home, let App.navigate handle it
                    return;
                }
                // In steps or complete, go back to guia-home instead of main menu
                e.stopPropagation();
                backToGuiaHome();
            });
        }

        // Swipe gestures for step navigation
        var stepsEl = document.getElementById('guia-steps');
        var touchStartX = 0;
        var touchStartY = 0;

        stepsEl.addEventListener('touchstart', function (e) {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        stepsEl.addEventListener('touchend', function (e) {
            var dx = e.changedTouches[0].screenX - touchStartX;
            var dy = e.changedTouches[0].screenY - touchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                if (dx < 0) nextStep();
                else prevStep();
            }
        }, { passive: true });
    }

    function show() {
        backToGuiaHome();
    }

    function renderProcessCards() {
        var html = '';
        var keys = Object.keys(procesosData);
        for (var i = 0; i < keys.length; i++) {
            var p = procesosData[keys[i]];
            var typeClass = p.tipo === 'repartidor' ? 'guia-card-repartidor' : 'guia-card-cliente';
            html += '<button class="guia-card ' + typeClass + '" data-process="' + p.id + '">';
            html += '<span class="guia-card-icon">' + p.icono + '</span>';
            html += '<span class="guia-card-title">' + p.titulo + '</span>';
            html += '<span class="guia-card-desc">' + p.descripcion + '</span>';
            html += '</button>';
        }
        guiaGrid.innerHTML = html;

        guiaGrid.addEventListener('click', function (e) {
            var card = e.target.closest('.guia-card');
            if (!card) return;
            startProcess(card.dataset.process);
        });
    }

    function backToGuiaHome() {
        currentProcess = null;
        currentStep = 0;
        guiaHome.classList.remove('hidden');
        guiaSteps.classList.add('hidden');
        guiaComplete.classList.add('hidden');
    }

    function startProcess(processId) {
        currentProcess = procesosData[processId];
        if (!currentProcess) return;
        currentStep = 0;
        guiaHome.classList.add('hidden');
        guiaSteps.classList.remove('hidden');
        guiaComplete.classList.add('hidden');
        updateStep();
    }

    function updateStep() {
        var paso = currentProcess.pasos[currentStep];
        var total = currentProcess.pasos.length;

        progressText.textContent = 'Paso ' + (currentStep + 1) + ' de ' + total;

        if (paso.imagen) {
            imageWrap.classList.remove('hidden');
            noImage.classList.add('hidden');
            stepImage.src = paso.imagen;
            instruction.innerHTML = paso.texto;
            instruction.classList.remove('hidden');
        } else {
            imageWrap.classList.add('hidden');
            noImage.classList.remove('hidden');
            noImageText.innerHTML = paso.texto;
            instruction.classList.add('hidden');
        }

        prevBtn.disabled = currentStep === 0;
        prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';

        if (currentStep === total - 1) {
            nextBtn.innerHTML = 'Terminar <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        } else {
            nextBtn.innerHTML = 'Siguiente <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
        }
    }

    function nextStep() {
        if (!currentProcess) return;
        if (currentStep < currentProcess.pasos.length - 1) {
            currentStep++;
            updateStep();
        } else {
            showComplete();
        }
    }

    function prevStep() {
        if (currentStep > 0) {
            currentStep--;
            updateStep();
        }
    }

    function showComplete() {
        guiaSteps.classList.add('hidden');
        guiaComplete.classList.remove('hidden');

        completeMsgEl.textContent = currentProcess.mensajeExito;

        if (currentProcess.avisoEspecial) {
            completeWarningEl.textContent = currentProcess.avisoEspecial;
            completeWarningEl.classList.remove('hidden');
        } else {
            completeWarningEl.classList.add('hidden');
        }

        completeNotesEl.innerHTML = currentProcess.notas.map(function (n) {
            return '<li>' + n + '</li>';
        }).join('');
    }

    return { init: init, show: show };
})();
