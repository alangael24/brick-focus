// Brick Focus - Background Service Worker
// Conecta con Supabase Realtime para sincronizar estado

const SUPABASE_URL = 'https://qardvdarvlznlooprlvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhcmR2ZGFydmx6bmxvb3BybHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MjA0MzMsImV4cCI6MjA4MTI5NjQzM30.6mk1w_gT9Xc6vLqLxnndl-64vZRgqdUBBLTCofUJZd8';

let userId = null;
let focusMode = false;
let blockedSites = [];
let currentSessionId = null;
let timerEndAt = null;
let timerCheckInterval = null;

// Inicializar
chrome.storage.local.get(['focusMode', 'userId'], async (result) => {
  focusMode = result.focusMode || false;
  userId = result.userId || null;

  if (userId) {
    await fetchBlockedSites();
    updateBlockingRules();
    initSupabase();
  }
});

// Obtener sitios bloqueados de Supabase
async function fetchBlockedSites() {
  if (!userId) return;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/blocked_sites?user_id=eq.${userId}&select=*&order=id`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      console.log('Brick Focus: Error HTTP obteniendo sitios:', response.status);
      return;
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      blockedSites = data;
      console.log('Brick Focus: Sitios bloqueados cargados:', blockedSites.length);
    }
  } catch (error) {
    console.log('Brick Focus: Error obteniendo sitios:', error);
  }
}

// Agregar sitio a Supabase
async function addBlockedSite(domain, icon = '🌐') {
  if (!userId) return { success: false, error: 'No vinculado' };

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/blocked_sites`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ domain, icon, user_id: userId })
      }
    );
    if (response.ok) {
      const data = await response.json();
      blockedSites.push(data[0]);
      updateBlockingRules();
      return { success: true };
    }
    return { success: false, error: 'Ya existe' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Eliminar sitio de Supabase
async function removeBlockedSite(domain) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/blocked_sites?domain=eq.${encodeURIComponent(domain)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    blockedSites = blockedSites.filter(s => s.domain !== domain);
    updateBlockingRules();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ========== ANALYTICS ==========

// Iniciar sesión de focus
async function startFocusSession() {
  if (!userId) {
    console.log('Brick Focus: No user_id, skipping session start');
    return;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/focus_sessions`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          user_id: userId,
          started_at: new Date().toISOString(),
          source: 'chrome',
          completed: false
        })
      }
    );
    const data = await response.json();
    if (data && data[0]) {
      currentSessionId = data[0].id;
      console.log('Brick Focus: Session started', currentSessionId);
    }
  } catch (error) {
    console.log('Brick Focus: Error starting session', error);
  }
}

// Finalizar sesión de focus
async function endFocusSession() {
  if (!currentSessionId) return;

  try {
    // Obtener la sesión para calcular duración
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/focus_sessions?id=eq.${currentSessionId}&select=started_at`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    const sessions = await response.json();

    if (sessions && sessions[0]) {
      const startedAt = new Date(sessions[0].started_at);
      const endedAt = new Date();
      const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

      await fetch(
        `${SUPABASE_URL}/rest/v1/focus_sessions?id=eq.${currentSessionId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ended_at: endedAt.toISOString(),
            duration_seconds: durationSeconds,
            completed: true
          })
        }
      );
      console.log('Brick Focus: Session ended', currentSessionId, `(${durationSeconds}s)`);
    }

    currentSessionId = null;
  } catch (error) {
    console.log('Brick Focus: Error ending session', error);
  }
}

// Registrar intento de acceso bloqueado
async function logBlockedAttempt(domain) {
  if (!userId) return;

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/blocked_attempts`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          session_id: currentSessionId,
          domain,
          source: 'chrome'
        })
      }
    );
    console.log('Brick Focus: Blocked attempt logged', domain);
  } catch (error) {
    console.log('Brick Focus: Error logging blocked attempt', error);
  }
}

// Obtener estadísticas de hoy
async function getTodayStats() {
  if (!userId) {
    return { totalSessions: 0, completedSessions: 0, totalMinutes: 0, blockedAttempts: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Sesiones de hoy (filtradas por user_id)
    const sessionsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/focus_sessions?user_id=eq.${userId}&started_at=gte.${today.toISOString()}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    const sessions = await sessionsRes.json();

    // Intentos bloqueados hoy (filtrados por user_id)
    const attemptsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/blocked_attempts?user_id=eq.${userId}&attempted_at=gte.${today.toISOString()}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    const attempts = await attemptsRes.json();

    const totalSeconds = (Array.isArray(sessions) ? sessions : [])
      .filter(s => s.duration_seconds)
      .reduce((acc, s) => acc + s.duration_seconds, 0);

    return {
      totalSessions: Array.isArray(sessions) ? sessions.length : 0,
      completedSessions: Array.isArray(sessions) ? sessions.filter(s => s.completed).length : 0,
      totalMinutes: Math.floor(totalSeconds / 60),
      blockedAttempts: Array.isArray(attempts) ? attempts.length : 0
    };
  } catch (error) {
    console.log('Brick Focus: Error getting stats', error);
    return { totalSessions: 0, completedSessions: 0, totalMinutes: 0, blockedAttempts: 0 };
  }
}

// Obtener estado actual de Supabase
async function fetchCurrentStatus() {
  if (!userId) return;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/brick_config?user_id=eq.${userId}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      console.log('Brick Focus: Error HTTP obteniendo estado:', response.status);
      return;
    }

    const data = await response.json();
    if (Array.isArray(data) && data[0]) {
      setFocusMode(data[0].is_locked);
      // Cargar timer si existe
      if (data[0].timer_end_at) {
        timerEndAt = new Date(data[0].timer_end_at).getTime();
        startTimerCheck();
      } else {
        timerEndAt = null;
        stopTimerCheck();
      }
    }
  } catch (error) {
    console.log('Brick Focus: Error obteniendo estado:', error);
  }
}

