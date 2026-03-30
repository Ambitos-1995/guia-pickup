# Módulo de Firma de Contratos TMG

Documento de planificación para añadir firma digital de contratos de terapia ocupacional al kiosco PWA. Cubre el marco legal, la arquitectura técnica y las consideraciones de accesibilidad para personas con Trastorno Mental Grave (TMG).

---

## 1. Marco legal

### 1.1 Legislación aplicable

| Norma | Qué regula |
|-------|-----------|
| **RDL 1/2013** — Ley General de Discapacidad | Cuota del 2% en empresas >50 trabajadores; reconoce CEE y centros ocupacionales |
| **RD 870/2007** — Empleo con Apoyo | Preparadores laborales, subvenciones de hasta 30 meses para empleos con apoyo |
| **Ley 8/2021** — Capacidad Jurídica | Elimina la incapacitación judicial; toda persona con TMG conserva **capacidad jurídica plena** con medidas de apoyo graduadas |
| **Ley 6/2023** — Salud Mental | Marco autonómico complementario |
| **Reglamento eIDAS (UE 910/2014)** | Define tres niveles de firma electrónica válidos en toda la UE |
| **Ley 6/2020** (España) | Adapta eIDAS al ordenamiento español; reconoce la firma electrónica simple como prueba |

### 1.2 Incentivos económicos vigentes (2025–2026)

Bonificaciones a la Seguridad Social por contratación indefinida de personas con discapacidad (incluye TMG):

| Colectivo | Edad | Hombres | Mujeres |
|-----------|------|---------|---------|
| Discapacidad general (≥33%) | <45 años | 4.500 €/año | 5.350 €/año |
| **Discapacidad severa** (TMG ≥33%) | <45 años | **5.100 €/año** | **5.950 €/año** |
| Discapacidad severa | ≥45 años | **6.300 €/año** | **6.300 €/año** |

Centros Especiales de Empleo (CEE): subvención adicional del **50–55% del SMI** por puesto ocupado por persona con discapacidad severa.

### 1.3 Tipos de contrato aplicables

- **Contrato indefinido en CEE** — Relación laboral especial (RD 1368/1985). Principal modalidad.
- **Contrato indefinido ordinario** — Con bonificaciones a la SS para empleo ordinario con apoyo.
- **Contrato temporal en CEE** — Convertible a indefinido con bonificaciones adicionales.

### 1.4 Firma de contratos con personas con TMG — Ley 8/2021

La **Ley 8/2021** eliminó la incapacitación judicial y la tutela para adultos, sustituyéndolas por medidas de apoyo graduadas:

1. **Medidas voluntarias** — Establecidas por la propia persona (poderes preventivos).
2. **Guarda de hecho** — Apoyo informal, sin resolución judicial.
3. **Curatela asistencial** — El curador *acompaña* al acto; se requiere la concurrencia de ambas voluntades.
4. **Curatela representativa** — Medida excepcional; el curador actúa en representación.

> **Consecuencia práctica:** Un contrato firmado sin las medidas de apoyo previstas es *anulable* (no nulo) en un plazo de 4 años, solo si la persona no pudo formar consentimiento válido. No basta el hecho formal.

**Consentimiento informado válido requiere:**
1. Entender la información presentada.
2. Integrarla en su razonamiento.
3. Expresar una preferencia coherente.

---

## 2. Validez legal de la firma en tablet

### 2.1 Niveles de firma electrónica (eIDAS / Ley 6/2020)

| Tipo | Descripción | Peso probatorio |
|------|-------------|----------------|
| **Firma Electrónica Simple (FES)** | Datos electrónicos asociados a una persona | Válida como prueba; no rechazable en juicio solo por ser electrónica |
| **Firma Electrónica Avanzada (FEA)** | Vinculada al firmante, detecta cambios posteriores | Mayor peso probatorio; requiere captura biométrica |
| **Firma Electrónica Cualificada (FEC)** | FEA + certificado cualificado (DNIe, FNMT) | Equivalente legal a firma manuscrita (art. 25.2 eIDAS) |

