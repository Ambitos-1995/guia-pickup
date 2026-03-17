/* =====================================================
   PIN PAD - Shared numeric PIN capture
   ===================================================== */
var PinPad = (function () {
    'use strict';

    var instances = [];
    var isKeyboardBound = false;

    function create(config) {
        var instance = {
            dotsEl: config && config.dotsEl ? config.dotsEl : null,
            keypadEl: config && config.keypadEl ? config.keypadEl : null,
            allowKeyboard: !(config && config.allowKeyboard === false),
            captureWhen: config && typeof config.captureWhen === 'function' ? config.captureWhen : function () { return true; },
            onChange: config && typeof config.onChange === 'function' ? config.onChange : function () {},
            onComplete: config && typeof config.onComplete === 'function' ? config.onComplete : function () {},
            onClear: config && typeof config.onClear === 'function' ? config.onClear : function () {},
            maxLength: normalizeLength(config && config.maxLength),
            value: '',
            enabled: true,
            busy: false,
            dots: [],
            keypadHandler: null
        };

        instance.dots = instance.dotsEl ? instance.dotsEl.querySelectorAll('.pin-dot') : [];
        bindKeypad(instance);
        render(instance);
        instances.push(instance);
        bindKeyboard();

        return {
            setValue: function (value) {
                instance.value = normalizeValue(value, instance.maxLength);
                render(instance);
                instance.onChange(instance.value);
                if (instance.value.length === instance.maxLength) {
                    instance.onComplete(instance.value);
                }
            },
            clear: function () {
                if (!instance.value) {
                    render(instance);
                    instance.onClear();
                    return;
                }
                instance.value = '';
                render(instance);
                instance.onChange(instance.value);
                instance.onClear();
            },
            getValue: function () {
                return instance.value;
            },
            setMaxLength: function (length) {
                instance.maxLength = normalizeLength(length);
                instance.value = normalizeValue(instance.value, instance.maxLength);
                render(instance);
            },
            setBusy: function (isBusy) {
                instance.busy = !!isBusy;
                syncInteractivity(instance);
            },
            setEnabled: function (isEnabled) {
                instance.enabled = !!isEnabled;
                syncInteractivity(instance);
            },
            destroy: function () {
                unbindKeypad(instance);
                instances = instances.filter(function (candidate) {
                    return candidate !== instance;
                });
            },
            shake: function () {
                if (!instance.dotsEl) return;
                instance.dotsEl.classList.remove('shake');
                void instance.dotsEl.offsetWidth;
                instance.dotsEl.classList.add('shake');
            }
        };
    }

    function bindKeypad(instance) {
        if (!instance.keypadEl) return;
        instance.keypadHandler = function (event) {
            var button = event.target && event.target.closest ? event.target.closest('.key-btn') : null;
            var key;
            if (!button || !instance.keypadEl.contains(button) || button.disabled || !canInteract(instance)) {
                return;
            }

            key = button.dataset.key;
            if (key === 'clear') {
                clearInstance(instance);
                return;
            }

            if (key) {
                addDigit(instance, key);
            }
        };
        instance.keypadEl.addEventListener('click', instance.keypadHandler);
    }

    function unbindKeypad(instance) {
        if (!instance.keypadEl || !instance.keypadHandler) return;
        instance.keypadEl.removeEventListener('click', instance.keypadHandler);
        instance.keypadHandler = null;
    }

    function bindKeyboard() {
        if (isKeyboardBound || typeof document === 'undefined') return;
        isKeyboardBound = true;
        document.addEventListener('keydown', handleKeydown);
    }

    function handleKeydown(event) {
        var targetInstance;
        if (isEditableTarget(event.target)) {
            return;
        }

        targetInstance = findKeyboardTarget();
        if (!targetInstance) return;

        if (event.key >= '0' && event.key <= '9') {
            addDigit(targetInstance, event.key);
            event.preventDefault();
            return;
        }

        if (event.key === 'Backspace' && targetInstance.value.length > 0) {
            targetInstance.value = targetInstance.value.slice(0, -1);
            render(targetInstance);
            targetInstance.onChange(targetInstance.value);
            event.preventDefault();
        }
    }

    function findKeyboardTarget() {
        var index;
        for (index = instances.length - 1; index >= 0; index--) {
            if (instances[index].allowKeyboard && canCaptureKeyboard(instances[index])) {
                return instances[index];
            }
        }
        return null;
    }

    function canCaptureKeyboard(instance) {
        return canInteract(instance) && !!instance.captureWhen();
    }

    function canInteract(instance) {
        return !!(instance && instance.enabled && !instance.busy);
    }

    function addDigit(instance, digit) {
        if (instance.value.length >= instance.maxLength) return;
        instance.value += digit;
        render(instance);
        instance.onChange(instance.value);
        if (instance.value.length === instance.maxLength) {
            instance.onComplete(instance.value);
        }
    }

    function clearInstance(instance) {
        if (!instance.value) {
            render(instance);
            instance.onClear();
            return;
        }
        instance.value = '';
        render(instance);
        instance.onChange(instance.value);
        instance.onClear();
    }

    function render(instance) {
        var visibleCount = instance.maxLength;
        Utils.each(instance.dots, function (dot, index) {
            dot.style.display = index < visibleCount ? '' : 'none';
            dot.classList.toggle('filled', index < instance.value.length);
        });
        syncInteractivity(instance);
    }

    function syncInteractivity(instance) {
        if (!instance.keypadEl) return;
        instance.keypadEl.style.opacity = canInteract(instance) ? '1' : '0.5';
        instance.keypadEl.style.pointerEvents = canInteract(instance) ? 'auto' : 'none';
    }

    function normalizeLength(length) {
        var parsed = parseInt(length, 10);
        return parsed > 0 ? parsed : 4;
    }

    function normalizeValue(value, maxLength) {
        return String(value || '').replace(/\D/g, '').slice(0, maxLength || 4);
    }

    function isEditableTarget(target) {
        var element = target && target.nodeType === 1 ? target : null;
        var tagName;
        if (!element) return false;

        tagName = String(element.tagName || '').toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
            return true;
        }

        return !!element.isContentEditable;
    }

    return {
        create: create
    };
})();
