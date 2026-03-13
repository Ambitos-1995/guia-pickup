/* =====================================================
   REALTIME - Supabase Realtime subscription for schedule
   ===================================================== */
var Realtime = (function () {
    'use strict';

    var SUPABASE_URL = 'https://mzuvkinwebqgmnutchsv.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16dXZraW53ZWJxZ21udXRjaHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NjIyNzUsImV4cCI6MjA4NDEzODI3NX0.H3JZN7Fd26oXGI2NilZ-nVUmS_NiFUd3aKLj5V1yaks';

    var client = null;
    var channel = null;
    var debounceTimer = null;
    var DEBOUNCE_MS = 500;

    function init() {
        if (typeof supabase === 'undefined' || !supabase.createClient) {
            console.warn('Realtime: Supabase client not available');
            return;
        }

        client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            realtime: { params: { eventsPerSecond: 2 } },
            auth: { persistSession: false, autoRefreshToken: false }
        });

        subscribe();
        document.addEventListener('visibilitychange', handleVisibility);
    }

    function subscribe() {
        if (!client) return;

        if (channel) {
            client.removeChannel(channel);
            channel = null;
        }

        channel = client.channel('schedule-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'kiosk_schedule_slots' },
                handleChange
            )
            .subscribe(function (status) {
                if (status === 'SUBSCRIBED') {
                    console.log('Realtime: subscribed to schedule changes');
                }
                if (status === 'CHANNEL_ERROR') {
                    console.warn('Realtime: channel error, will auto-retry');
                }
                if (status === 'TIMED_OUT') {
                    console.warn('Realtime: timed out, retrying...');
                    setTimeout(subscribe, 5000);
                }
            });
    }

    function handleChange() {
        if (typeof Schedule !== 'undefined' && Schedule.invalidateCache) {
            Schedule.invalidateCache();
        }

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            if (typeof Schedule !== 'undefined' && Schedule.refreshIfVisible) {
                Schedule.refreshIfVisible();
            }
        }, DEBOUNCE_MS);
    }

    function handleVisibility() {
        if (document.visibilityState === 'visible' && channel) {
            var state = channel.state;
            if (state === 'closed' || state === 'errored') {
                subscribe();
            }
        }
    }

    function destroy() {
        document.removeEventListener('visibilitychange', handleVisibility);
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        if (channel && client) {
            client.removeChannel(channel);
            channel = null;
        }
        client = null;
    }

    return {
        init: init,
        destroy: destroy
    };
})();
