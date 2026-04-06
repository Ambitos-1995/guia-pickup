/* =====================================================
   UTILS - Date helpers, ISO week, formatters
   ===================================================== */
var Utils = (function () {
    'use strict';

    var DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
    var DAY_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    var MONTH_NAMES = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    /** Get ISO week number for a date */
    function getISOWeek(date) {
        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /** Get ISO year (can differ from calendar year at year boundaries) */
    function getISOYear(date) {
        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        return d.getUTCFullYear();
    }

    /** Get Monday of a given ISO week */
    function getMondayOfWeek(isoYear, isoWeek) {
        var jan4 = new Date(isoYear, 0, 4);
        var dayOfWeek = jan4.getDay() || 7;
        var monday = new Date(jan4);
        monday.setDate(jan4.getDate() - dayOfWeek + 1 + (isoWeek - 1) * 7);
        return monday;
    }

    /** Get array of 5 dates (Mon-Fri) for a given ISO week */
    function getWeekDates(isoYear, isoWeek) {
        var mon = getMondayOfWeek(isoYear, isoWeek);
        var dates = [];
        for (var i = 0; i < 5; i++) {
            var d = new Date(mon);
            d.setDate(mon.getDate() + i);
            dates.push(d);
        }
        return dates;
    }

    /** Format date as YYYY-MM-DD */
    function formatDateISO(date) {
        var y = date.getFullYear();
        var m = String(date.getMonth() + 1).padStart(2, '0');
        var d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }

    /** Format time HH:MM */
    function formatTime(date) {
        return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    }

    /** Format time HH:MM:SS */
    function formatTimeFull(date) {
        return formatTime(date) + ':' + String(date.getSeconds()).padStart(2, '0');
    }

    /** Format: "miercoles, 11 de marzo" */
    function formatDateLong(date) {
        return DAY_NAMES[date.getDay()].toLowerCase() + ', ' +
               date.getDate() + ' de ' +
               MONTH_NAMES[date.getMonth()].toLowerCase();
    }

    /** Get today as YYYY-MM-DD using client date */
    function today() {
        return formatDateISO(new Date());
    }

    /** Current ISO week info */
    function currentWeekInfo() {
        var now = new Date();
        return { year: getISOYear(now), week: getISOWeek(now) };
    }

    /** Number of ISO weeks in a year (52 or 53) */
    function getISOWeeksInYear(isoYear) {
        return getISOWeek(new Date(isoYear, 11, 28));
    }

    /** Day of week name from 1-5 (Mon-Fri) */
    function dayOfWeekShort(dow) {
        // dow: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
        return DAY_SHORT[dow]; // DAY_SHORT[1]=L, [2]=M, [3]=X, [4]=J, [5]=V
    }

    /** Count weekdays (Mon-Fri) in a given month */
    function countWeekdays(year, month) {
        var count = 0;
        var daysInMonth = new Date(year, month, 0).getDate();
        for (var d = 1; d <= daysInMonth; d++) {
            var dow = new Date(year, month - 1, d).getDay();
            if (dow >= 1 && dow <= 5) count++;
        }
        return count;
    }

    function each(list, handler) {
        if (!list || typeof handler !== 'function') return;
        for (var i = 0; i < list.length; i++) {
            handler(list[i], i);
        }
    }

    function matches(element, selector) {
        if (!element || element.nodeType !== 1) return false;
        var fn = element.matches ||
                 element.matchesSelector ||
                 element.msMatchesSelector ||
                 element.webkitMatchesSelector;
        return !!(fn && fn.call(element, selector));
    }

    function closest(target, selector, boundary) {
        var node = target;

        if (node && node.nodeType !== 1) {
            node = node.parentElement || node.parentNode || null;
        }

        while (node && node !== boundary && node !== document) {
            if (matches(node, selector)) {
                return node;
            }
            node = node.parentElement || node.parentNode || null;
        }

        if (boundary && matches(boundary, selector)) {
            return boundary;
        }

        return null;
    }

    function isDisabled(element) {
        return !!(element && (element.disabled || element.getAttribute('aria-disabled') === 'true'));
    }

    function bindPress(target, handler) {
        if (!target || typeof handler !== 'function') return function () {};

        function invoke(event) {
            if (isDisabled(target)) return;
            handler.call(target, event);
        }

        function onPointerDown() { target.classList.add('pressing'); }
        function onPointerEnd() { target.classList.remove('pressing'); }
        function onClick(event) { invoke(event); }

        target.addEventListener('pointerdown', onPointerDown);
        target.addEventListener('pointerup', onPointerEnd);
        target.addEventListener('pointerleave', onPointerEnd);
        target.addEventListener('pointercancel', onPointerEnd);
        target.addEventListener('click', onClick);

        return function () {
            target.removeEventListener('pointerdown', onPointerDown);
            target.removeEventListener('pointerup', onPointerEnd);
            target.removeEventListener('pointerleave', onPointerEnd);
            target.removeEventListener('pointercancel', onPointerEnd);
            target.removeEventListener('click', onClick);
        };
    }

    function delegatePress(container, selector, handler) {
        if (!container || !selector || typeof handler !== 'function') return function () {};

        function onPointerDown(event) {
            var matched = closest(event.target, selector, container);
            if (matched) matched.classList.add('pressing');
        }

        function onPointerEnd(event) {
            var matched = closest(event.target, selector, container);
            if (matched) matched.classList.remove('pressing');
        }

        function onClick(event) {
            var matched = closest(event.target, selector, container);
            if (!matched || isDisabled(matched)) return;
            handler.call(matched, event, matched);
        }

        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointerup', onPointerEnd);
        container.addEventListener('pointerleave', onPointerEnd);
        container.addEventListener('pointercancel', onPointerEnd);
        container.addEventListener('click', onClick);

        return function () {
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('pointerup', onPointerEnd);
            container.removeEventListener('pointerleave', onPointerEnd);
            container.removeEventListener('pointercancel', onPointerEnd);
            container.removeEventListener('click', onClick);
        };
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function resizeCanvas(canvas) {
        if (!canvas || !canvas.offsetWidth || !canvas.offsetHeight) return;
        var ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        var ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
    }

    function getNormalizedSignatureDataUrl(pad) {
        if (!pad || typeof pad.toDataURL !== 'function') return '';
        var sourceCanvas = pad.canvas || (pad._ctx && pad._ctx.canvas) || null;
        var dataUrl = '';
        if (sourceCanvas && sourceCanvas.width && sourceCanvas.height) {
            var ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                var imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
                var bounds = findInkBounds(imageData.data, sourceCanvas.width, sourceCanvas.height);
                if (bounds) {
                    var padX = Math.max(12, Math.round(bounds.width * 0.08));
                    var padY = Math.max(10, Math.round(bounds.height * 0.2));
                    var left = Math.max(0, bounds.left - padX);
                    var top = Math.max(0, bounds.top - padY);
                    var right = Math.min(sourceCanvas.width, bounds.right + padX);
                    var bottom = Math.min(sourceCanvas.height, bounds.bottom + padY);
                    var cropWidth = Math.max(1, right - left);
                    var cropHeight = Math.max(1, bottom - top);
                    var croppedCanvas = document.createElement('canvas');
                    croppedCanvas.width = cropWidth;
                    croppedCanvas.height = cropHeight;
                    var croppedCtx = croppedCanvas.getContext('2d');
                    if (croppedCtx) {
                        croppedCtx.drawImage(
                            sourceCanvas,
                            left,
                            top,
                            cropWidth,
                            cropHeight,
                            0,
                            0,
                            cropWidth,
                            cropHeight
                        );
                        dataUrl = String(croppedCanvas.toDataURL('image/png') || '').trim();
                    }
                }
            }
        }

        if (!dataUrl) {
            dataUrl = String(pad.toDataURL('image/png') || '').trim();
        }
        var commaIndex = dataUrl.indexOf(',');
        if (commaIndex === -1) return dataUrl;
        var prefix = dataUrl.slice(0, commaIndex + 1);
        var base64 = dataUrl.slice(commaIndex + 1).replace(/\s+/g, '');
        return prefix + base64;
    }

    function findInkBounds(pixels, width, height) {
        var minX = width;
        var minY = height;
        var maxX = -1;
        var maxY = -1;

        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var alpha = pixels[(y * width + x) * 4 + 3];
                if (alpha <= 8) continue;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }

        if (maxX < minX || maxY < minY) return null;

        return {
            left: minX,
            top: minY,
            right: maxX + 1,
            bottom: maxY + 1,
            width: maxX - minX + 1,
            height: maxY - minY + 1
        };
    }

    return {
        DAY_NAMES: DAY_NAMES,
        DAY_SHORT: DAY_SHORT,
        MONTH_NAMES: MONTH_NAMES,
        getISOWeek: getISOWeek,
        getISOYear: getISOYear,
        getMondayOfWeek: getMondayOfWeek,
        getWeekDates: getWeekDates,
        formatDateISO: formatDateISO,
        formatTime: formatTime,
        formatTimeFull: formatTimeFull,
        formatDateLong: formatDateLong,
        today: today,
        currentWeekInfo: currentWeekInfo,
        getISOWeeksInYear: getISOWeeksInYear,
        dayOfWeekShort: dayOfWeekShort,
        countWeekdays: countWeekdays,
        each: each,
        matches: matches,
        closest: closest,
        bindPress: bindPress,
        delegatePress: delegatePress,
        escapeHtml: escapeHtml,
        resizeCanvas: resizeCanvas,
        getNormalizedSignatureDataUrl: getNormalizedSignatureDataUrl
    };
})();
