/* ============================================================
   Contract - Modulo de firma de acuerdos de participacion
   Flujo: resumen -> PIN participante -> firma participante
   -> vista previa -> firma admin -> vista previa -> exito
   ============================================================ */

var Contract = (function () {
    'use strict';

    var currentContractId = null;
    var currentContract = null;
    var currentStep = 'summary';
    var participantPad = null;
    var adminPad = null;
    var participantPin = '';
    var participantVerificationToken = '';
    var participantSignDataUrl = '';
    var adminSignDataUrl = '';
    var participantVerificationInFlight = false;
    var participantSigningInFlight = false;
    var adminSigningInFlight = false;
    var resizeBound = false;

    var steps = {};
    var pCanvas = null;
    var aCanvas = null;

    function init() {
        steps = {
            summary: document.getElementById('acuerdo-step-summary'),
            pPin: document.getElementById('acuerdo-step-p-pin'),
            pSign: document.getElementById('acuerdo-step-p-sign'),
            pPreview: document.getElementById('acuerdo-step-p-preview'),
            aSign: document.getElementById('acuerdo-step-a-sign'),
            aPreview: document.getElementById('acuerdo-step-a-preview'),
            done: document.getElementById('acuerdo-step-done')
        };

        pCanvas = document.getElementById('acuerdo-canvas-participant');
        aCanvas = document.getElementById('acuerdo-canvas-admin');

        Utils.bindPress(document.getElementById('acuerdo-back-btn'), function () {
            App.navigate('screen-admin');
        });

        Utils.bindPress(document.getElementById('acuerdo-btn-go-sign'), function () {
            if (!currentContract) return;
            hideFeedback();
            if (currentContract.status === 'pending_admin') {
                goToAdminSign();
                return;
            }
            goToParticipantPin();
        });

        bindPinPad();

        Utils.bindPress(document.getElementById('acuerdo-btn-pin-clear'), clearParticipantPin);
        Utils.bindPress(document.getElementById('acuerdo-btn-pin-verify'), verifyParticipantPin);

        Utils.bindPress(document.getElementById('acuerdo-btn-p-clear'), function () {
            if (participantPad) participantPad.clear();
            updateParticipantConfirmState();
        });
        Utils.bindPress(document.getElementById('acuerdo-btn-p-confirm'), goToParticipantPreview);
        Utils.bindPress(document.getElementById('acuerdo-btn-p-redo'), goToParticipantSign);
        Utils.bindPress(document.getElementById('acuerdo-btn-p-ok'), submitParticipantSignature);

        Utils.bindPress(document.getElementById('acuerdo-btn-a-clear'), function () {
            if (adminPad) adminPad.clear();
            updateAdminConfirmState();
        });
        Utils.bindPress(document.getElementById('acuerdo-btn-a-confirm'), goToAdminPreview);
        Utils.bindPress(document.getElementById('acuerdo-btn-a-redo'), goToAdminSign);
        Utils.bindPress(document.getElementById('acuerdo-btn-a-ok'), submitAdminSignature);

        Utils.bindPress(document.getElementById('acuerdo-btn-done'), function () {
            App.navigate('screen-admin');
        });
    }

    function show(contractId) {
        if (!contractId) {
            App.navigate('screen-admin');
            return;
        }

        resetTransientState();
        currentContractId = contractId;
        showStep('summary');
        initSignaturePads();
        loadContractData(contractId);
    }

    function hide() {
        if (participantPad) participantPad.clear();
        if (adminPad) adminPad.clear();

        clearParticipantPin();
        participantVerificationToken = '';
        currentContractId = null;
        currentContract = null;
        currentStep = 'summary';
        participantVerificationInFlight = false;
        participantSigningInFlight = false;
        adminSigningInFlight = false;

        setButtonState('acuerdo-btn-pin-verify', true, 'Validar PIN');
        setButtonState('acuerdo-btn-p-ok', false, 'Si, es correcta');
        setButtonState('acuerdo-btn-a-ok', false, 'Si, correcto');
        setButtonState('acuerdo-btn-p-confirm', participantPad ? participantPad.isEmpty() : true, 'Confirmar');
        setButtonState('acuerdo-btn-a-confirm', adminPad ? adminPad.isEmpty() : true, 'Confirmar');

        setPreview('acuerdo-preview-participant', '');
        setPreview('acuerdo-preview-admin', '');
        hideFeedback();
    }

    function loadContractData(contractId) {
        Api.getContract(contractId).then(function (res) {
            if (!res || !res.success || !res.data) {
                showFeedback((res && res.message) || 'No se pudo cargar el acuerdo.');
                App.navigate('screen-admin');
                return;
            }

            currentContract = res.data;
            renderContractSummary(res.data);

            if (res.data.status === 'pending_admin') {
                setPrimaryButtonLabel('Continuar a cofirmar');
            } else if (res.data.status === 'signed') {
                setPrimaryButtonLabel('Acuerdo ya firmado');
                showStep('done');
            } else {
                setPrimaryButtonLabel('Lo entiendo - Continuar');
            }
        });
    }

    function renderContractSummary(data) {
        var name = data.employee_name || '-';
        setText('acuerdo-employee-name', name);
        setText('acuerdo-header-title', name !== '-' ? ('Acuerdo - ' + name) : 'Acuerdo de Participacion');
        setText('acuerdo-pin-target', name);
    }

    function bindPinPad() {
        Utils.each(document.querySelectorAll('#acuerdo-pin-keypad [data-key]'), function (btn) {
            Utils.bindPress(btn, function () {
                var key = btn.getAttribute('data-key');
                if (!key) return;

                if (key === 'clear') {
                    backspaceParticipantPin();
                    return;
                }
                if (key === 'submit') {
                    verifyParticipantPin();
                    return;
                }
                appendParticipantPin(key);
            });
        });
    }

    function appendParticipantPin(key) {
        if (participantVerificationInFlight) return;
        if (!/^\d$/.test(key)) return;
        if (participantPin.length >= 6) return;
        participantPin += key;
        participantVerificationToken = '';
        updateParticipantPinUi();
    }

    function backspaceParticipantPin() {
        if (participantVerificationInFlight || !participantPin.length) return;
        participantPin = participantPin.slice(0, -1);
        participantVerificationToken = '';
        updateParticipantPinUi();
    }

    function clearParticipantPin() {
        participantPin = '';
        participantVerificationToken = '';
        updateParticipantPinUi();
    }

    function updateParticipantPinUi() {
        Utils.each(document.querySelectorAll('#acuerdo-pin-dots .acuerdo-pin-dot'), function (dot, index) {
            dot.classList.toggle('filled', index < participantPin.length);
        });
        setButtonState('acuerdo-btn-pin-verify', participantPin.length < 4 || participantVerificationInFlight, participantVerificationInFlight ? 'Validando...' : 'Validar PIN');
    }

    function verifyParticipantPin() {
        if (!currentContractId || !currentContract) return;
        if (participantVerificationInFlight) return;
        if (currentContract.status === 'pending_admin') {
            goToAdminSign();
            return;
        }
        if (participantPin.length < 4) {
            showFeedback('Introduce el PIN completo del participante.');
            return;
        }

        hideFeedback();
        participantVerificationInFlight = true;
        updateParticipantPinUi();

        Api.verifyParticipantContractPin(currentContractId, participantPin).then(function (res) {
            participantVerificationInFlight = false;
            updateParticipantPinUi();

            if (res && res.success && res.verificationToken) {
                participantVerificationToken = res.verificationToken;
                participantPin = '';
                updateParticipantPinUi();
                goToParticipantSign();
                return;
            }

            participantVerificationToken = '';
            clearParticipantPin();
            showFeedback((res && res.message) || 'No se pudo validar el PIN.');
        }).catch(function () {
            participantVerificationInFlight = false;
            updateParticipantPinUi();
            participantVerificationToken = '';
            clearParticipantPin();
            showFeedback('Error al validar el PIN.');
        });
    }

    function initSignaturePads() {
        if (typeof SignaturePad === 'undefined') {
            console.warn('[Contract] SignaturePad no disponible');
            return;
        }

        resizeCanvas(pCanvas);
        resizeCanvas(aCanvas);

        if (!participantPad) {
            participantPad = new SignaturePad(pCanvas, {
                minWidth: 2,
                maxWidth: 4,
                penColor: '#000000',
                backgroundColor: 'rgba(0,0,0,0)'
            });
            participantPad.addEventListener('endStroke', updateParticipantConfirmState);
        }

        if (!adminPad) {
            adminPad = new SignaturePad(aCanvas, {
                minWidth: 2,
                maxWidth: 4,
                penColor: '#000000',
                backgroundColor: 'rgba(0,0,0,0)'
            });
            adminPad.addEventListener('endStroke', updateAdminConfirmState);
        }

        if (!resizeBound) {
            window.addEventListener('resize', resizeAllCanvases);
            resizeBound = true;
        }
    }

    function resizeCanvas(canvas) {
        if (!canvas) return;
        if (!canvas.offsetWidth || !canvas.offsetHeight) return;
        var ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        var ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
    }

    function resizeAllCanvases() {
        resizeCanvas(pCanvas);
        resizeCanvas(aCanvas);
        if (participantPad) participantPad.clear();
        if (adminPad) adminPad.clear();
        updateParticipantConfirmState();
        updateAdminConfirmState();
    }

    function updateParticipantConfirmState() {
        setButtonState('acuerdo-btn-p-confirm', !participantPad || participantPad.isEmpty(), 'Confirmar');
    }

    function updateAdminConfirmState() {
        setButtonState('acuerdo-btn-a-confirm', !adminPad || adminPad.isEmpty(), 'Confirmar');
    }

    function goToParticipantPin() {
        hideFeedback();
        clearParticipantPin();
        showStep('pPin');
    }

    function goToParticipantSign() {
        if (currentContract && currentContract.status !== 'pending_admin' && !participantVerificationToken) {
            showFeedback('Primero valida el PIN del participante.');
            showStep('pPin');
            return;
        }
        participantSignDataUrl = '';
        hideFeedback();
        showStep('pSign');
        resizeCanvas(pCanvas);
        if (participantPad) participantPad.clear();
        updateParticipantConfirmState();
    }

    function goToParticipantPreview() {
        if (!participantPad || participantPad.isEmpty()) return;
        participantSignDataUrl = getNormalizedSignatureDataUrl(participantPad);
        if (!participantSignDataUrl) {
            showFeedback('Error al capturar la firma. Por favor, repite la firma.');
            goToParticipantSign();
            return;
        }
        setPreview('acuerdo-preview-participant', participantSignDataUrl);
        hideFeedback();
        showStep('pPreview');
    }

    function submitParticipantSignature() {
        if (!currentContractId || !participantPad || participantPad.isEmpty()) return;
        if (!participantVerificationToken) {
            showFeedback('La validacion del PIN ha caducado. Vuelve a introducir el PIN del participante.');
            showStep('pPin');
            return;
        }
        if (participantSigningInFlight) return;

        participantSigningInFlight = true;
        setButtonState('acuerdo-btn-p-ok', true, 'Guardando...');
        hideFeedback();

        Api.participantSignContract(
            currentContractId,
            participantVerificationToken,
            participantSignDataUrl
        ).then(function (res) {
            participantSigningInFlight = false;
            setButtonState('acuerdo-btn-p-ok', false, 'Si, es correcta');

            if (res && res.success) {
                participantVerificationToken = '';
                clearParticipantPin();
                if (currentContract) {
                    currentContract.status = 'pending_admin';
                    currentContract.participant_pin_verified = true;
                }
                setPrimaryButtonLabel('Continuar a cofirmar');
                goToAdminSign();
                return;
            }

            participantVerificationToken = '';
            showFeedback((res && res.message) || 'No se pudo guardar la firma del participante.');
            if (res && (res.error === 'VERIFICATION_TOKEN_INVALID' || res.error === 'VERIFICATION_TOKEN_MISMATCH')) {
                clearParticipantPin();
                showStep('pPin');
            }
        }).catch(function () {
            participantSigningInFlight = false;
            setButtonState('acuerdo-btn-p-ok', false, 'Si, es correcta');
            showFeedback('Error al guardar la firma del participante.');
        });
    }

    function goToAdminSign() {
        if (!currentContract) return;
        if (currentContract.status !== 'pending_admin') {
            showFeedback('Todavia falta validar el PIN y guardar la firma del participante.');
            showStep('summary');
            return;
        }
        adminSignDataUrl = '';
        hideFeedback();
        showStep('aSign');
        resizeCanvas(aCanvas);
        if (adminPad) adminPad.clear();
        updateAdminConfirmState();
    }

    function goToAdminPreview() {
        if (!adminPad || adminPad.isEmpty()) return;
        adminSignDataUrl = getNormalizedSignatureDataUrl(adminPad);
        if (!adminSignDataUrl) {
            showFeedback('Error al capturar la firma. Por favor, repite la firma.');
            goToAdminSign();
            return;
        }
        setPreview('acuerdo-preview-admin', adminSignDataUrl);
        hideFeedback();
        showStep('aPreview');
    }

    function submitAdminSignature() {
        if (!currentContractId || !adminPad || adminPad.isEmpty()) return;
        if (adminSigningInFlight) return;

        adminSigningInFlight = true;
        setButtonState('acuerdo-btn-a-ok', true, 'Guardando...');
        hideFeedback();

        Api.adminSignContract(
            currentContractId,
            adminSignDataUrl
        ).then(function (res) {
            adminSigningInFlight = false;
            setButtonState('acuerdo-btn-a-ok', false, 'Si, correcto');

            if (res && res.success) {
                if (currentContract) currentContract.status = 'signed';
                showStep('done');
                return;
            }

            showFeedback((res && res.message) || 'No se pudo guardar la cofirma.');
        }).catch(function () {
            adminSigningInFlight = false;
            setButtonState('acuerdo-btn-a-ok', false, 'Si, correcto');
            showFeedback('Error al guardar la cofirma.');
        });
    }

    function showStep(step) {
        currentStep = step;
        Object.keys(steps).forEach(function (key) {
            if (steps[key]) steps[key].classList.add('hidden');
        });
        if (steps[step]) steps[step].classList.remove('hidden');
        updateStepIndicator(step);
    }

    function updateStepIndicator(step) {
        var map = {
            summary: 1,
            pPin: 2,
            pSign: 2,
            pPreview: 2,
            aSign: 3,
            aPreview: 3,
            done: 4
        };
        var current = map[step] || 1;
        Utils.each(document.querySelectorAll('.acuerdo-step-dot'), function (dot, index) {
            dot.classList.toggle('active', index + 1 <= current);
            dot.classList.toggle('current', index + 1 === current);
        });
    }

    function resetTransientState() {
        clearParticipantPin();
        participantVerificationToken = '';
        participantSignDataUrl = '';
        adminSignDataUrl = '';
        setPreview('acuerdo-preview-participant', '');
        setPreview('acuerdo-preview-admin', '');
        hideFeedback();
    }

    function setPrimaryButtonLabel(label) {
        var btn = document.getElementById('acuerdo-btn-go-sign');
        if (!btn) return;
        btn.innerHTML =
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>' +
            '<span>' + escapeHtml(label) + '</span>';
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function setPreview(id, src) {
        var el = document.getElementById(id);
        if (!el) return;
        if (src) {
            el.setAttribute('src', src);
        } else {
            el.removeAttribute('src');
        }
    }

    function setButtonState(id, disabled, label) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = !!disabled;
        if (label) {
            var svg = btn.querySelector('svg');
            if (svg) {
                btn.innerHTML = svg.outerHTML + ' ' + escapeHtml(label);
            } else {
                btn.textContent = label;
            }
        }
    }

    function getNormalizedSignatureDataUrl(pad) {
        return Utils.getNormalizedSignatureDataUrl(pad);
    }

    function showFeedback(message) {
        var el = document.getElementById('acuerdo-feedback');
        if (!el) return;
        el.textContent = message;
        el.className = 'employee-form-feedback feedback-error';
    }

    function hideFeedback() {
        var el = document.getElementById('acuerdo-feedback');
        if (!el) return;
        el.textContent = '';
        el.className = 'employee-form-feedback hidden';
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    return {
        init: init,
        show: show,
        hide: hide
    };
})();
