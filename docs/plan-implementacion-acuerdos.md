# Plan de Implementación — Módulo Acuerdos de Participación

> Acuerdo de Participación en Actividad Ocupacional (RD 2274/1985)
> Proyecto "Punto Inclusivo" — Fundación Ámbitos / EcoÁmbitos

---

## Contexto definitivo

| Aspecto | Decisión |
|---------|----------|
| Tipo de documento | Acuerdo de Participación en Actividad Ocupacional (RD 2274/1985) |
| Firmante participante | Residente autenticado con PIN (sesión activa en kiosco) |
| Firmante fundación | Representante autorizado (psicólogo/integradora) presente en el momento |
| Incentivo | Proporcional a horas trabajadas / total horas equipo × comisión mensual SEUR |
| Validez firma | Firma Electrónica Simple (FES) — PIN + timestamp + hash doc + audit_log |
| Almacenamiento | PNG firmas → Supabase Storage (bucket privado) + URL en `kiosk_contracts` |
| Lo que NO es | Contrato laboral. Cláusula explícita en el documento. |

---

## Resumen del flujo

```
ADMIN (panel Acuerdos)
  → Selecciona empleado
  → Rellena datos del acuerdo (actividad, vigencia)
  → Crea → status: pending_participant

KIOSCO (screen-acuerdo) — PARTICIPANTE
  → Paso 1: Lee resumen en lenguaje fácil
  → Paso 2: Firma en canvas
  → Paso 3: Confirma firma ("¿Es esta tu firma?")
  → status: pending_admin

KIOSCO (screen-acuerdo) — ADMIN CO-FIRMA
  → Firma en canvas como representante de la Fundación
  → Confirma
  → status: signed ✓

Ambas imágenes PNG → Supabase Storage
Registro en kiosk_audit_log
```

---

## Archivos a crear

### 1. `js/contract.js` — Módulo IIFE

