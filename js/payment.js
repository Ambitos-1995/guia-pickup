/* =====================================================
   PAYMENT - Employee payment summary + receipt view
   ===================================================== */
var Payment = (function () {
    'use strict';

    var currentYear, currentMonth;
    var labelEl, hoursEl, totalEl, noteEl, statusEl;
    var currentReceipt = null;

    /* ─────────────────────────────────────────────────── */
    /*  Init & show                                        */
    /* ─────────────────────────────────────────────────── */

    function init() {
        labelEl = document.getElementById('pay-month-label');
        hoursEl = document.getElementById('pay-hours');
        totalEl = document.getElementById('pay-total');
        noteEl = document.getElementById('payment-note');
        statusEl = document.getElementById('payment-status');

        Utils.bindPress(document.getElementById('pay-month-prev'), function () {
            changeMonth(-1);
        });
        Utils.bindPress(document.getElementById('pay-month-next'), function () {
            changeMonth(1);
        });
    }

    function show() {
        var session = App.getSession();
        if (!session) {
            Pin.openForLogin('screen-menu', 'screen-menu');
            App.navigate('screen-pin');
            return;
        }

        var now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth() + 1;
        loadMonth();
    }

    /* ─────────────────────────────────────────────────── */
    /*  Month navigation & loading                         */
    /* ─────────────────────────────────────────────────── */

    function changeMonth(delta) {
        currentReceipt = null;
        currentMonth += delta;
        if (currentMonth < 1) {
            currentYear--;
            currentMonth = 12;
        } else if (currentMonth > 12) {
            currentYear++;
            currentMonth = 1;
        }
        loadMonth();
    }

    function animateValue(el, endText, duration) {
        var match = endText.match(/^([\d.]+)/);
        if (!match) { el.textContent = endText; return; }
        var endVal = parseFloat(match[1]);
        var suffix = endText.substring(match[1].length);
        var isDecimal = endText.indexOf('.') !== -1;
        var startTime = null;
        var dur = duration || 600;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / dur, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = eased * endVal;
            el.textContent = (isDecimal ? current.toFixed(2) : Math.round(current)) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function loadMonth() {
        labelEl.textContent = Utils.MONTH_NAMES[currentMonth - 1] + ' ' + currentYear;
        hoursEl.textContent = '--';
        hoursEl.classList.add('pay-value-loading');
        totalEl.textContent = '--';
        totalEl.classList.add('pay-value-loading');
        statusEl.textContent = '';
        statusEl.className = 'payment-status hidden';
        noteEl.textContent = 'Cargando...';

        Api.getMyPaymentSummary(currentYear, currentMonth).then(function (res) {
            hoursEl.classList.remove('pay-value-loading');
            totalEl.classList.remove('pay-value-loading');

            if (!(res && res.success && res.data)) {
                hoursEl.textContent = '0h';
                totalEl.textContent = '0 \u20AC';
                noteEl.textContent = 'No hay datos para este mes.';
                return;
            }

            var data = res.data;
            animateValue(hoursEl, (data.hours_worked || 0) + 'h', 500);
            animateValue(totalEl, Number(data.amount_earned || 0).toFixed(2) + ' \u20AC', 700);
            renderStatus(data.status, data.notes || '');
        });

        loadReceipt();
    }

    function renderStatus(status, notes) {
        statusEl.classList.remove('hidden');
        if (status === 'confirmed') {
            statusEl.textContent = 'Pago confirmado';
            statusEl.className = 'payment-status payment-status-confirmed';
            noteEl.textContent = 'La liquidacion de este mes ya esta confirmada.';
        } else if (status === 'calculated') {
            statusEl.textContent = 'Liquidacion calculada';
            statusEl.className = 'payment-status payment-status-calculated';
            noteEl.textContent = 'Importe calculado segun los fichajes conciliados.';
        } else if (status === 'review_required') {
            statusEl.textContent = 'Revision manual requerida';
            statusEl.className = 'payment-status payment-status-review';
            noteEl.textContent = notes || 'Hay fichajes que requieren revision antes de cerrar el pago.';
        } else {
            statusEl.textContent = 'Pendiente';
            statusEl.className = 'payment-status payment-status-pending';
            noteEl.textContent = 'Todavia no hay liquidacion cerrada para este mes.';
        }
    }

    /* ─────────────────────────────────────────────────── */
    /*  Receipt loading & banner                           */
    /* ─────────────────────────────────────────────────── */

    function loadReceipt() {
        var sectionEl = document.getElementById('receipt-section');
        var bannerEl = document.getElementById('receipt-banner');
        if (sectionEl) sectionEl.classList.add('hidden');
        if (bannerEl) bannerEl.classList.add('hidden');

        Api.getMyReceipt(currentYear, currentMonth).then(function (res) {
            if (!res || !res.success || !res.data) {
                currentReceipt = null;
                return;
            }
            currentReceipt = res.data;
            if (sectionEl) sectionEl.classList.remove('hidden');
            showReceiptBanner(currentReceipt);
            renderReceiptDocument(currentReceipt);
        }).catch(function () {
            currentReceipt = null;
        });
    }

    function showReceiptBanner(receipt) {
        var bannerEl = document.getElementById('receipt-banner');
        var iconEl = document.getElementById('receipt-banner-icon');
        var textEl = document.getElementById('receipt-banner-text');
        var docEl = document.getElementById('receipt-document');

        if (!bannerEl) return;

        bannerEl.classList.remove('hidden', 'receipt-banner--pending', 'receipt-banner--signed');

        if (receipt.status === 'signed') {
            bannerEl.classList.add('receipt-banner--signed');
            var signedDate = receipt.employee_signed_at ? formatDate(receipt.employee_signed_at) : '';
            textEl.innerHTML = signedDate
                ? '<strong>Recibo firmado</strong>Registrado el ' + signedDate + '. El documento ha quedado cerrado y disponible para consulta.'
                : '<strong>Recibo firmado</strong>El documento ha quedado cerrado y disponible para consulta.';
            if (iconEl) iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        } else {
            bannerEl.classList.add('receipt-banner--pending');
            textEl.innerHTML = '<strong>Recibo pendiente de firma</strong>Consulta con tu responsable para firmar este recibo.';
            if (iconEl) iconEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
        }

        if (docEl) docEl.classList.remove('hidden');
        bannerEl.classList.remove('hidden');
    }

    function renderReceiptDocument(receipt) {
        var bodyEl = document.getElementById('receipt-doc-body');
        if (!bodyEl) return;

        var monthLabel = Utils.MONTH_NAMES[currentMonth - 1] + ' ' + currentYear;
        var signedLabel = receipt.employee_signed_at ? formatDate(receipt.employee_signed_at) : '';
        var employeeLabel = Utils.escapeHtml(receipt.employee_name_snapshot || 'Participante');
        var stateLabel = receipt.status === 'signed' ? 'Firmado' : 'Pendiente de firma';
        var stateClass = receipt.status === 'signed' ? 'receipt-doc-chip receipt-doc-chip--signed' : 'receipt-doc-chip receipt-doc-chip--pending';
        var content = getReceiptTemplateContent(receipt);
        var html = '';
        updateReceiptDocumentHeader(content.header_title || 'Recibo');
        html += '<div class="receipt-doc-meta"><span class="receipt-doc-kicker">Documento mensual</span><span class="' + stateClass + '">' + stateLabel + '</span></div>';
        html += '<div class="receipt-doc-title">' + Utils.escapeHtml(content.document_title || 'Recibo') + '</div>';
        html += '<p class="receipt-doc-paragraph">' + Utils.escapeHtml(content.intro_text || '') + '</p>';
        html += '<div class="receipt-doc-grid">';
        html += '<div class="receipt-field"><span class="receipt-field-label">Participante</span><span class="receipt-field-value">' + employeeLabel + '</span></div>';
        html += '<div class="receipt-field"><span class="receipt-field-label">Periodo</span><span class="receipt-field-value">' + Utils.escapeHtml(monthLabel) + '</span></div>';
        html += '<div class="receipt-field"><span class="receipt-field-label">Horas trabajadas</span><span class="receipt-field-value">' + Utils.escapeHtml(String(receipt.hours_worked || 0)) + 'h</span></div>';
        html += '<div class="receipt-field receipt-field--highlight"><span class="receipt-field-label">Importe del recibo</span><span class="receipt-field-value">' + Number(receipt.amount_earned || 0).toFixed(2) + ' \u20AC</span></div>';
        html += '</div>';
        html += '<p class="receipt-doc-paragraph">' + Utils.escapeHtml(content.confirmation_text || '') + '</p>';
        if (receipt.status === 'signed') {
            html += '<div class="receipt-doc-mark" role="status" aria-label="Documento firmado">';
            html += '<div class="receipt-doc-mark-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7 9 18l-5-5"/></svg></div>';
            html += '<div class="receipt-doc-mark-body">';
            html += '<div class="receipt-doc-mark-eyebrow">Firma registrada</div>';
            html += '<div class="receipt-doc-mark-title">Recibo validado electronicamente por ' + employeeLabel + '</div>';
            html += '<div class="receipt-doc-mark-meta">Este documento quedo bloqueado tras la firma del ' + Utils.escapeHtml(signedLabel || 'dia registrado') + ' y ya no admite una nueva firma.</div>';
            html += '</div>';
            html += '</div>';
        }
        html += '<div class="receipt-doc-footer">';
        html += '<div class="receipt-doc-footer-label">Estado del recibo</div>';
        if (receipt.status === 'signed') {
            html += '<div class="receipt-doc-footer-value receipt-doc-footer-value--signed">Firmado el ' + Utils.escapeHtml(signedLabel || 'fecha registrada') + '</div>';
        } else {
            html += '<div class="receipt-doc-footer-value">Pendiente de firma</div>';
        }
        html += '</div>';

        bodyEl.innerHTML = html;
    }

    function getReceiptTemplateContent(receipt) {
        if (window.LegalTemplates) {
            if (receipt && receipt.status === 'signed' && window.LegalTemplates.resolveReceiptContent) {
                return window.LegalTemplates.resolveReceiptContent(receipt.document_snapshot_json || null);
            }
            if (window.LegalTemplates.buildCurrentReceiptContent) {
                return window.LegalTemplates.buildCurrentReceiptContent();
            }
        }
        return {
            header_title: 'Recibo de Gratificacion',
            document_title: 'Recibo',
            intro_text: '',
            confirmation_text: ''
        };
    }

    function updateReceiptDocumentHeader(title) {
        var headerEl = document.getElementById('receipt-doc-header-title');
        if (headerEl) {
            headerEl.textContent = title || 'Recibo';
        }
    }

    function formatDate(isoStr) {
        if (!isoStr) return '';
        var d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        var dd = String(d.getDate()).padStart(2, '0');
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var yyyy = d.getFullYear();
        return dd + '/' + mm + '/' + yyyy;
    }

    return {
        init: init,
        show: show
    };
})();