// Verificar si el timer terminó
function startTimerCheck() {
  if (timerCheckInterval) return;
  timerCheckInterval = setInterval(() => {
    if (timerEndAt && Date.now() >= timerEndAt) {
      console.log('Brick Focus: Timer completado, desactivando...');
      autoDeactivateFocus();
    }
  }, 1000);
}

function stopTimerCheck() {
  if (timerCheckInterval) {
    clearInterval(timerCheckInterval);
    timerCheckInterval = null;
  }
}

// Auto-desactivar cuando termina el timer
async function autoDeactivateFocus() {
  stopTimerCheck();
  timerEndAt = null;

  // Mostrar notificación
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '¡Tiempo completado! 🎉',
    message: 'Tu sesión de focus ha terminado.',
    priority: 2
  });

  // Desactivar focus
  focusMode = false;
  chrome.storage.local.set({ focusMode: false });
  updateBlockingRules();
  updateIcon();

  // Finalizar sesión
  await endFocusSession();

  // Actualizar en Supabase (usar user_id en lugar de id hardcodeado)
  if (userId) {
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/brick_config?user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            is_locked: false,
            timer_duration_seconds: null,
            timer_end_at: null,
            last_updated: new Date().toISOString()
          })
        }
      );
    } catch (error) {
      console.log('Brick Focus: Error desactivando:', error);
    }
  }

  // Notificar al popup
  chrome.runtime.sendMessage({ type: 'focus_changed', active: false }).catch(() => {});
}

// Actualizar estado en Supabase
async function updateSupabaseStatus(isLocked) {
  if (!userId) return;

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/brick_config?user_id=eq.${userId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ is_locked: isLocked })
      }
    );
  } catch (error) {
    console.log('Brick Focus: Error actualizando estado:', error);
  }
}

// Inicializar Supabase Realtime
function initSupabase() {
  // Obtener estado inicial
  fetchCurrentStatus();

  // Conectar a Realtime usando WebSocket nativo
  connectRealtime();
}

// Variables para reconexión con backoff exponencial
let wsReconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 60000; // 1 minuto máximo

