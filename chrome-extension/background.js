// Brick Focus - Background Service Worker
// Conecta con Supabase Realtime para sincronizar estado

const SUPABASE_URL = 'https://qardvdarvlznlooprlvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhcmR2ZGFydmx6bmxvb3BybHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MjA0MzMsImV4cCI6MjA4MTI5NjQzM30.6mk1w_gT9Xc6vLqLxnndl-64vZRgqdUBBLTCofUJZd8';

const CONFIG = {
  BLOCKED_SITES: [
    'instagram.com',
    'twitter.com',
    'x.com',
    'tiktok.com',
    'facebook.com',
    'youtube.com',
    'reddit.com',
    'twitch.tv'
  ]
};

let focusMode = false;
let realtimeChannel = null;

// Inicializar
chrome.storage.local.get(['focusMode', 'blockedSites'], (result) => {
  focusMode = result.focusMode || false;
  if (result.blockedSites) {
    CONFIG.BLOCKED_SITES = result.blockedSites;
  }
  updateBlockingRules();
  initSupabase();
});

// Obtener estado actual de Supabase
async function fetchCurrentStatus() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/brick_config?id=eq.1&select=*`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    const data = await response.json();
    if (data && data[0]) {
      setFocusMode(data[0].is_locked);
    }
  } catch (error) {
    console.log('Brick Focus: Error obteniendo estado:', error);
  }
}

// Actualizar estado en Supabase
async function updateSupabaseStatus(isLocked) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/brick_config?id=eq.1`,
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

// Conectar a Supabase Realtime via WebSocket
function connectRealtime() {
  const wsUrl = `${SUPABASE_URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Brick Focus: Conectado a Supabase Realtime');

    // Join al canal de postgres_changes
    const joinMsg = {
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
    ws.send(JSON.stringify(joinMsg));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Brick Focus: Mensaje recibido:', data);

      // Manejar cambios de postgres
      if (data.event === 'postgres_changes' && data.payload?.data?.record) {
        const record = data.payload.data.record;
        console.log('Brick Focus: Cambio detectado, is_locked:', record.is_locked);
        setFocusMode(record.is_locked);
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
    console.log('Brick Focus: Desconectado, reconectando...');
    setTimeout(connectRealtime, 5000);
  };

  ws.onerror = (error) => {
    console.log('Brick Focus: Error WebSocket');
  };
}

// Activar/desactivar focus mode
function setFocusMode(active) {
  if (focusMode === active) return; // Sin cambios

  focusMode = active;
  chrome.storage.local.set({ focusMode: active });
  updateBlockingRules();
  updateIcon();

  // Notificar al popup si está abierto
  chrome.runtime.sendMessage({ type: 'focus_changed', active: focusMode }).catch(() => {});

  console.log('Brick Focus: Modo focus', active ? 'ACTIVADO' : 'DESACTIVADO');
}

function toggleFocusMode() {
  const newState = !focusMode;
  setFocusMode(newState);
  updateSupabaseStatus(newState);
}

// Actualizar reglas de bloqueo
function updateBlockingRules() {
  if (focusMode) {
    chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: ['block_rules']
    }).catch(console.error);
  } else {
    chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: ['block_rules']
    }).catch(console.error);
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
    case 'get_status':
      sendResponse({ focusMode, blockedSites: CONFIG.BLOCKED_SITES });
      break;
    case 'toggle_focus':
      toggleFocusMode();
      sendResponse({ focusMode: !focusMode });
      break;
    case 'update_sites':
      CONFIG.BLOCKED_SITES = message.sites;
      chrome.storage.local.set({ blockedSites: message.sites });
      if (focusMode) updateBlockingRules();
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Polling como backup cada 10 segundos
setInterval(fetchCurrentStatus, 10000);