```javascript
var Contract = (function () {
    'use strict';

    // ── Estado ──────────────────────────────────────
    var currentContractId = null;
    var participantPad = null;   // SignaturePad instancia participante
    var adminPad = null;         // SignaturePad instancia admin
    var currentStep = 'summary'; // 'summary'|'p-sign'|'p-preview'|'a-sign'|'a-preview'|'done'

    // ── DOM refs ─────────────────────────────────────
    var steps = {};
    var pCanvas, aCanvas;

    // ── Init ─────────────────────────────────────────
    function init() {
        // Cachear todos los steps
        steps = {
            summary:   document.getElementById('acuerdo-step-summary'),
            pSign:     document.getElementById('acuerdo-step-p-sign'),
            pPreview:  document.getElementById('acuerdo-step-p-preview'),
            aSign:     document.getElementById('acuerdo-step-a-sign'),
            aPreview:  document.getElementById('acuerdo-step-a-preview'),
            done:      document.getElementById('acuerdo-step-done')
        };

        pCanvas = document.getElementById('acuerdo-canvas-participant');
        aCanvas = document.getElementById('acuerdo-canvas-admin');

        // Botones participante
        Utils.bindPress(document.getElementById('acuerdo-btn-go-sign'), goToParticipantSign);
        Utils.bindPress(document.getElementById('acuerdo-btn-p-clear'), function () {
            if (participantPad) participantPad.clear();
            document.getElementById('acuerdo-btn-p-confirm').disabled = true;
        });
        Utils.bindPress(document.getElementById('acuerdo-btn-p-confirm'), goToParticipantPreview);
        Utils.bindPress(document.getElementById('acuerdo-btn-p-redo'), goToParticipantSign);
        Utils.bindPress(document.getElementById('acuerdo-btn-p-ok'), goToAdminSign);

        // Botones admin
        Utils.bindPress(document.getElementById('acuerdo-btn-a-clear'), function () {
            if (adminPad) adminPad.clear();
            document.getElementById('acuerdo-btn-a-confirm').disabled = true;
        });
        Utils.bindPress(document.getElementById('acuerdo-btn-a-confirm'), goToAdminPreview);
        Utils.bindPress(document.getElementById('acuerdo-btn-a-redo'), goToAdminSign);
        Utils.bindPress(document.getElementById('acuerdo-btn-a-ok'), submitBothSignatures);
        Utils.bindPress(document.getElementById('acuerdo-btn-done'), function () {
            App.navigate('screen-admin');
        });

        window.addEventListener('resize', resizeAllCanvases);
    }

    // ── Lifecycle ─────────────────────────────────────
    function show(contractId) {
        currentContractId = contractId;
        goToSummary();
        loadContractData(contractId);
        initSignaturePads();
    }

    function hide() {
        if (participantPad) participantPad.clear();
        if (adminPad) adminPad.clear();
        currentStep = 'summary';
        currentContractId = null;
    }

    // ── Carga datos ───────────────────────────────────
    function loadContractData(contractId) {
        Api.getContract(contractId).then(function (res) {
            if (!res || !res.success || !res.data) return;
            var d = res.data;
            document.getElementById('acuerdo-title').textContent = d.title || 'Acuerdo de Participación';
            document.getElementById('acuerdo-activity').textContent = d.activity_description || '';
            document.getElementById('acuerdo-schedule').textContent = d.schedule || '';
            document.getElementById('acuerdo-employee-name').textContent = d.employee_name || '';
            document.getElementById('acuerdo-validity').textContent = d.validity_text || '';
        });
    }

    // ── Pads ──────────────────────────────────────────
    function initSignaturePads() {
        if (typeof SignaturePad === 'undefined') return;

        resizeCanvas(pCanvas);
        resizeCanvas(aCanvas);

        participantPad = new SignaturePad(pCanvas, {
            minWidth: 2.0, maxWidth: 4.0,
            penColor: '#000000',
            backgroundColor: 'rgba(0,0,0,0)'
        });
        participantPad.addEventListener('endStroke', function () {
            document.getElementById('acuerdo-btn-p-confirm').disabled = participantPad.isEmpty();
        });

        adminPad = new SignaturePad(aCanvas, {
            minWidth: 2.0, maxWidth: 4.0,
            penColor: '#000000',
            backgroundColor: 'rgba(0,0,0,0)'
        });
        adminPad.addEventListener('endStroke', function () {
            document.getElementById('acuerdo-btn-a-confirm').disabled = adminPad.isEmpty();
        });
    }

    function resizeCanvas(canvas) {
        if (!canvas) return;
        var ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width  = canvas.offsetWidth  * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d').scale(ratio, ratio);
    }

    function resizeAllCanvases() {
        resizeCanvas(pCanvas);
        resizeCanvas(aCanvas);
        if (participantPad) participantPad.clear();
        if (adminPad) adminPad.clear();
    }

    // ── Navegación de pasos ───────────────────────────
    function goToSummary()           { showStep('summary'); }
    function goToParticipantSign()   {
        if (participantPad) participantPad.clear();
        document.getElementById('acuerdo-btn-p-confirm').disabled = true;
        showStep('pSign');
    }
    function goToParticipantPreview() {
        if (!participantPad || participantPad.isEmpty()) return;
        var img = document.getElementById('acuerdo-preview-participant');
        img.src = participantPad.toDataURL('image/png');
        showStep('pPreview');
    }
    function goToAdminSign() {
        if (adminPad) adminPad.clear();
        document.getElementById('acuerdo-btn-a-confirm').disabled = true;
        showStep('aSign');
    }
    function goToAdminPreview() {
        if (!adminPad || adminPad.isEmpty()) return;
        var img = document.getElementById('acuerdo-preview-admin');
        img.src = adminPad.toDataURL('image/png');
        showStep('aPreview');
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
        var map = { summary: 1, pSign: 2, pPreview: 2, aSign: 3, aPreview: 3, done: 4 };
        var current = map[step] || 1;
        document.querySelectorAll('.acuerdo-step-dot').forEach(function (dot, i) {
            dot.classList.toggle('active', i + 1 <= current);
            dot.classList.toggle('current', i + 1 === current);
        });
    }

    // ── Envío ─────────────────────────────────────────
    function submitBothSignatures() {
        var session = App.getSession();
        if (!session || !currentContractId) return;

        var btn = document.getElementById('acuerdo-btn-a-ok');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        var participantImg = participantPad.toDataURL('image/png');
        var adminImg       = adminPad.toDataURL('image/png');
        var signedAt       = new Date().toISOString();

        Api.signContract({
            contractId:         currentContractId,
            participantSignImg: participantImg,
            adminSignImg:       adminImg,
            signedAt:           signedAt,
            adminSessionId:     session.employeeProfileId
        }).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Sí, correcto';
            if (res && res.success) {
                showStep('done');
            } else {
                showFeedback(res && res.message || 'Error al guardar. Inténtalo de nuevo.');
            }
        });
    }

    function showFeedback(msg) {
        var el = document.getElementById('acuerdo-feedback');
        el.textContent = msg;
        el.classList.remove('hidden');
        setTimeout(function () { el.classList.add('hidden'); }, 4000);
    }

    return { init: init, show: show, hide: hide };
})();
```

