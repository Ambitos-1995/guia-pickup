/* Debug: show JS errors visually on screen */
window.onerror = function (msg, src, line) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:red;color:white;padding:8px;font-size:12px;word-break:break-all';
    d.textContent = 'JS Error: ' + msg + ' (' + src + ':' + line + ')';
    document.body.appendChild(d);
};

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

        function onClick(event) {
            if (isDisabled(target)) return;
            handler.call(target, event);
        }

        target.addEventListener('click', onClick);

        return function () {
            target.removeEventListener('click', onClick);
        };
    }

    function delegatePress(container, selector, handler) {
        if (!container || !selector || typeof handler !== 'function') return function () {};

        function onClick(event) {
            var matched = closest(event.target, selector, container);
            if (!matched || isDisabled(matched)) return;
            handler.call(matched, event, matched);
        }

        container.addEventListener('click', onClick);

        return function () {
            container.removeEventListener('click', onClick);
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
        delegatePress: delegatePress
    };
})();