// Conectar a Supabase Realtime via WebSocket
function connectRealtime() {
  const wsUrl = `${SUPABASE_URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Brick Focus: Conectado a Supabase Realtime');
    wsReconnectAttempts = 0; // Reset en conexión exitosa

    // Join al canal de brick_config
    const joinConfigMsg = {
      topic: 'realtime:public:brick_config',
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
          postgres_changes: [
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'brick_config',
              filter: 'id=eq.1'
            }
          ]
        }
      },
      ref: '1'
    };
    ws.send(JSON.stringify(joinConfigMsg));

    // Join al canal de blocked_sites
    const joinSitesMsg = {
      topic: 'realtime:public:blocked_sites',
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
          postgres_changes: [
            {
              event: '*',
              schema: 'public',
              table: 'blocked_sites'
            }
          ]
        }
      },
      ref: '2'
    };
    ws.send(JSON.stringify(joinSitesMsg));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Brick Focus: Mensaje recibido:', data);

      // Manejar cambios de postgres
      if (data.event === 'postgres_changes' && data.payload?.data) {
        const table = data.payload.data.table;

        if (table === 'brick_config' && data.payload.data.record) {
          const record = data.payload.data.record;
          console.log('Brick Focus: Cambio en brick_config, is_locked:', record.is_locked);
          setFocusMode(record.is_locked);
        }

        if (table === 'blocked_sites') {
          console.log('Brick Focus: Cambio en blocked_sites, recargando...');
          fetchBlockedSites().then(() => {
            updateBlockingRules();
            // Notificar al popup
            chrome.runtime.sendMessage({ type: 'sites_changed', blockedSites }).catch(() => {});
          });
        }
      }

      // Heartbeat
      if (data.event === 'phx_reply' || data.event === 'heartbeat') {
        // Enviar heartbeat de vuelta
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: Date.now().toString()
            }));
          }
        }, 30000);
      }
    } catch (e) {
      console.log('Brick Focus: Error parseando mensaje:', e);
    }
  };

  ws.onclose = () => {
    wsReconnectAttempts++;
    // Backoff exponencial: 1s, 2s, 4s, 8s, 16s, 32s, 60s (max)
    const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts - 1), MAX_RECONNECT_DELAY);
    console.log(`Brick Focus: Desconectado, reconectando en ${delay/1000}s (intento ${wsReconnectAttempts})`);
    setTimeout(connectRealtime, delay);
  };

  ws.onerror = (error) => {
    console.log('Brick Focus: Error WebSocket');
  };
}

// Activar/desactivar focus mode
async function setFocusMode(active) {
  if (focusMode === active) return; // Sin cambios

  focusMode = active;
  chrome.storage.local.set({ focusMode: active });
  updateBlockingRules();
  updateIcon();

  // Iniciar o finalizar sesión de analytics
  if (active) {
    await startFocusSession();
  } else {
    await endFocusSession();
  }

  // Notificar al popup si está abierto
  chrome.runtime.sendMessage({ type: 'focus_changed', active: focusMode }).catch(() => {});

  console.log('Brick Focus: Modo focus', active ? 'ACTIVADO' : 'DESACTIVADO');
}

function toggleFocusMode() {
  const newState = !focusMode;
  setFocusMode(newState);
  updateSupabaseStatus(newState);
}

// Actualizar reglas de bloqueo dinámicas
async function updateBlockingRules() {
  // Primero eliminar todas las reglas dinámicas existentes
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRuleIds = existingRules.map(r => r.id);

  if (existingRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds
    });
  }

  // Si focus mode está activo, crear reglas para cada sitio
  if (focusMode && blockedSites.length > 0) {
    const rules = blockedSites.map((site, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { extensionPath: '/blocked.html' }
      },
      condition: {
        urlFilter: `||${site.domain}`,
        resourceTypes: ['main_frame']
      }
    }));

    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rules
    });

    console.log('Brick Focus: Reglas de bloqueo activadas:', rules.length);
  } else {
    console.log('Brick Focus: Reglas de bloqueo desactivadas');
  }
}

// Actualizar icono según estado
function updateIcon() {
  const iconPath = focusMode ? 'icons/icon-active' : 'icons/icon';
  chrome.action.setIcon({
    path: {
      16: `${iconPath}16.png`,
      48: `${iconPath}48.png`,
      128: `${iconPath}128.png`
    }
  }).catch(() => {});

  chrome.action.setBadgeText({ text: focusMode ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
}

// Escuchar mensajes del popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'set_user_id':
      userId = message.userId;
      if (userId) {
        fetchBlockedSites().then(() => {
          updateBlockingRules();
          initSupabase();
        });
      } else {
        blockedSites = [];
        updateBlockingRules();
      }
      sendResponse({ success: true });
      break;
    case 'get_status':
      sendResponse({ focusMode, blockedSites, timerEndAt });
      break;
    case 'toggle_focus':
      toggleFocusMode();
      sendResponse({ focusMode: !focusMode });
      break;
    case 'add_site':
      addBlockedSite(message.domain, message.icon).then(sendResponse);
      return true; // async response
    case 'remove_site':
      removeBlockedSite(message.domain).then(sendResponse);
      return true; // async response
    case 'refresh_sites':
      fetchBlockedSites().then(() => {
        updateBlockingRules();
        sendResponse({ success: true, blockedSites });
      });
      return true; // async response
    case 'get_stats':
      getTodayStats().then(sendResponse);
      return true; // async response
    case 'log_blocked':
      logBlockedAttempt(message.domain).then(() => sendResponse({ success: true }));
      return true; // async response
  }
  return true;
});

// Detectar navegación a sitios bloqueados
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return; // Solo main frame
  if (!focusMode) return;

  try {
    const url = new URL(details.url);
    const domain = url.hostname.replace(/^www\./, '');

    // Verificar si el dominio está bloqueado
    const isBlocked = blockedSites.some(site => {
      return domain === site.domain || domain.endsWith('.' + site.domain);
    });

    if (isBlocked) {
      logBlockedAttempt(domain);
    }
  } catch (e) {
    // URL inválida, ignorar
  }
});

// Polling cada 30 segundos como fallback (WebSocket es la fuente principal)
setInterval(async () => {
  if (!userId) return;

  await fetchCurrentStatus();

  const oldSites = JSON.stringify(blockedSites.map(s => s.domain).sort());
  await fetchBlockedSites();
  const newSites = JSON.stringify(blockedSites.map(s => s.domain).sort());

  if (oldSites !== newSites) {
    console.log('Brick Focus: Sitios cambiaron, actualizando...');
    updateBlockingRules();
    chrome.runtime.sendMessage({ type: 'sites_changed', blockedSites }).catch(() => {});
  }
}, 30000);