---

### 2. HTML — Tab "Acuerdos" en screen-admin

Añadir en `index.html`:

**a) En `<nav class="admin-tabs">`** — añadir tercer botón:
```html
<button class="admin-tab" data-tab="admin-acuerdos">Acuerdos</button>
```

**b) Nuevo `<div class="admin-section hidden" id="admin-acuerdos">`** — tras la sección de empleados:
```html
<!-- Admin: Acuerdos -->
<div class="admin-section hidden" id="admin-acuerdos">

    <button class="btn-add-emp" id="admin-acuerdo-nuevo" type="button">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Nuevo acuerdo
    </button>

    <!-- Formulario nuevo acuerdo (colapsable) -->
    <div class="admin-emp-form-wrap hidden" id="admin-acuerdo-form-wrap">
        <div class="employee-form">
            <div class="form-row">
                <label for="acuerdo-emp-select">Participante</label>
                <select id="acuerdo-emp-select">
                    <option value="">Seleccionar participante...</option>
                </select>
            </div>
            <div class="form-row">
                <label for="acuerdo-actividad">Actividad</label>
                <input type="text" id="acuerdo-actividad"
                       value="Gestión del Punto de Entrega SEUR — Punto Inclusivo"
                       placeholder="Descripción de la actividad">
            </div>
            <div class="form-row">
                <label for="acuerdo-horario">Horario</label>
                <input type="text" id="acuerdo-horario"
                       placeholder="Ej: según turnos asignados semanalmente">
            </div>
            <div class="form-row">
                <label for="acuerdo-vigencia">Vigencia</label>
                <input type="text" id="acuerdo-vigencia"
                       placeholder="Ej: 3 meses, renovable">
            </div>
            <div class="form-row">
                <label for="acuerdo-representante">Representante de la Fundación</label>
                <input type="text" id="acuerdo-representante"
                       placeholder="Nombre y cargo">
            </div>
            <button class="btn-primary btn-full" id="admin-acuerdo-crear">
                Crear acuerdo
            </button>
            <div class="employee-form-feedback hidden" id="acuerdo-form-feedback"></div>
        </div>
    </div>

    <!-- Lista de acuerdos -->
    <div id="admin-acuerdo-list" class="employee-list">
        <p class="loading-text">Cargando acuerdos...</p>
    </div>
</div>
```

---

### 3. HTML — Screen `screen-acuerdo` (pantalla de firma)

Añadir como nueva pantalla en `index.html` (antes del PIN error toast):

