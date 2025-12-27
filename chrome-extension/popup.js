// Brick Focus - Popup Script

const SUPABASE_URL = 'https://qardvdarvlznlooprlvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhcmR2ZGFydmx6bmxvb3BybHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MjA0MzMsImV4cCI6MjA4MTI5NjQzM30.6mk1w_gT9Xc6vLqLxnndl-64vZRgqdUBBLTCofUJZd8';

let focusMode = false;
let blockedSites = [];
let startTime = null;
let timerEndAt = null;
let timerInterval = null;
let userId = null;

// Elementos DOM - Link Screen
const linkScreenEl = document.getElementById('linkScreen');
const mainScreenEl = document.getElementById('mainScreen');
const linkCodeInputEl = document.getElementById('linkCodeInput');
const linkBtnEl = document.getElementById('linkBtn');
const linkErrorEl = document.getElementById('linkError');
const unlinkBtnEl = document.getElementById('unlinkBtn');

// Elementos DOM - Main Screen
const statusEl = document.getElementById('status');
const statusLabelEl = document.getElementById('statusLabel');
const toggleBtnEl = document.getElementById('toggleBtn');
const sitesListEl = document.getElementById('sitesList');
const connectionStatusEl = document.getElementById('connectionStatus');
const timerEl = document.getElementById('timer');
const newSiteInputEl = document.getElementById('newSiteInput');
const addSiteBtnEl = document.getElementById('addSiteBtn');
const statMinutesEl = document.getElementById('statMinutes');
const statSessionsEl = document.getElementById('statSessions');
const statBlockedEl = document.getElementById('statBlocked');

// Inicializar - verificar si está vinculado
async function init() {
  // Obtener userId guardado
  const stored = await chrome.storage.local.get(['userId']);
  userId = stored.userId || null;

  if (userId) {
    showMainScreen();
    await loadData();
  } else {
    showLinkScreen();
  }
}

function showLinkScreen() {
  linkScreenEl.classList.add('active');
  mainScreenEl.classList.remove('active');
}

function showMainScreen() {
  linkScreenEl.classList.remove('active');
  mainScreenEl.classList.add('active');
}

