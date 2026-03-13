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
    var finishBtn;
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
        finishBtn = document.getElementById('guia-finish');
        completeMsgEl = document.getElementById('guia-complete-msg');
        completeWarningEl = document.getElementById('guia-complete-warning');
        completeNotesEl = document.getElementById('guia-complete-notes');

        // Render process cards
        renderProcessCards();

        Utils.bindPress(finishBtn, backToGuiaHome);

        // Smart back button: steps/complete → guia-home, guia-home → screen-menu
        var backBtn = document.getElementById('guia-back-btn');
        if (backBtn) {
            Utils.bindPress(backBtn, function (e) {
                if (!guiaHome.classList.contains('hidden')) {
                    // Already on guia-home, let App.navigate handle it
                    return;
                }
                // In steps or complete, go back to guia-home instead of main menu
                if (e.preventDefault) e.preventDefault();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                else if (e.stopPropagation) e.stopPropagation();
                backToGuiaHome();
            });
        }

        // Swipe gestures + tap-to-advance for step navigation
        var stepsEl = document.getElementById('guia-steps');
        var touchStartX = 0;
        var touchStartY = 0;
        var swipeHandled = false;

        stepsEl.addEventListener('touchstart', function (e) {
            swipeHandled = false;
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        stepsEl.addEventListener('touchend', function (e) {
            var dx = e.changedTouches[0].screenX - touchStartX;
            var dy = e.changedTouches[0].screenY - touchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                swipeHandled = true;
                if (dx < 0) nextStep();
                else prevStep();
                return;
            }

            if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
                swipeHandled = true;
                nextStep();
            }
        }, { passive: true });

        // Tap anywhere on steps to advance
        stepsEl.addEventListener('click', function () {
            if (Utils.isRecentTouchLikePress(700)) {
                swipeHandled = false;
                return;
            }
            if (swipeHandled) { swipeHandled = false; return; }
            nextStep();
        });
    }

    function show() {
        backToGuiaHome();
    }

    function renderProcessCards() {
        guiaGrid.textContent = '';
        var keys = Object.keys(procesosData);
        for (var i = 0; i < keys.length; i++) {
            var p = procesosData[keys[i]];
            var typeClass = p.tipo === 'repartidor' ? 'guia-card-repartidor' : 'guia-card-cliente';
            var button = document.createElement('button');
            button.className = 'guia-card ' + typeClass;
            button.dataset.process = p.id;
            button.type = 'button';

            var icon = document.createElement('span');
            icon.className = 'guia-card-icon';
            icon.textContent = p.icono;

            var title = document.createElement('span');
            title.className = 'guia-card-title';
            title.textContent = p.titulo;

            var desc = document.createElement('span');
            desc.className = 'guia-card-desc';
            desc.textContent = p.descripcion;

            button.appendChild(icon);
            button.appendChild(title);
            button.appendChild(desc);
            guiaGrid.appendChild(button);
        }

        Utils.delegatePress(guiaGrid, '.guia-card', function (e, card) {
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
            setFormattedContent(instruction, paso.texto);
            instruction.classList.remove('hidden');
        } else {
            imageWrap.classList.add('hidden');
            noImage.classList.remove('hidden');
            setFormattedContent(noImageText, paso.texto);
            instruction.classList.add('hidden');
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

        completeNotesEl.textContent = '';
        currentProcess.notas.forEach(function (note) {
            var item = document.createElement('li');
            item.textContent = note;
            completeNotesEl.appendChild(item);
        });
    }

    function setFormattedContent(target, text) {
        target.textContent = '';

        var parser = new DOMParser();
        var doc = parser.parseFromString('<div>' + String(text || '') + '</div>', 'text/html');
        appendAllowedNodes(doc.body.firstChild, target);
    }

    function appendAllowedNodes(source, target) {
        if (!source) return;

        for (var i = 0; i < source.childNodes.length; i++) {
            var child = source.childNodes[i];
            if (child.nodeType === Node.TEXT_NODE) {
                target.appendChild(document.createTextNode(child.textContent || ''));
                continue;
            }

            if (child.nodeType !== Node.ELEMENT_NODE) continue;

            if (child.tagName === 'STRONG') {
                var strong = document.createElement('strong');
                strong.textContent = child.textContent || '';
                target.appendChild(strong);
                continue;
            }

            if (child.tagName === 'BR') {
                target.appendChild(document.createElement('br'));
            }
        }
    }

    return { init: init, show: show };
})();