```html
<!-- ============================================ -->
<!-- SCREEN: ACUERDO DE PARTICIPACIÓN            -->
<!-- ============================================ -->
<div id="screen-acuerdo" class="screen">
    <header class="screen-header">
        <button class="back-btn" id="acuerdo-back-btn" aria-label="Volver">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
            </svg>
        </button>
        <h2 id="acuerdo-header-title">Acuerdo de Participación</h2>
    </header>

    <!-- Indicador de pasos -->
    <div class="acuerdo-steps-bar">
        <div class="acuerdo-step-dot active current" title="Leer"></div>
        <div class="acuerdo-step-line"></div>
        <div class="acuerdo-step-dot" title="Tu firma"></div>
        <div class="acuerdo-step-line"></div>
        <div class="acuerdo-step-dot" title="Firma Fundación"></div>
        <div class="acuerdo-step-line"></div>
        <div class="acuerdo-step-dot" title="Listo"></div>
    </div>

    <div class="screen-container acuerdo-container">

        <!-- ── PASO 1: Resumen del acuerdo ── -->
        <div id="acuerdo-step-summary" class="acuerdo-step">
            <div class="acuerdo-doc-card">
                <div class="acuerdo-doc-header">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    <h3 id="acuerdo-title">Acuerdo de Participación</h3>
                </div>

                <div class="acuerdo-doc-body">
                    <div class="acuerdo-field">
                        <span class="acuerdo-field-label">Participante</span>
                        <span class="acuerdo-field-value" id="acuerdo-employee-name">—</span>
                    </div>
                    <div class="acuerdo-field">
                        <span class="acuerdo-field-label">Actividad</span>
                        <span class="acuerdo-field-value" id="acuerdo-activity">—</span>
                    </div>
                    <div class="acuerdo-field">
                        <span class="acuerdo-field-label">Horario</span>
                        <span class="acuerdo-field-value" id="acuerdo-schedule">—</span>
                    </div>
                    <div class="acuerdo-field">
                        <span class="acuerdo-field-label">Vigencia</span>
                        <span class="acuerdo-field-value" id="acuerdo-validity">—</span>
                    </div>

                    <div class="acuerdo-notice">
                        <strong>Tu gratificación:</strong> Cada mes recibirás
                        una parte de lo que paga SEUR, proporcional
                        a las horas que hayas trabajado ese mes.
                    </div>
                    <div class="acuerdo-notice acuerdo-notice--gray">
                        Esta actividad es <strong>voluntaria</strong> y
                        <strong>no crea una relación laboral</strong>
                        (RD 2274/1985).
                    </div>
                </div>
            </div>

            <button id="acuerdo-btn-go-sign" class="btn-primary btn-full btn-xlarge">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                Lo entiendo — Ir a firmar
            </button>
        </div>

        <!-- ── PASO 2: Firma del participante ── -->
        <div id="acuerdo-step-p-sign" class="acuerdo-step hidden">
            <div class="sign-instruction">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                <span>Firma aquí con tu dedo</span>
            </div>

            <div class="sign-canvas-wrap">
                <canvas id="acuerdo-canvas-participant" class="sign-canvas" aria-label="Área de firma"></canvas>
                <div class="sign-guide-line"></div>
            </div>

            <div class="sign-actions">
                <button id="acuerdo-btn-p-clear" class="btn-secondary btn-xlarge">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
                    </svg>
                    Borrar
                </button>
                <button id="acuerdo-btn-p-confirm" class="btn-primary btn-xlarge" disabled>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Confirmar
                </button>
            </div>
        </div>

        <!-- ── PASO 3: Vista previa firma participante ── -->
        <div id="acuerdo-step-p-preview" class="acuerdo-step hidden">
            <p class="preview-question">¿Es esta tu firma?</p>
            <div class="preview-img-wrap">
                <img id="acuerdo-preview-participant" alt="Tu firma" class="preview-img"/>
            </div>
            <div class="sign-actions">
                <button id="acuerdo-btn-p-redo" class="btn-secondary btn-xlarge">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
                    </svg>
                    No, repetir
                </button>
                <button id="acuerdo-btn-p-ok" class="btn-primary btn-xlarge">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Sí, es correcta
                </button>
            </div>
        </div>

        <!-- ── PASO 4: Firma del admin/representante ── -->
        <div id="acuerdo-step-a-sign" class="acuerdo-step hidden">
            <div class="sign-instruction sign-instruction--admin">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>Firma del representante de la Fundación</span>
            </div>

            <div class="sign-canvas-wrap">
                <canvas id="acuerdo-canvas-admin" class="sign-canvas" aria-label="Área de firma representante"></canvas>
                <div class="sign-guide-line"></div>
            </div>

            <div class="sign-actions">
                <button id="acuerdo-btn-a-clear" class="btn-secondary btn-xlarge">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
                    </svg>
                    Borrar
                </button>
                <button id="acuerdo-btn-a-confirm" class="btn-primary btn-xlarge" disabled>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Confirmar
                </button>
            </div>
        </div>

        <!-- ── PASO 5: Vista previa firma admin ── -->
        <div id="acuerdo-step-a-preview" class="acuerdo-step hidden">
            <p class="preview-question">¿Es correcta tu firma?</p>
            <div class="preview-img-wrap">
                <img id="acuerdo-preview-admin" alt="Firma representante" class="preview-img"/>
            </div>
            <div class="sign-actions">
                <button id="acuerdo-btn-a-redo" class="btn-secondary btn-xlarge">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
                    </svg>
                    No, repetir
                </button>
                <button id="acuerdo-btn-a-ok" class="btn-primary btn-xlarge">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Sí, correcto
                </button>
            </div>
        </div>

        <!-- ── DONE: Éxito ── -->
        <div id="acuerdo-step-done" class="acuerdo-step hidden">
            <div class="acuerdo-success">
                <div class="acuerdo-success-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                </div>
                <h3 class="acuerdo-success-title">¡Acuerdo firmado!</h3>
                <p class="acuerdo-success-sub">
                    Las dos firmas han quedado guardadas correctamente.
                </p>
                <button id="acuerdo-btn-done" class="btn-primary btn-full btn-xlarge">
                    Volver al inicio
                </button>
            </div>
        </div>

        <div class="employee-form-feedback hidden" id="acuerdo-feedback"></div>

    </div><!-- /acuerdo-container -->
</div><!-- /screen-acuerdo -->
```