// Verificar código de vinculación
async function verifyLinkCode(code) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/link_codes?code=eq.${code}&select=user_id,expires_at`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    const data = await response.json();

    if (!data || data.length === 0) {
      return { valid: false, error: 'Código inválido' };
    }

    const linkCode = data[0];

    // Verificar expiración
    if (new Date(linkCode.expires_at) < new Date()) {
      return { valid: false, error: 'Código expirado' };
    }

    return { valid: true, userId: linkCode.user_id };
  } catch (error) {
    console.log('Error verifying code:', error);
    return { valid: false, error: 'Error de conexión' };
  }
}

// Event: Vincular
linkBtnEl.addEventListener('click', async () => {
  const code = linkCodeInputEl.value.trim();

  if (code.length !== 6) {
    linkErrorEl.textContent = 'Ingresa un código de 6 dígitos';
    linkErrorEl.style.display = 'block';
    return;
  }

  linkBtnEl.disabled = true;
  linkBtnEl.textContent = 'Verificando...';
  linkErrorEl.style.display = 'none';

  const result = await verifyLinkCode(code);

  if (result.valid) {
    userId = result.userId;
    await chrome.storage.local.set({ userId });

    // Notificar al background
    chrome.runtime.sendMessage({ type: 'set_user_id', userId });

    showMainScreen();
    await loadData();
  } else {
    linkErrorEl.textContent = result.error;
    linkErrorEl.style.display = 'block';
  }

  linkBtnEl.disabled = false;
  linkBtnEl.textContent = 'Vincular';
});

// Event: Desvincular
unlinkBtnEl.addEventListener('click', async () => {
  if (confirm('¿Desvincular esta extensión?')) {
    userId = null;
    await chrome.storage.local.remove(['userId']);
    chrome.runtime.sendMessage({ type: 'set_user_id', userId: null });
    showLinkScreen();
  }
});

// Cargar datos del usuario
async function loadData() {
  await fetchStatus();

  // Obtener estado del background
  chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
    if (response) {
      blockedSites = response.blockedSites || [];
      timerEndAt = response.timerEndAt || null;
      renderSitesList();
    }
  });

  updateUI();
  startTimer();
  loadStats();
}

// Obtener estado de Supabase
async function fetchStatus() {
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
    const data = await response.json();
    if (data && data[0]) {
      focusMode = data[0].is_locked;
      if (focusMode && data[0].last_updated) {
        startTime = new Date(data[0].last_updated).getTime();
      } else {
        startTime = null;
      }
      if (data[0].timer_end_at) {
        timerEndAt = new Date(data[0].timer_end_at).getTime();
      } else {
        timerEndAt = null;
      }
      connectionStatusEl.textContent = 'Conectado';
      connectionStatusEl.classList.add('connected');
    }
  } catch (error) {
    console.log('Error:', error);
    connectionStatusEl.textContent = 'Sin conexión';
    connectionStatusEl.classList.remove('connected');
  }
}

// Cargar estadísticas
function loadStats() {
  chrome.runtime.sendMessage({ type: 'get_stats' }, (stats) => {
    if (stats) {
      statMinutesEl.textContent = stats.totalMinutes || 0;
      statSessionsEl.textContent = stats.completedSessions || 0;
      statBlockedEl.textContent = stats.blockedAttempts || 0;
    }
  });
}

// Escuchar cambios de estado
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'focus_changed') {
    focusMode = message.active;
    if (focusMode) {
      startTime = Date.now();
    } else {
      startTime = null;
      setTimeout(loadStats, 500);
    }
    updateUI();
  }

  if (message.type === 'sites_changed') {
    blockedSites = message.blockedSites || [];
    renderSitesList();
  }
});

// Toggle focus mode
toggleBtnEl.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'toggle_focus' }, (response) => {
    if (response) {
      focusMode = response.focusMode;
      if (focusMode) {
        startTime = Date.now();
      } else {
        startTime = null;
      }
      updateUI();
    }
  });
});

// Agregar sitio
addSiteBtnEl.addEventListener('click', addSite);
newSiteInputEl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addSite();
});

async function addSite() {
  let domain = newSiteInputEl.value.trim().toLowerCase();
  if (!domain) return;

  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');

  if (!domain.includes('.')) {
    alert('Ingresa un dominio válido (ej: facebook.com)');
    return;
  }

  if (blockedSites.some(s => s.domain === domain)) {
    alert('Este sitio ya está en la lista');
    return;
  }

  addSiteBtnEl.disabled = true;

  chrome.runtime.sendMessage({ type: 'add_site', domain }, (response) => {
    addSiteBtnEl.disabled = false;
    if (response && response.success) {
      blockedSites.push({ domain, icon: '🌐' });
      renderSitesList();
      newSiteInputEl.value = '';
    } else {
      alert('Error al agregar sitio');
    }
  });
}

// Eliminar sitio
function removeSite(domain) {
  if (!confirm(`¿Eliminar ${domain}?`)) return;

  chrome.runtime.sendMessage({ type: 'remove_site', domain }, (response) => {
    if (response && response.success) {
      blockedSites = blockedSites.filter(s => s.domain !== domain);
      renderSitesList();
    }
  });
}

// Formatear tiempo
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Iniciar timer
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (focusMode) {
      if (timerEndAt) {
        const remaining = timerEndAt - Date.now();
        timerEl.textContent = remaining > 0 ? formatTime(remaining) : '00:00:00';
      } else if (startTime) {
        timerEl.textContent = formatTime(Date.now() - startTime);
      }
    }
  }, 1000);
}

// Actualizar UI
function updateUI() {
  if (focusMode) {
    statusEl.classList.remove('inactive');
    statusEl.classList.add('active');
    statusLabelEl.textContent = timerEndAt ? 'CUENTA REGRESIVA' : 'ACTIVO';
    toggleBtnEl.textContent = 'Desactivar Focus Mode';
    toggleBtnEl.classList.remove('activate');
    toggleBtnEl.classList.add('deactivate');
    timerEl.style.display = 'block';

    if (timerEndAt) {
      const remaining = timerEndAt - Date.now();
      timerEl.textContent = formatTime(Math.max(0, remaining));
    } else if (startTime) {
      timerEl.textContent = formatTime(Date.now() - startTime);
    }
  } else {
    statusEl.classList.remove('active');
    statusEl.classList.add('inactive');
    statusLabelEl.textContent = 'INACTIVO';
    toggleBtnEl.textContent = 'Activar Focus Mode';
    toggleBtnEl.classList.remove('deactivate');
    toggleBtnEl.classList.add('activate');
    timerEl.style.display = 'none';
    timerEndAt = null;
  }
}

// Renderizar sitios
function renderSitesList() {
  if (blockedSites.length === 0) {
    sitesListEl.innerHTML = '<div style="color: #666; font-size: 12px; text-align: center; padding: 10px;">No hay sitios bloqueados</div>';
    return;
  }

  sitesListEl.innerHTML = blockedSites.map(site => `
    <div class="site-item">
      <div class="site-icon">${site.icon || '🌐'}</div>
      <div class="site-name">${site.domain}</div>
      <button class="site-remove" data-domain="${site.domain}">×</button>
    </div>
  `).join('');

  sitesListEl.querySelectorAll('.site-remove').forEach(btn => {
    btn.addEventListener('click', () => removeSite(btn.dataset.domain));
  });
}

// Polling reducido - cada 10 segundos (background ya mantiene estado via WebSocket)
setInterval(async () => {
  if (userId) {
    await fetchStatus();
    updateUI();

    chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
      if (response) {
        const oldSites = JSON.stringify(blockedSites.map(s => s.domain).sort());
        const newSites = JSON.stringify((response.blockedSites || []).map(s => s.domain).sort());
        if (oldSites !== newSites) {
          blockedSites = response.blockedSites || [];
          renderSitesList();
        }
        // Sincronizar timerEndAt
        if (response.timerEndAt !== timerEndAt) {
          timerEndAt = response.timerEndAt;
        }
      }
    });
    loadStats();
  }
}, 10000);

// Inicializar
init();