### 2.2 ¿Qué nivel se necesita?

Para contratos privados en CEE o terapia ocupacional, una **Firma Electrónica Simple reforzada** es legalmente suficiente si se acompaña de:

- Timestamp del momento de la firma
- Identificación del firmante (PIN del kiosco ya registrado)
- IP o identificador del dispositivo
- Hash del documento firmado (integridad)
- Registro de auditoría inalterable en base de datos

> La firma digitalizada (imagen sola sin metadatos) **no tiene validez legal**. La combinación firma + evidencias complementarias sí la tiene.

---

## 3. Biblioteca de firma — `signature_pad`

**Librería recomendada:** [`signature_pad`](https://github.com/szimek/signature_pad) por szimek.

### 3.1 Por qué esta librería

| Aspecto | Detalle |
|---------|---------|
| Tamaño | ~26 KB minificado / ~10 KB gzip |
| CDN | `https://cdn.jsdelivr.net/npm/signature_pad@5.1.2/dist/signature_pad.umd.min.js` |
| Dependencias | **Cero** |
| Compatible vanilla JS | Sí — formato UMD, funciona con `<script>` directo |
| Táctil / tablet | Completo: touch events, mouse events, soporte DPI alto (`devicePixelRatio`) |
| Exporta | PNG, JPEG, SVG, base64, array de puntos serializables |
| Licencia | MIT |

Encaja perfectamente con el patrón IIFE sin bundler del proyecto.

### 3.2 Integración básica

```html
<!-- Cargar desde vendor/ (offline) -->
<script src="vendor/signature_pad/signature_pad.umd.min.js"></script>
```

```javascript
var canvas = document.getElementById('signature-canvas');
var pad = new SignaturePad(canvas, {
    minWidth: 2.0,       // trazo más grueso para temblor
    maxWidth: 4.0,
    penColor: '#000000', // negro sobre blanco, máximo contraste
    backgroundColor: 'rgba(0,0,0,0)'
});

// Exportar como PNG base64
var dataUrl = pad.toDataURL('image/png');

// Verificar si está vacío
if (pad.isEmpty()) { /* pedir que firme */ }

// Limpiar
pad.clear();
```

### 3.3 Descarga para vendor/

```bash
# Descargar y colocar en vendor/
mkdir -p vendor/signature_pad
curl -L "https://cdn.jsdelivr.net/npm/signature_pad@5.1.2/dist/signature_pad.umd.min.js" \
     -o vendor/signature_pad/signature_pad.umd.min.js
```

---

## 4. Arquitectura del módulo

### 4.1 Nuevos archivos

```
js/contract.js                   ← módulo IIFE nuevo
vendor/signature_pad/
  signature_pad.umd.min.js       ← librería offline
supabase/
  functions/kiosk-contract/
    index.ts                     ← Edge Function nueva
  migrations/
    YYYYMMDDHHMMSS_add_kiosk_contracts.sql
```

### 4.2 Cambios en archivos existentes

| Archivo | Cambio |
|---------|--------|
| `index.html` | Nueva pantalla `#screen-contract` + carga de scripts |
| `js/app.js` | `Contract.init()` en `init()`, routing en `navigate()` |
| `sw.js` | Añadir `js/contract.js` y `vendor/signature_pad/...` a `FILES_TO_CACHE` + bump de versión |

### 4.3 Pantalla HTML

```html
<!-- ============================================ -->
<!-- SCREEN: CONTRATO                             -->
<!-- ============================================ -->
<div id="screen-contract" class="screen">
    <header class="screen-header">
        <button class="back-btn" data-back="screen-menu" aria-label="Volver">
            <!-- icono SVG volver -->
        </button>
        <h2>Contrato</h2>
    </header>

    <div class="screen-container contract-container">

        <!-- Paso 1: Resumen del contrato en lenguaje fácil -->
        <div id="contract-step-summary" class="contract-step">
            <div class="contract-summary-box">
                <h3 id="contract-title">Contrato de Terapia Ocupacional</h3>
                <div id="contract-summary-text" class="easy-read-text">
                    <!-- Texto simplificado del contrato -->
                </div>
            </div>
            <button id="contract-btn-go-sign" class="btn-primary btn-large">
                Entendido — Ir a firmar
            </button>
        </div>

        <!-- Paso 2: Zona de firma -->
        <div id="contract-step-sign" class="contract-step hidden">
            <p class="sign-instruction">
                <span class="sign-icon">✍️</span>
                Firma aquí con tu dedo
            </p>
            <div class="signature-area">
                <canvas id="signature-canvas"
                        aria-label="Área de firma"
                        role="img"></canvas>
                <div class="signature-guide-line"></div>
            </div>
            <div class="sign-actions">
                <button id="contract-btn-clear" class="btn-secondary btn-large">
                    Borrar y repetir
                </button>
                <button id="contract-btn-confirm" class="btn-primary btn-large" disabled>
                    Confirmar firma
                </button>
            </div>
        </div>

        <!-- Paso 3: Confirmación -->
        <div id="contract-step-preview" class="contract-step hidden">
            <p class="preview-question">¿Es esta tu firma?</p>
            <img id="signature-preview" alt="Vista previa de tu firma" />
            <div class="sign-actions">
                <button id="contract-btn-redo" class="btn-secondary btn-large">
                    No, repetir
                </button>
                <button id="contract-btn-submit" class="btn-primary btn-large">
                    Sí, es correcta
                </button>
            </div>
        </div>

        <!-- Feedback de envío -->
        <div id="contract-feedback" class="feedback hidden"></div>
    </div>
</div>
```

### 4.4 Módulo JS (`js/contract.js`)

Estructura IIFE siguiendo el patrón del proyecto:

```javascript
var Contract = (function () {
    'use strict';

    // Estado privado
    var signaturePad = null;
    var currentContractId = null;
    var currentStep = 'summary'; // 'summary' | 'sign' | 'preview'

    // Referencias DOM
    var stepSummary, stepSign, stepPreview;
    var canvas, btnGoSign, btnClear, btnConfirm;
    var btnRedo, btnSubmit, previewImg, feedbackEl;

    function init() {
        stepSummary   = document.getElementById('contract-step-summary');
        stepSign      = document.getElementById('contract-step-sign');
        stepPreview   = document.getElementById('contract-step-preview');
        canvas        = document.getElementById('signature-canvas');
        btnGoSign     = document.getElementById('contract-btn-go-sign');
        btnClear      = document.getElementById('contract-btn-clear');
        btnConfirm    = document.getElementById('contract-btn-confirm');
        btnRedo       = document.getElementById('contract-btn-redo');
        btnSubmit     = document.getElementById('contract-btn-submit');
        previewImg    = document.getElementById('signature-preview');
        feedbackEl    = document.getElementById('contract-feedback');

        Utils.bindPress(btnGoSign,   goToSign);
        Utils.bindPress(btnClear,    clearSignature);
        Utils.bindPress(btnConfirm,  goToPreview);
        Utils.bindPress(btnRedo,     goToSign);
        Utils.bindPress(btnSubmit,   submitContract);

        initSignaturePad();
    }

    function initSignaturePad() {
        // Ajustar DPI del canvas para pantallas de alta resolución
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        signaturePad = new SignaturePad(canvas, {
            minWidth: 2.0,
            maxWidth: 4.0,
            penColor: '#000000',
            backgroundColor: 'rgba(0,0,0,0)',
            throttle: 16,
            velocityFilterWeight: 0.7
        });

        // Habilitar botón Confirmar solo cuando hay firma
        signaturePad.addEventListener('endStroke', function () {
            btnConfirm.disabled = signaturePad.isEmpty();
        });
    }

    function resizeCanvas() {
        var ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width  = canvas.offsetWidth  * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d').scale(ratio, ratio);
        if (signaturePad) signaturePad.clear(); // limpiar tras redimensionar
    }

    function show() {
        var session = App.getSession();
        if (!session) {
            App.navigate('screen-pin');
            return;
        }
        goToSummary();
        loadPendingContract(session.employeeProfileId);
    }

    function hide() {
        if (signaturePad) signaturePad.clear();
        goToSummary();
    }

    function loadPendingContract(employeeProfileId) {
        Api.getContractPending(employeeProfileId).then(function (res) {
            if (res && res.success && res.data) {
                currentContractId = res.data.id;
                document.getElementById('contract-title').textContent = res.data.title;
                document.getElementById('contract-summary-text').innerHTML = res.data.summaryHtml;
            } else {
                // Sin contrato pendiente
                App.navigate('screen-menu');
            }
        });
    }

    function goToSummary() {
        showStep('summary');
    }

    function goToSign() {
        if (signaturePad) signaturePad.clear();
        btnConfirm.disabled = true;
        showStep('sign');
    }

    function goToPreview() {
        if (!signaturePad || signaturePad.isEmpty()) return;
        var dataUrl = signaturePad.toDataURL('image/png');
        previewImg.src = dataUrl;
        showStep('preview');
    }

    function clearSignature() {
        if (signaturePad) signaturePad.clear();
        btnConfirm.disabled = true;
    }

    function submitContract() {
        var session = App.getSession();
        if (!session || !currentContractId) return;

        var signatureDataUrl = signaturePad.toDataURL('image/png');
        var signaturePoints  = JSON.stringify(signaturePad.toData());

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Enviando...';

        Api.submitContractSignature({
            contractId:     currentContractId,
            employeeId:     session.employeeProfileId,
            signatureImage: signatureDataUrl,   // base64 PNG
            signatureData:  signaturePoints,    // array de puntos
            signedAt:       new Date().toISOString()
        }).then(function (res) {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Sí, es correcta';

            if (res && res.success) {
                showFeedback('success', '¡Contrato firmado correctamente!');
                setTimeout(function () { App.navigate('screen-menu'); }, 2000);
            } else {
                showFeedback('error', res && res.message || 'Error al enviar. Inténtalo de nuevo.');
            }
        });
    }

    function showStep(step) {
        currentStep = step;
        stepSummary.classList.toggle('hidden', step !== 'summary');
        stepSign.classList.toggle('hidden',    step !== 'sign');
        stepPreview.classList.toggle('hidden', step !== 'preview');
        feedbackEl.classList.add('hidden');
    }

    function showFeedback(type, message) {
        feedbackEl.textContent = message;
        feedbackEl.className = 'feedback feedback-' + type;
    }

    return { init: init, show: show, hide: hide };
})();
```

---

## 5. Base de datos

### 5.1 Tabla `kiosk_contracts`

```sql
CREATE TABLE public.kiosk_contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    employee_id     UUID NOT NULL REFERENCES public.kiosk_employees(id) ON DELETE CASCADE,

    -- Contenido del contrato
    title           TEXT NOT NULL,
    summary_html    TEXT NOT NULL,           -- versión en lenguaje fácil
    full_text       TEXT,                    -- texto legal completo
    contract_type   TEXT NOT NULL DEFAULT 'terapia_ocupacional',
                                             -- 'terapia_ocupacional' | 'empleo_apoyo' | 'cee_indefinido'

    -- Estado
    status          TEXT NOT NULL DEFAULT 'pending',
                                             -- 'pending' | 'signed' | 'rejected' | 'expired'

    -- Firma
    signature_image TEXT,                    -- base64 PNG de la firma
    signature_data  JSONB,                   -- array de puntos (signature_pad.toData())
    signed_at       TIMESTAMPTZ,
    signature_ip    TEXT,                    -- IP del dispositivo en el momento de la firma
    document_hash   TEXT,                    -- SHA-256 del full_text (integridad)

    -- Evidencia para firma electrónica simple
    employee_pin_verified BOOLEAN DEFAULT FALSE,  -- el empleado estaba autenticado con PIN
    kiosk_device_id       TEXT,

    -- Auditoría
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,             -- NULL = no expira

    CONSTRAINT fk_org FOREIGN KEY (organization_id)
        REFERENCES public.organizations(id) ON DELETE CASCADE
);

-- Índices
CREATE INDEX idx_kiosk_contracts_employee ON public.kiosk_contracts(employee_id);
CREATE INDEX idx_kiosk_contracts_status   ON public.kiosk_contracts(status);
CREATE INDEX idx_kiosk_contracts_org      ON public.kiosk_contracts(organization_id);

-- Trigger updated_at
CREATE TRIGGER update_kiosk_contracts_updated_at
    BEFORE UPDATE ON public.kiosk_contracts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.kiosk_contracts ENABLE ROW LEVEL SECURITY;

-- Solo service role puede escribir (Edge Functions usan service role)
-- Las funciones Edge leen/escriben sin restricción RLS
```

### 5.2 Registro en `kiosk_audit_log`

Cada firma debe registrarse en la tabla de auditoría existente para trazabilidad legal:

```sql
INSERT INTO public.kiosk_audit_log (
    organization_id, employee_id, action, metadata
) VALUES (
    $org_id, $employee_id, 'contract_signed',
    jsonb_build_object(
        'contract_id', $contract_id,
        'contract_type', $type,
        'signed_at', $signed_at,
        'document_hash', $hash,
        'device_id', $device
    )
);
```

---

## 6. Edge Function `kiosk-contract`

Endpoints via `action` en el body POST:

| Acción | Descripción |
|--------|-------------|
| `get_pending` | Devuelve el contrato pendiente de firma del empleado |
| `submit_signature` | Guarda la firma y marca el contrato como firmado |
| `list_signed` | (Admin) Lista contratos firmados por organización |

### 6.1 Acción `submit_signature`

```typescript
case 'submit_signature': {
    const { contractId, employeeId, signatureImage, signatureData, signedAt } = body;

    // 1. Obtener el contrato y verificar que está pendiente
    const { data: contract } = await supabase
        .from('kiosk_contracts')
        .select('*')
        .eq('id', contractId)
        .eq('employee_id', employeeId)
        .eq('status', 'pending')
        .single();

    if (!contract) {
        return json({ success: false, message: 'Contrato no encontrado o ya firmado' });
    }

    // 2. Calcular hash del documento para integridad
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(contract.full_text || ''));
    const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    // 3. Guardar firma
    await supabase.from('kiosk_contracts').update({
        status:               'signed',
        signature_image:      signatureImage,
        signature_data:       JSON.parse(signatureData),
        signed_at:            signedAt,
        document_hash:        hashHex,
        employee_pin_verified: true,
        kiosk_device_id:      req.headers.get('x-device-id') || null
    }).eq('id', contractId);

    // 4. Registrar en audit_log
    await supabase.from('kiosk_audit_log').insert({
        organization_id: contract.organization_id,
        employee_id:     employeeId,
        action:          'contract_signed',
        metadata: {
            contract_id:   contractId,
            contract_type: contract.contract_type,
            signed_at:     signedAt,
            document_hash: hashHex
        }
    });

    return json({ success: true, message: 'Contrato firmado correctamente' });
}
```

---

## 7. Accesibilidad para personas con TMG

### 7.1 Zona de firma

- **Tamaño mínimo**: 300×150 px en tablet (adaptable al ancho del contenedor)
- **Borde**: 3px sólido, alto contraste (ej. azul oscuro `#1a237e` sobre blanco)
- **Línea guía** punteada horizontal (como papel de firmar)
- **Trazo grueso** (`minWidth: 2.0`, `maxWidth: 4.0`) para facilitar el trazado con temblor
- Instrucción visible: icono de mano + texto en Lexend grande

### 7.2 Flujo de 3 pasos

1. **Resumen del contrato** — Lenguaje fácil (una idea por frase, sin jerga legal). Botón grande "Entendido — Ir a firmar".
2. **Zona de firma** — Canvas, botón "Borrar y repetir" (rojo), botón "Confirmar firma" (verde, deshabilitado hasta que haya trazo).
3. **Vista previa** — "¿Es esta tu firma?" con imagen grande. Opciones: "No, repetir" / "Sí, es correcta".

### 7.3 WCAG 2.2

| Criterio | Aplicación |
|----------|-----------|
| 2.5.7 Dragging Movements | **Exento** — la captura de firma es la operación en sí |
| 2.5.8 Target Size | Botones mínimo **48×48 px** |
| 3.3.7 Redundant Entry | No pedir datos ya conocidos (el empleado ya se autenticó con PIN) |
| 1.4.3 Contrast | Zona de firma blanco sobre fondo neutro, texto en Lexend negro |

### 7.4 Directrices COGA (discapacidad cognitiva)

- Máximo 2-3 elementos por pantalla
- Sin temporizadores ni animaciones innecesarias
- Confirmación visual clara (icono ✓ verde) al completar
- Botón de ayuda visible en cada paso

---

## 8. Seguridad y privacidad (GDPR)

- La imagen de firma es un **dato biométrico** (Art. 9 GDPR — categoría especial).
- Almacenar cifrada o con acceso restringido a service role.
- Incluir en la política de retención de datos (`organization_retention_settings`).
- El empleado debe haber dado consentimiento explícito previo (tabla `consents` ya existente).
- Añadir registro a `kiosk_audit_log` para trazabilidad completa.

---

## 9. Plan de implementación

### Fase 1 — Base (estimado: 1 sesión)
- [ ] Descargar `signature_pad.umd.min.js` a `vendor/signature_pad/`
- [ ] Crear migración SQL con tabla `kiosk_contracts`
- [ ] Crear `js/contract.js` con el módulo IIFE
- [ ] Añadir pantalla `#screen-contract` en `index.html`
- [ ] Wiring en `app.js` (init + navigate + canAccessScreen)
- [ ] Bump de versión en `sw.js` + actualizar `FILES_TO_CACHE`

### Fase 2 — Backend (estimado: 1 sesión)
- [ ] Crear Edge Function `kiosk-contract` con acciones `get_pending` y `submit_signature`
- [ ] Añadir `Api.getContractPending()` y `Api.submitContractSignature()` en `api.js`
- [ ] Desplegar función: `supabase functions deploy kiosk-contract`

### Fase 3 — Admin y pulido (estimado: 1 sesión)
- [ ] Panel de admin: listado de contratos pendientes y firmados
- [ ] CSS accesible: zona de firma, botones grandes, flujo de 3 pasos
- [ ] Prueba en tablet real con usuario TMG
- [ ] Revisar advisors de Supabase tras migración

---

## 10. Referencias

- [RDL 1/2013 — Ley General de Discapacidad](https://www.boe.es/buscar/act.php?id=BOE-A-2013-12632)
- [RD 870/2007 — Empleo con Apoyo](https://www.boe.es/buscar/doc.php?id=BOE-A-2007-13588)
- [Ley 8/2021 — Capacidad Jurídica](https://www.boe.es/buscar/act.php?id=BOE-A-2021-9233)
- [Reglamento eIDAS UE 910/2014](https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A32014R0910)
- [signature_pad — GitHub](https://github.com/szimek/signature_pad)
- [W3C COGA — Accesibilidad cognitiva](https://www.w3.org/TR/coga-usable/)
- [Issue #21368 — Bug nombre "supabase" en MCP](https://github.com/anthropics/claude-code/issues/21368)