---

### 4. CSS a añadir en `css/styles.css`

```css
/* ── SCREEN ACUERDO ──────────────────────────────── */
.acuerdo-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    overflow-y: auto;
    height: calc(100% - 56px - 40px); /* header + steps-bar */
}

/* Barra de pasos */
.acuerdo-steps-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 8px 24px;
    background: var(--color-surface, #f8f9fa);
    border-bottom: 1px solid rgba(0,0,0,0.08);
}
.acuerdo-step-dot {
    width: 16px; height: 16px;
    border-radius: 50%;
    background: #d1d5db;
    transition: background 0.3s, transform 0.3s;
    flex-shrink: 0;
}
.acuerdo-step-dot.active   { background: var(--color-blue, #2563eb); }
.acuerdo-step-dot.current  { transform: scale(1.3); }
.acuerdo-step-line {
    flex: 1; height: 2px;
    background: #d1d5db;
    max-width: 48px;
}

.acuerdo-step { display: flex; flex-direction: column; gap: 1rem; flex: 1; }
.acuerdo-step.hidden { display: none; }

/* Tarjeta documento */
.acuerdo-doc-card {
    background: #ffffff;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.acuerdo-doc-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: var(--color-blue, #2563eb);
    color: #fff;
}
.acuerdo-doc-header h3 {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
    color: #fff;
}
.acuerdo-doc-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; }

.acuerdo-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 10px;
    border-bottom: 1px solid #f1f5f9;
}
.acuerdo-field:last-of-type { border-bottom: none; padding-bottom: 0; }
.acuerdo-field-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
}
.acuerdo-field-value {
    font-size: 1rem;
    font-weight: 500;
    color: #1e293b;
}

.acuerdo-notice {
    background: #eff6ff;
    border-left: 4px solid var(--color-blue, #2563eb);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 0.95rem;
    line-height: 1.5;
    color: #1e40af;
}
.acuerdo-notice--gray {
    background: #f8fafc;
    border-left-color: #94a3b8;
    color: #475569;
}

/* Instrucción de firma */
.sign-instruction {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 1.25rem;
    font-weight: 700;
    color: #1e293b;
    padding: 8px 0;
}
.sign-instruction--admin { color: var(--color-blue, #2563eb); }

/* Canvas de firma */
.sign-canvas-wrap {
    position: relative;
    background: #ffffff;
    border: 3px solid var(--color-blue, #2563eb);
    border-radius: 12px;
    overflow: hidden;
    min-height: 180px;
    flex: 1;
}
.sign-canvas {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 180px;
    touch-action: none;
    cursor: crosshair;
}
.sign-guide-line {
    position: absolute;
    bottom: 28%;
    left: 5%;
    right: 5%;
    height: 1px;
    border-bottom: 2px dashed #cbd5e1;
    pointer-events: none;
}

/* Botones de acción firma */
.sign-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

/* Botón extra grande (firma) */
.btn-xlarge {
    min-height: 64px !important;
    font-size: 1.05rem !important;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

/* Vista previa */
.preview-question {
    font-size: 1.4rem;
    font-weight: 700;
    text-align: center;
    color: #1e293b;
    margin: 0;
}
.preview-img-wrap {
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    flex: 1;
}
.preview-img {
    max-width: 100%;
    max-height: 180px;
    object-fit: contain;
}

/* Éxito */
.acuerdo-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    flex: 1;
    text-align: center;
    padding: 2rem 0;
}
.acuerdo-success-icon {
    width: 96px; height: 96px;
    border-radius: 50%;
    background: #dcfce7;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-green, #16a34a);
    animation: pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.acuerdo-success-title {
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--color-green, #16a34a);
    margin: 0;
}
.acuerdo-success-sub {
    font-size: 1rem;
    color: #64748b;
    margin: 0;
}

@keyframes pop-in {
    0%   { transform: scale(0); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
}

/* ── ADMIN TAB: Acuerdos ──────────────────────────── */
.acuerdo-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 12px;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    margin-bottom: 8px;
}
.acuerdo-row-info { flex: 1; }
.acuerdo-row-name { font-weight: 700; font-size: 1rem; color: #1e293b; }
.acuerdo-row-date { font-size: 0.8rem; color: #64748b; margin-top: 2px; }
.acuerdo-status {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 20px;
    text-transform: uppercase;
}
.acuerdo-status--pending   { background: #fef9c3; color: #854d0e; }
.acuerdo-status--signed    { background: #dcfce7; color: #166534; }
.acuerdo-status--partial   { background: #ffedd5; color: #9a3412; }

.btn-acuerdo-iniciar {
    background: var(--color-blue, #2563eb);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    min-height: 48px;
    white-space: nowrap;
}
```

