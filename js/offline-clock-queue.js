/* =====================================================
   OFFLINE CLOCK QUEUE - IndexedDB retry for time punches
   ===================================================== */
var OfflineClockQueue = (function () {
    'use strict';

    var DB_NAME = 'pickup-tmg-offline-clock-v1';
    var DB_VERSION = 2;
    var STORE_NAME = 'clock_actions';
    var PIN_CACHE_STORE = 'employee_pin_cache';
    var COUNT_STORAGE_KEY = 'pickup-offline-clock-queue-count-v1';
    var BANNER_ID = 'offline-clock-banner';
    var AUTO_FLUSH_DELAY_MS = 1500;
    var PERIODIC_FLUSH_MS = 15000;

    var initDone = false;
    var dbPromise = null;
    var currentCount = 0;
    var pendingByEmployee = {};
    var optimisticStatusByEmployee = {};
    var flushInProgress = false;
    var flushTimer = 0;
    var periodicTimer = 0;
    var bannerEl = null;

    function init() {
        if (initDone) return;
        initDone = true;

        bannerEl = document.getElementById(BANNER_ID);
        requestPersistentStorage().catch(function () {});
        loadPendingCountMirror();
        updateBanner();
        bindLifecycleEvents();
        schedulePeriodicFlush();

        sanitizePersistedCredentials().then(function () {
            return purgeExpiredPinCache();
        }).catch(function () {
            return null;
        }).then(function () {
            return refreshPendingState();
        }).catch(function () {
            updateBanner();
        });
    }

    function requestPersistentStorage() {
        if (!(navigator && navigator.storage && typeof navigator.storage.persist === 'function')) {
            return Promise.resolve(false);
        }

        return navigator.storage.persist().catch(function () {
            return false;
        });
    }

    function bindLifecycleEvents() {
        window.addEventListener('online', function () {
            refreshPendingState().catch(function () {});
            scheduleFlush(250);
        });

        window.addEventListener('pageshow', function () {
            refreshPendingState().catch(function () {});
            purgeExpiredPinCache().catch(function () {});
            scheduleFlush(250);
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                refreshPendingState().catch(function () {});
                purgeExpiredPinCache().catch(function () {});
                scheduleFlush(500);
            }
        });

        window.addEventListener('storage', function (event) {
            if (event && event.key === COUNT_STORAGE_KEY) {
                loadPendingCountMirror();
                updateBanner();
                refreshPendingState().catch(function () {});
            }
        });
    }

    function schedulePeriodicFlush() {
        if (periodicTimer) {
            clearInterval(periodicTimer);
        }

        periodicTimer = setInterval(function () {
            purgeExpiredPinCache().catch(function () {});
            scheduleFlush(0);
        }, PERIODIC_FLUSH_MS);
    }

    function loadPendingCountMirror() {
        var raw = '';
        var parsed = 0;

        try {
            if (window.localStorage) {
                raw = window.localStorage.getItem(COUNT_STORAGE_KEY) || '';
            }
        } catch (error) {
            raw = '';
        }

        parsed = parseInt(raw, 10);
        currentCount = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }

    function persistPendingCountMirror(count) {
        try {
            if (!window.localStorage) return;
            window.localStorage.setItem(COUNT_STORAGE_KEY, String(Math.max(0, count || 0)));
        } catch (error) {
            /* ignore */
        }
    }

    function openDatabase() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise(function (resolve, reject) {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB no disponible'));
                return;
            }

            var request = window.indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function () {
                var db = request.result;
                var store;
                var pinStore;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    store = db.createObjectStore(STORE_NAME, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                } else {
                    store = request.transaction.objectStore(STORE_NAME);
                }

                if (!store.indexNames.contains('queuedAt')) {
                    store.createIndex('queuedAt', 'queuedAt', { unique: false });
                }
                if (!store.indexNames.contains('employeeId')) {
                    store.createIndex('employeeId', 'employeeId', { unique: false });
                }
                if (!store.indexNames.contains('clientEventId')) {
                    store.createIndex('clientEventId', 'clientEventId', { unique: false });
                }

                if (!db.objectStoreNames.contains(PIN_CACHE_STORE)) {
                    pinStore = db.createObjectStore(PIN_CACHE_STORE, {
                        keyPath: 'cacheKey'
                    });
                } else {
                    pinStore = request.transaction.objectStore(PIN_CACHE_STORE);
                }

                if (!pinStore.indexNames.contains('employeeId')) {
                    pinStore.createIndex('employeeId', 'employeeId', { unique: false });
                }
                if (!pinStore.indexNames.contains('expiresAt')) {
                    pinStore.createIndex('expiresAt', 'expiresAt', { unique: false });
                }
            };

            request.onsuccess = function () {
                var db = request.result;

                db.onversionchange = function () {
                    try {
                        db.close();
                    } catch (error) {
                        /* ignore */
                    }
                    dbPromise = null;
                };

                resolve(db);
            };

            request.onerror = function () {
                reject(request.error || new Error('No se pudo abrir IndexedDB'));
            };
        });

        return dbPromise;
    }

    function requestToPromise(request) {
        return new Promise(function (resolve, reject) {
            request.onsuccess = function () {
                resolve(request.result);
            };
            request.onerror = function () {
                reject(request.error || new Error('Error de IndexedDB'));
            };
        });
    }

    function getAllQueuedActions() {
        return openDatabase().then(function (db) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            return requestToPromise(tx.objectStore(STORE_NAME).getAll());
        }).then(function (items) {
            return (items || []).slice().sort(compareQueuedActions);
        });
    }

    function getQueuedActionByClientEventId(clientEventId) {
        var normalizedId = String(clientEventId || '').trim();
        if (!normalizedId) return Promise.resolve(null);

        return openDatabase().then(function (db) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            return requestToPromise(tx.objectStore(STORE_NAME).index('clientEventId').get(normalizedId));
        }).then(function (record) {
            return record || null;
        });
    }

    function addQueuedAction(record) {
        return openDatabase().then(function (db) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            return requestToPromise(tx.objectStore(STORE_NAME).add(sanitizeQueuedRecord(record)));
        });
    }

    function updateQueuedAction(record) {
        return openDatabase().then(function (db) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            return requestToPromise(tx.objectStore(STORE_NAME).put(sanitizeQueuedRecord(record)));
        });
    }

    function removeQueuedAction(id) {
        return openDatabase().then(function (db) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            return requestToPromise(tx.objectStore(STORE_NAME).delete(id));
        });
    }

    function removeQueuedActionRecord(record, detail) {
        if (!record || !record.id) return Promise.resolve();

        return removeQueuedAction(record.id).then(function () {
            return refreshPendingState();
        }).then(function () {
            dispatchQueueEvent('offline-clock-queue-dropped', {
                action: record.action,
                employeeId: record.employeeId,
                employeeName: record.employeeName,
                clientTimestamp: record.clientTimestamp,
                clientEventId: record.clientEventId,
                reason: detail && detail.reason ? detail.reason : '',
                message: detail && detail.message ? detail.message : 'No se pudo sincronizar el fichaje pendiente.'
            });
        }).catch(function () {
            return null;
        });
    }

    function getPinCache(cacheKey) {
        return openDatabase().then(function (db) {
            var tx = db.transaction(PIN_CACHE_STORE, 'readonly');
            return requestToPromise(tx.objectStore(PIN_CACHE_STORE).get(cacheKey));
        }).then(function (record) {
            return record || null;
        });
    }

    function putPinCache(record) {
        return openDatabase().then(function (db) {
            var tx = db.transaction(PIN_CACHE_STORE, 'readwrite');
            return requestToPromise(tx.objectStore(PIN_CACHE_STORE).put(sanitizePinCacheRecord(record)));
        });
    }

    function deletePinCache(cacheKey) {
        return openDatabase().then(function (db) {
            var tx = db.transaction(PIN_CACHE_STORE, 'readwrite');
            return requestToPromise(tx.objectStore(PIN_CACHE_STORE).delete(cacheKey));
        });
    }

    function getPinCachesByEmployee(employeeId) {
        var normalizedEmployeeId = String(employeeId || '').trim();
        if (!normalizedEmployeeId) return Promise.resolve([]);

        return openDatabase().then(function (db) {
            var tx = db.transaction(PIN_CACHE_STORE, 'readonly');
            return requestToPromise(tx.objectStore(PIN_CACHE_STORE).index('employeeId').getAll(normalizedEmployeeId));
        }).then(function (records) {
            return records || [];
        });
    }

    function clearEmployeePinCache(employeeId) {
        var normalizedEmployeeId = String(employeeId || '').trim();
        if (!normalizedEmployeeId) return Promise.resolve();

        return getPinCachesByEmployee(normalizedEmployeeId).then(function (records) {
            var deletions = [];

            records.forEach(function (record) {
                if (!record || !record.cacheKey) return;
                deletions.push(deletePinCache(record.cacheKey));
            });

            return Promise.all(deletions);
        }).catch(function () {
            return null;
        });
    }

    function getAllPinCaches() {
        return openDatabase().then(function (db) {
            var tx = db.transaction(PIN_CACHE_STORE, 'readonly');
            return requestToPromise(tx.objectStore(PIN_CACHE_STORE).getAll());
        }).then(function (records) {
            return records || [];
        });
    }

    function compareQueuedActions(a, b) {
        var aTime = Date.parse(a && a.queuedAt ? a.queuedAt : '') || 0;
        var bTime = Date.parse(b && b.queuedAt ? b.queuedAt : '') || 0;

        if (aTime !== bTime) return aTime - bTime;
        return Number(a && a.id ? a.id : 0) - Number(b && b.id ? b.id : 0);
    }

    function applyPendingSnapshot(records) {
        var normalizedRecords = (records || []).slice().sort(compareQueuedActions);
        var byEmployee = {};
        var statusByEmployee = {};
        var index = 0;
        var employeeKey = '';

        for (index = 0; index < normalizedRecords.length; index++) {
            employeeKey = String(normalizedRecords[index].employeeId || '').trim();
            if (!employeeKey) continue;

            byEmployee[employeeKey] = (byEmployee[employeeKey] || 0) + 1;
            statusByEmployee[employeeKey] = normalizedRecords[index].action === 'check-in'
                ? 'checked_in'
                : 'checked_out';
        }

        pendingByEmployee = byEmployee;
        optimisticStatusByEmployee = statusByEmployee;
        setPendingCount(normalizedRecords.length);
        return normalizedRecords;
    }

    function refreshPendingState() {
        return getAllQueuedActions().then(function (records) {
            applyPendingSnapshot(records);
            return records;
        }).catch(function () {
            pendingByEmployee = {};
            optimisticStatusByEmployee = {};
            setPendingCount(currentCount);
            return [];
        });
    }

    function setPendingCount(count) {
        var normalized = Math.max(0, Number(count) || 0);
        var previous = currentCount;

        currentCount = normalized;
        persistPendingCountMirror(currentCount);
        updateBanner();
        dispatchQueueEvent('offline-clock-queue-change', {
            count: currentCount
        });

        if (previous > 0 && currentCount === 0) {
            dispatchQueueEvent('offline-clock-queue-empty', {
                count: currentCount
            });
        }
    }

    function updateBanner() {
        if (!bannerEl) return;

        if (currentCount > 0) {
            bannerEl.textContent = currentCount === 1
                ? '1 fichaje pendiente de sincronizar'
                : currentCount + ' fichajes pendientes de sincronizar';
            bannerEl.classList.remove('hidden');
        } else {
            bannerEl.textContent = '';
            bannerEl.classList.add('hidden');
        }
    }

    function dispatchQueueEvent(name, detail) {
        var event;

        if (!window.dispatchEvent) return;

        try {
            event = new CustomEvent(name, { detail: detail || {} });
        } catch (error) {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent(name, false, false, detail || {});
        }

        window.dispatchEvent(event);
    }

    function sanitizeQueuedRecord(record) {
        var nextRecord = record || {};

        if (Object.prototype.hasOwnProperty.call(nextRecord, 'accessToken')) {
            delete nextRecord.accessToken;
        }
        if (Object.prototype.hasOwnProperty.call(nextRecord, 'expiresAt')) {
            delete nextRecord.expiresAt;
        }

        return nextRecord;
    }

    function sanitizePinCacheRecord(record) {
        var nextRecord = record || {};

        if (Object.prototype.hasOwnProperty.call(nextRecord, 'accessToken')) {
            delete nextRecord.accessToken;
        }
        if (Object.prototype.hasOwnProperty.call(nextRecord, 'expiresAt')) {
            delete nextRecord.expiresAt;
        }

        return nextRecord;
    }

    function sanitizePersistedCredentials() {
        return Promise.all([
            getAllQueuedActions().then(function (records) {
                var updates = [];

                (records || []).forEach(function (record) {
                    if (!record) return;
                    if (!Object.prototype.hasOwnProperty.call(record, 'accessToken') &&
                        !Object.prototype.hasOwnProperty.call(record, 'expiresAt')) {
                        return;
                    }

                    updates.push(updateQueuedAction(record));
                });

                return Promise.all(updates);
            }),
            getAllPinCaches().then(function (records) {
                var writes = [];

                (records || []).forEach(function (record) {
                    var hasLegacySecrets;

                    if (!record || !record.cacheKey) return;

                    hasLegacySecrets = Object.prototype.hasOwnProperty.call(record, 'accessToken') ||
                        Object.prototype.hasOwnProperty.call(record, 'expiresAt');

                    if (!record.offlineClockToken) {
                        writes.push(deletePinCache(record.cacheKey));
                        return;
                    }

                    if (hasLegacySecrets) {
                        writes.push(putPinCache(record));
                    }
                });

                return Promise.all(writes);
            })
        ]);
    }

    function buildRequestOptions(payload) {
        var accessToken = typeof payload.accessToken === 'string' ? payload.accessToken.trim() : '';

        return {
            accessToken: accessToken,
            offlineClockToken: accessToken ? '' : payload.offlineClockToken,
            silentAuthFailure: true,
            suppressTouchSession: true,
            clientTimestamp: payload.clientTimestamp,
            clientEventId: payload.clientEventId
        };
    }

    function buildQueuedRecord(action, payload) {
        return {
            action: action,
            clientDate: payload.clientDate || Utils.today(),
            clientTimestamp: payload.clientTimestamp || new Date().toISOString(),
            clientEventId: payload.clientEventId || generateClientEventId(),
            offlineClockToken: payload.offlineClockToken || '',
            offlineClockTokenExpiresAt: payload.offlineClockTokenExpiresAt || '',
            employeeId: payload.employeeId || null,
            employeeName: payload.employeeName || '',
            organizationId: payload.organizationId || null,
            source: payload.source || '',
            queuedAt: new Date().toISOString(),
            attempts: 0,
            lastError: '',
            lastAttemptAt: '',
            blockedReason: '',
            blockedMessage: '',
            updatedAt: new Date().toISOString()
        };
    }

    function generateClientEventId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        return 'clock-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }

    function isTransientClockFailure(res) {
        var message = String(res && res.message ? res.message : '').toLowerCase();

        if (!res) return true;
        if (res.success) return false;

        if (res.httpStatus === 0 || res.httpStatus === 502 || res.httpStatus === 503 || res.httpStatus === 504) return true;
        if (message === 'error de conexion' || message === 'sin conexion' || message === 'offline' || message === 'respuesta invalida del servidor') {
            return true;
        }

        return false;
    }

    function isTransientVerifyFailure(res) {
        return isTransientClockFailure(res);
    }

    function isAuthFailure(res) {
        if (!res) return false;
        if (res.httpStatus === 401 || res.httpStatus === 403) return true;

        return res.error === 'AUTH_REQUIRED' ||
            res.error === 'SESSION_EXPIRED' ||
            res.error === 'TOKEN_INVALID' ||
            res.error === 'SESSION_NOT_FOUND';
    }

    function isOfflineClockCredentialFailure(res) {
        if (!res) return false;

        return res.error === 'CLOCK_TOKEN_REQUIRED' ||
            res.error === 'CLOCK_TOKEN_INVALID' ||
            res.error === 'CLOCK_TOKEN_EXPIRED' ||
            res.error === 'CLOCK_TOKEN_FORBIDDEN';
    }

    function buildQueuedResponse(action, payload) {
        var label = action === 'check-in' ? 'Entrada' : 'Salida';

        return {
            success: true,
            queued: true,
            offline: true,
            clientEventId: payload.clientEventId || '',
            message: label + ' guardada sin conexion. Se sincronizara automaticamente.',
            data: {
                employeeName: payload.employeeName || '',
                currentStatus: action === 'check-in' ? 'checked_in' : 'checked_out'
            }
        };
    }

    function sendClockAction(action, payload, options) {
        var request;
        var allowQueue = !options || options.allowQueue !== false;

        if (!payload.accessToken && !payload.offlineClockToken) {
            return Promise.resolve({
                success: false,
                blocked: true,
                recoverable: true,
                reason: 'offline_token_missing',
                message: 'No hay credencial offline disponible. Conectate y vuelve a validar tu PIN.'
            });
        }

        if (action === 'check-in') {
            request = Api.checkIn(payload.clientDate, buildRequestOptions(payload));
        } else {
            request = Api.checkOut(payload.clientDate, buildRequestOptions(payload));
        }

        return request.then(function (res) {
            if (res && res.success) {
                updateEmployeePinCache(payload.employeeId, {
                    currentStatus: res.data && res.data.currentStatus
                        ? res.data.currentStatus
                        : (action === 'check-in' ? 'checked_in' : 'checked_out')
                }).catch(function () {});

                return {
                    success: true,
                    queued: false,
                    offline: false,
                    clientEventId: payload.clientEventId || '',
                    message: res.message || '',
                    data: res.data || {},
                    httpStatus: res.httpStatus || 200
                };
            }

            if (isOfflineClockCredentialFailure(res)) {
                updateEmployeePinCache(payload.employeeId, {
                    offlineClockToken: '',
                    offlineClockTokenExpiresAt: ''
                }).catch(function () {});

                return {
                    success: false,
                    queued: false,
                    blocked: true,
                    recoverable: true,
                    reason: res && res.error === 'CLOCK_TOKEN_EXPIRED'
                        ? 'offline_token_expired'
                        : 'offline_token_invalid',
                    message: (res && res.message) || 'La credencial offline ha caducado. Conectate y vuelve a validar tu PIN.',
                    data: (res && res.data) || null,
                    httpStatus: res && res.httpStatus ? res.httpStatus : 0
                };
            }

            if (isTransientClockFailure(res)) {
                if (!allowQueue) {
                    return {
                        success: false,
                        queued: false,
                        offline: true,
                        transient: true,
                        message: (res && res.message) || 'Sin conexion',
                        data: (res && res.data) || null,
                        httpStatus: res && res.httpStatus ? res.httpStatus : 0
                    };
                }

                return queueClockAction(action, payload);
            }

            return {
                success: false,
                queued: false,
                offline: false,
                message: (res && res.message) || 'Error al registrar fichaje',
                data: (res && res.data) || null,
                httpStatus: res && res.httpStatus ? res.httpStatus : 0
            };
        }).catch(function (error) {
            if (!allowQueue) {
                return {
                    success: false,
                    queued: false,
                    offline: true,
                    transient: true,
                    message: (error && error.message) || 'Error de conexion'
                };
            }

            return queueClockAction(action, payload).catch(function () {
                return {
                    success: false,
                    queued: false,
                    offline: true,
                    message: (error && error.message) || 'Error de conexion'
                };
            });
        });
    }

    function queueClockAction(action, payload) {
        var record = buildQueuedRecord(action, payload);

        return getQueuedActionByClientEventId(record.clientEventId).then(function (existing) {
            if (existing) {
                return buildQueuedResponse(action, existing);
            }

            return addQueuedAction(record).then(function () {
                return refreshPendingState().then(function () {
                    updateEmployeePinCache(record.employeeId, {
                        currentStatus: action === 'check-in' ? 'checked_in' : 'checked_out'
                    }).catch(function () {});
                    scheduleFlush(AUTO_FLUSH_DELAY_MS);
                    return buildQueuedResponse(action, record);
                });
            });
        }).catch(function () {
            return {
                success: false,
                queued: false,
                offline: true,
                message: 'No se pudo guardar el fichaje sin conexion'
            };
        });
    }

    function processQueuedAction(record) {
        if (!record || !record.offlineClockToken) {
            return Promise.resolve({
                success: false,
                queued: true,
                blocked: true,
                recoverable: true,
                reason: 'offline_token_missing',
                message: 'No hay credencial offline disponible. Conectate y vuelve a validar tu PIN.'
            });
        }

        if (isOfflineClockTokenExpired(record.offlineClockTokenExpiresAt)) {
            return Promise.resolve({
                success: false,
                queued: true,
                blocked: true,
                recoverable: true,
                reason: 'offline_token_expired',
                message: 'La credencial offline de este fichaje ha caducado. Conectate y vuelve a validar tu PIN.'
            });
        }

        var payload = {
            offlineClockToken: record.offlineClockToken,
            offlineClockTokenExpiresAt: record.offlineClockTokenExpiresAt || '',
            clientDate: record.clientDate,
            clientTimestamp: record.clientTimestamp,
            clientEventId: record.clientEventId,
            employeeId: record.employeeId,
            employeeName: record.employeeName,
            organizationId: record.organizationId,
            source: record.source
        };

        return sendClockAction(record.action, payload, { allowQueue: false }).then(function (result) {
            if (result && result.success && !result.queued) {
                return removeQueuedAction(record.id).then(function () {
                    return refreshPendingState().then(function () {
                        dispatchQueueEvent('offline-clock-queue-synced', {
                            action: record.action,
                            employeeId: record.employeeId,
                            employeeName: record.employeeName,
                            clientTimestamp: record.clientTimestamp,
                            clientEventId: record.clientEventId,
                            response: result
                        });
                        return result;
                    });
                }).catch(function (error) {
                    return {
                        success: false,
                        queued: true,
                        offline: true,
                        message: (error && error.message) || 'No se pudo limpiar la cola'
                    };
                });
            }

            if (result && !result.success && isOfflineClockCredentialFailure(result)) {
                return updateEmployeePinCache(record.employeeId, {
                    offlineClockToken: '',
                    offlineClockTokenExpiresAt: ''
                }).then(function () {
                    return {
                        success: false,
                        queued: true,
                        blocked: true,
                        recoverable: true,
                        reason: result.error === 'CLOCK_TOKEN_EXPIRED'
                            ? 'offline_token_expired'
                            : 'offline_token_invalid',
                        message: result.message || 'La credencial offline ha caducado. Conectate y vuelve a validar tu PIN.'
                    };
                });
            }

            if (result && result.blocked && result.recoverable) {
                return result;
            }

            if (result && !result.success && !isTransientClockFailure(result)) {
                return {
                    success: false,
                    queued: true,
                    blocked: true,
                    reason: 'permanent',
                    message: result.message || 'Requiere revision'
                };
            }

            return {
                success: false,
                queued: true,
                transient: true,
                message: (result && result.message) || 'Sin conexion'
            };
        });
    }

    function markQueuedActionFailure(record, result) {
        if (!record || !record.id) return Promise.resolve();

        record.attempts = Math.max(0, Number(record.attempts) || 0) + 1;
        record.lastError = String(result && result.message ? result.message : 'Sin conexion');
        record.lastAttemptAt = new Date().toISOString();
        record.blockedReason = result && result.recoverable && result.reason ? String(result.reason) : '';
        record.blockedMessage = result && result.recoverable && result.message ? String(result.message) : '';
        record.updatedAt = record.lastAttemptAt;

        return updateQueuedAction(record).catch(function () {
            return null;
        });
    }

    function isOfflineClockTokenExpired(value) {
        var expiry = Date.parse(String(value || ''));
        if (!expiry) return false;
        return expiry <= Date.now();
    }

    function flushPendingActions() {
        if (flushInProgress) return Promise.resolve();
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
        if (currentCount <= 0) return Promise.resolve();

        flushInProgress = true;

        return getAllQueuedActions().then(function (records) {
            var hadTransientFailure = false;

            function processNext(index) {
                if (index >= records.length) {
                    return Promise.resolve();
                }

                return processQueuedAction(records[index]).then(function (result) {
                    if (result && result.success && !result.queued) {
                        return processNext(index + 1);
                    }

                    if (result && result.transient) {
                        hadTransientFailure = true;
                        return markQueuedActionFailure(records[index], result);
                    }

                    if (result && result.blocked) {
                        if (result.recoverable) {
                            var alreadyBlocked = records[index].blockedReason === result.reason &&
                                records[index].blockedMessage === result.message;
                            return markQueuedActionFailure(records[index], result).then(function () {
                                if (!alreadyBlocked) {
                                    dispatchQueueEvent('offline-clock-queue-blocked', {
                                        action: records[index].action,
                                        employeeId: records[index].employeeId,
                                        employeeName: records[index].employeeName,
                                        clientTimestamp: records[index].clientTimestamp,
                                        clientEventId: records[index].clientEventId,
                                        reason: result.reason || '',
                                        message: result.message || 'Conectate y vuelve a validar tu PIN para sincronizar el fichaje pendiente.'
                                    });
                                }
                                return processNext(index + 1);
                            });
                        }

                        return removeQueuedActionRecord(records[index], result).then(function () {
                            return processNext(index + 1);
                        });
                    }

                    return markQueuedActionFailure(records[index], result).then(function () {
                        return processNext(index + 1);
                    });
                });
            }

            return processNext(0).then(function () {
                if (hadTransientFailure) {
                    scheduleFlush(AUTO_FLUSH_DELAY_MS);
                }
            });
        }).catch(function () {
            scheduleFlush(AUTO_FLUSH_DELAY_MS);
        }).then(function () {
            flushInProgress = false;
        }).catch(function () {
            flushInProgress = false;
        });
    }

    function scheduleFlush(delay) {
        if (flushTimer) {
            clearTimeout(flushTimer);
        }

        flushTimer = setTimeout(function () {
            flushTimer = 0;
            flushPendingActions();
        }, typeof delay === 'number' ? delay : 0);
    }

    function refreshOfflineClockCredential(employeeId, offlineClockToken, offlineClockTokenExpiresAt) {
        var normalizedEmployeeId = String(employeeId || '').trim();
        var normalizedClockToken = String(offlineClockToken || '').trim();
        var nextExpiry = typeof offlineClockTokenExpiresAt === 'string' ? offlineClockTokenExpiresAt : '';

        if (!normalizedEmployeeId || !normalizedClockToken) {
            return Promise.resolve();
        }

        return getAllQueuedActions().then(function (records) {
            var updates = [];

            records.forEach(function (record) {
                if (String(record.employeeId || '') !== normalizedEmployeeId) return;
                if (record.offlineClockToken === normalizedClockToken &&
                    (!nextExpiry || record.offlineClockTokenExpiresAt === nextExpiry) &&
                    !record.blockedReason) {
                    return;
                }

                record.offlineClockToken = normalizedClockToken;
                if (nextExpiry) {
                    record.offlineClockTokenExpiresAt = nextExpiry;
                }
                record.blockedReason = '';
                record.blockedMessage = '';
                record.updatedAt = new Date().toISOString();
                updates.push(updateQueuedAction(record));
            });

            return Promise.all(updates);
        }).then(function () {
            return updateEmployeePinCache(normalizedEmployeeId, {
                offlineClockToken: normalizedClockToken,
                offlineClockTokenExpiresAt: nextExpiry
            }).catch(function () {
                return null;
            });
        }).then(function () {
            return refreshPendingState();
        }).then(function () {
            scheduleFlush(250);
        }).catch(function () {
            scheduleFlush(1000);
        });
    }

    function checkIn(options) {
        return sendClockAction('check-in', normalizeClockOptions(options));
    }

    function checkOut(options) {
        return sendClockAction('check-out', normalizeClockOptions(options));
    }

    function normalizeClockOptions(options) {
        var resolved = options || {};

        return {
            accessToken: typeof resolved.accessToken === 'string' ? resolved.accessToken.trim() : '',
            offlineClockToken: typeof resolved.offlineClockToken === 'string' ? resolved.offlineClockToken.trim() : '',
            offlineClockTokenExpiresAt: typeof resolved.offlineClockTokenExpiresAt === 'string' ? resolved.offlineClockTokenExpiresAt : '',
            clientDate: typeof resolved.clientDate === 'string' && resolved.clientDate ? resolved.clientDate : Utils.today(),
            clientTimestamp: typeof resolved.clientTimestamp === 'string' && resolved.clientTimestamp ? resolved.clientTimestamp : new Date().toISOString(),
            clientEventId: typeof resolved.clientEventId === 'string' && resolved.clientEventId ? resolved.clientEventId : generateClientEventId(),
            employeeId: resolved.employeeId || null,
            employeeName: typeof resolved.employeeName === 'string' ? resolved.employeeName : '',
            organizationId: resolved.organizationId || null,
            source: typeof resolved.source === 'string' ? resolved.source : ''
        };
    }

    function hasPendingForEmployee(employeeId) {
        return getPendingCount(employeeId) > 0;
    }

    function getPendingCount(employeeId) {
        var normalizedEmployeeId = String(employeeId || '').trim();
        if (!normalizedEmployeeId) return currentCount;
        return Number(pendingByEmployee[normalizedEmployeeId] || 0);
    }

    function getOptimisticStatus(employeeId, fallbackStatus) {
        var normalizedEmployeeId = String(employeeId || '').trim();
        if (!normalizedEmployeeId) {
            return fallbackStatus || 'not_checked_in';
        }

        return optimisticStatusByEmployee[normalizedEmployeeId] || fallbackStatus || 'not_checked_in';
    }

    function hashPinForCache(pin) {
        var orgSlug = typeof Api !== 'undefined' && Api && Api.ORG_SLUG ? Api.ORG_SLUG : '';
        var input = 'pickup-direct-offline:' + orgSlug + ':' + String(pin || '');

        if (!(window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined')) {
            return Promise.resolve('raw:' + input);
        }

        return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)).then(function (buffer) {
            var bytes = new Uint8Array(buffer);
            var parts = [];
            var index = 0;

            for (index = 0; index < bytes.length; index++) {
                parts.push(bytes[index].toString(16).padStart(2, '0'));
            }

            return parts.join('');
        });
    }

    function rememberVerifiedPin(pin, identity) {
        var normalizedPin = String(pin || '').trim();
        var resolved = identity || {};

        if (!/^[0-9]{4,6}$/.test(normalizedPin)) {
            return Promise.resolve();
        }
        if (!resolved.employeeId || !resolved.offlineClockToken) {
            return Promise.resolve();
        }

        return hashPinForCache(normalizedPin).then(function (cacheKey) {
            return putPinCache({
                cacheKey: cacheKey,
                employeeId: resolved.employeeId || null,
                employeeName: typeof resolved.employeeName === 'string' ? resolved.employeeName : '',
                organizationId: resolved.organizationId || null,
                offlineClockToken: typeof resolved.offlineClockToken === 'string' ? resolved.offlineClockToken : '',
                offlineClockTokenExpiresAt: typeof resolved.offlineClockTokenExpiresAt === 'string' ? resolved.offlineClockTokenExpiresAt : '',
                currentStatus: typeof resolved.currentStatus === 'string' ? resolved.currentStatus : 'not_checked_in',
                verifiedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }).catch(function () {
            return null;
        });
    }

    function resolveOfflinePin(pin) {
        var normalizedPin = String(pin || '').trim();

        if (!/^[0-9]{4,6}$/.test(normalizedPin)) {
            return Promise.resolve(null);
        }

        return hashPinForCache(normalizedPin).then(function (cacheKey) {
            return getPinCache(cacheKey).then(function (record) {
                if (!record) {
                    return {
                        errorCode: 'OFFLINE_CREDENTIAL_MISSING'
                    };
                }
                if (isPinCacheExpired(record)) {
                    return deletePinCache(cacheKey).then(function () {
                        return {
                            errorCode: 'OFFLINE_CREDENTIAL_EXPIRED'
                        };
                    }).catch(function () {
                        return {
                            errorCode: 'OFFLINE_CREDENTIAL_EXPIRED'
                        };
                    });
                }

                return {
                    employeeId: record.employeeId || null,
                    employeeName: record.employeeName || '',
                    organizationId: record.organizationId || null,
                    offlineClockToken: record.offlineClockToken || '',
                    offlineClockTokenExpiresAt: record.offlineClockTokenExpiresAt || '',
                    currentStatus: record.currentStatus || 'not_checked_in'
                };
            });
        }).catch(function () {
            return {
                errorCode: 'OFFLINE_CREDENTIAL_MISSING'
            };
        });
    }

    function isPinCacheExpired(record) {
        var expiry = Date.parse(record && record.offlineClockTokenExpiresAt ? record.offlineClockTokenExpiresAt : '');
        if (!expiry) return false;
        return expiry <= Date.now();
    }

    function purgeExpiredPinCache() {
        return getAllPinCaches().then(function (records) {
            var deletions = [];

            records.forEach(function (record) {
                if (!isPinCacheExpired(record)) return;
                deletions.push(deletePinCache(record.cacheKey));
            });

            return Promise.all(deletions);
        }).catch(function () {
            return null;
        });
    }

    function updateEmployeePinCache(employeeId, updates) {
        var normalizedEmployeeId = String(employeeId || '').trim();
        var resolvedUpdates = updates || {};

        if (!normalizedEmployeeId) {
            return Promise.resolve();
        }

        return getPinCachesByEmployee(normalizedEmployeeId).then(function (records) {
            var nextUpdates = [];

            records.forEach(function (record) {
                if (typeof resolvedUpdates.offlineClockToken === 'string') {
                    record.offlineClockToken = resolvedUpdates.offlineClockToken;
                }
                if (typeof resolvedUpdates.offlineClockTokenExpiresAt === 'string') {
                    record.offlineClockTokenExpiresAt = resolvedUpdates.offlineClockTokenExpiresAt;
                }
                if (typeof resolvedUpdates.currentStatus === 'string' && resolvedUpdates.currentStatus) {
                    record.currentStatus = resolvedUpdates.currentStatus;
                }
                record.updatedAt = new Date().toISOString();
                nextUpdates.push(putPinCache(record));
            });

            return Promise.all(nextUpdates);
        }).catch(function () {
            return null;
        });
    }

    init();

    return {
        init: init,
        checkIn: checkIn,
        checkOut: checkOut,
        rememberVerifiedPin: rememberVerifiedPin,
        resolveOfflinePin: resolveOfflinePin,
        isTransientVerifyFailure: isTransientVerifyFailure,
        getOptimisticStatus: getOptimisticStatus,
        hasPendingForEmployee: hasPendingForEmployee,
        refreshOfflineClockCredential: refreshOfflineClockCredential,
        flushPendingActions: flushPendingActions,
        getPendingCount: getPendingCount,
        hasPending: function () { return currentCount > 0; }
    };
})();