---

### 5. Cambios en `js/api.js`

Añadir al final del módulo Api, antes del `return`:

```javascript
function getContract(contractId) {
    return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
        orgSlug: ORG_SLUG, action: 'get', contractId: contractId
    }, { requiresAuth: true });
}

function getContractsByEmployee(employeeId) {
    return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
        orgSlug: ORG_SLUG, action: 'list', employeeId: employeeId
    }, { requiresAuth: true });
}

function createContract(data) {
    return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
        orgSlug: ORG_SLUG, action: 'create', ...data
    }, { requiresAuth: true });
}

function signContract(data) {
    return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
        orgSlug: ORG_SLUG, action: 'sign', ...data
    }, { requiresAuth: true });
}

function listAllContracts() {
    return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
        orgSlug: ORG_SLUG, action: 'list-all'
    }, { requiresAuth: true });
}
```

Y en el `return { ... }` añadir:
```javascript
getContract: getContract,
getContractsByEmployee: getContractsByEmployee,
createContract: createContract,
signContract: signContract,
listAllContracts: listAllContracts,
```

---

### 6. Cambios en `js/app.js`

```javascript
// En init():
Contract.init();   // añadir tras Admin.init()

// En navigate():
if (screenId === 'screen-acuerdo') Contract.show(App._pendingContractId);

// En el bloque de cleanup al salir:
if (currentScreen === 'screen-acuerdo') Contract.hide();
```

Añadir helper en App para pasar el contractId:
```javascript
// Nuevo método público:
function navigateToContract(contractId) {
    App._pendingContractId = contractId;
    navigate('screen-acuerdo');
}
// En return { ... }:
navigateToContract: navigateToContract,
```

---

### 7. Cambios en `index.html` — carga de scripts

Antes de `<script src="js/app.js"></script>`:
```html
<script src="vendor/signature_pad/signature_pad.umd.min.js"></script>
<script src="js/contract.js"></script>
```

---

### 8. Cambios en `sw.js`

```javascript
// Línea 1:
var CACHE_NAME = 'pickup-tmg-v70';  // era v69

// Añadir en FILES_TO_CACHE:
'./vendor/signature_pad/signature_pad.umd.min.js',
'./js/contract.js',
```

---

### 9. Migración SQL

`supabase/migrations/20260330120000_add_kiosk_contracts.sql`:

```sql
-- Tabla de acuerdos de participación
CREATE TABLE public.kiosk_contracts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL,
    employee_id           UUID NOT NULL REFERENCES public.kiosk_employees(id) ON DELETE CASCADE,

    -- Contenido
    title                 TEXT NOT NULL DEFAULT 'Acuerdo de Participación en Actividad Ocupacional',
    activity_description  TEXT NOT NULL,
    schedule              TEXT NOT NULL DEFAULT 'Según turnos asignados semanalmente',
    validity_text         TEXT NOT NULL DEFAULT '3 meses, renovable',
    representative_name   TEXT NOT NULL,  -- quién firma por la Fundación

    -- Estado
    status                TEXT NOT NULL DEFAULT 'pending_participant',
                          -- pending_participant | pending_admin | signed | cancelled

    -- Firma participante
    participant_sign_url  TEXT,           -- URL en Supabase Storage
    participant_signed_at TIMESTAMPTZ,

    -- Firma admin/representante
    admin_sign_url        TEXT,           -- URL en Supabase Storage
    admin_signed_at       TIMESTAMPTZ,
    admin_session_id      UUID,           -- sesión del admin que co-firmó

    -- Evidencia FES
    document_hash         TEXT,           -- SHA-256 del contenido del acuerdo
    employee_pin_verified BOOLEAN DEFAULT FALSE,

    -- Auditoría
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_kiosk_contracts_employee ON public.kiosk_contracts(employee_id);
CREATE INDEX idx_kiosk_contracts_status   ON public.kiosk_contracts(status);
CREATE INDEX idx_kiosk_contracts_org      ON public.kiosk_contracts(organization_id);

-- Trigger updated_at
CREATE TRIGGER update_kiosk_contracts_updated_at
    BEFORE UPDATE ON public.kiosk_contracts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS (service role bypasses)
ALTER TABLE public.kiosk_contracts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.kiosk_contracts IS
    'Acuerdos de participación en actividad ocupacional (RD 2274/1985) — Proyecto Punto Inclusivo';
```

Supabase Storage — bucket para firmas (ejecutar una vez desde dashboard o CLI):
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contract-signatures', 'contract-signatures', false, 524288, ARRAY['image/png']);
```

---

### 10. Edge Function `kiosk-contract`

`supabase/functions/kiosk-contract/index.ts` — acciones:

| Acción | Quién | Qué hace |
|--------|-------|----------|
| `create` | Admin | Crea acuerdo con status `pending_participant` |
| `get` | Cualquiera autenticado | Devuelve datos del acuerdo para mostrar en pantalla |
| `list-all` | Admin | Lista todos los acuerdos de la org |
| `sign` | Admin (presente) | Recibe ambas imágenes PNG en base64, las sube a Storage, actualiza status a `signed`, registra en `kiosk_audit_log` |

La lógica de `sign`:
```typescript
// 1. Recibir participant_sign_img y admin_sign_img (base64 PNG)
// 2. Subir ambas a Supabase Storage bucket 'contract-signatures'
//    path: {orgId}/{contractId}/participant.png y /admin.png
// 3. Calcular SHA-256 del contenido del acuerdo (title + activity + schedule + validity)
// 4. UPDATE kiosk_contracts SET
//      participant_sign_url, participant_signed_at,
//      admin_sign_url, admin_signed_at,
//      document_hash, employee_pin_verified=true,
//      status='signed'
// 5. INSERT kiosk_audit_log action='contract_signed'
```

---

## Orden de implementación

```
1. SQL migration → supabase db push
2. Crear bucket 'contract-signatures' en Supabase Storage
3. Descargar signature_pad → vendor/signature_pad/
4. Crear supabase/functions/kiosk-contract/index.ts
5. Añadir CSS en styles.css
6. Añadir tab "Acuerdos" en admin screen (index.html)
7. Añadir screen-acuerdo (index.html)
8. Añadir scripts en index.html
9. Crear js/contract.js
10. Actualizar js/api.js
11. Actualizar js/app.js
12. Actualizar sw.js (v70 + FILES_TO_CACHE)
13. Wiring en admin.js (cargar lista de acuerdos en tab, botón iniciar)
14. Deploy: supabase functions deploy kiosk-contract
```

---

## Lo que NO cambia

- Lógica de pagos (`kiosk-payment`, `kiosk_payment_months`, `kiosk_payment_settlements`) → intacta
- Lógica de fichajes (`kiosk-clock`, `kiosk_attendance`) → intacta
- Lógica de horarios (`kiosk-schedule`, `kiosk_schedule_slots`) → intacta
- Autenticación PIN → intacta
- Service Worker offline → se mantiene, solo bump de versión
- Todos los módulos existentes → sin cambios excepto `api.js`, `app.js` y `admin.js` (adiciones mínimas)
