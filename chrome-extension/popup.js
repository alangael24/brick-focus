// Brick Focus - Popup Script

const SUPABASE_URL = 'https://qardvdarvlznlooprlvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhcmR2ZGFydmx6bmxvb3BybHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MjA0MzMsImV4cCI6MjA4MTI5NjQzM30.6mk1w_gT9Xc6vLqLxnndl-64vZRgqdUBBLTCofUJZd8';

const SITE_ICONS = {
  'instagram.com': '📷',
  'twitter.com': '🐦',
  'x.com': '𝕏',
  'tiktok.com': '🎵',
  'facebook.com': '👤',
  'youtube.com': '▶️',
  'reddit.com': '🤖',
  'twitch.tv': '🎮'
};

let focusMode = false;
let blockedSites = [];
let startTime = null;
let timerInterval = null;

// Elementos DOM
const statusEl = document.getElementById('status');
const statusLabelEl = document.getElementById('statusLabel');
const toggleBtnEl = document.getElementById('toggleBtn');
const sitesListEl = document.getElementById('sitesList');
const connectionStatusEl = document.getElementById('connectionStatus');
const timerEl = document.getElementById('timer');

// Obtener estado de Supabase
async function fetchStatus() {
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
    console.log('Supabase data:', data);
    if (data && data[0]) {
      focusMode = data[0].is_locked;
      console.log('is_locked:', focusMode);
      console.log('last_updated:', data[0].last_updated);
      if (focusMode && data[0].last_updated) {
        startTime = new Date(data[0].last_updated).getTime();
        console.log('startTime:', startTime);
        console.log('now:', Date.now());
        console.log('elapsed:', Date.now() - startTime);
      } else {
        startTime = null;
      }
      connectionStatusEl.textContent = 'Conectado a Supabase';
      connectionStatusEl.classList.add('connected');
    }
  } catch (error) {
    console.log('Error:', error);
    connectionStatusEl.textContent = 'Error de conexión';
    connectionStatusEl.classList.remove('connected');
  }
}

// Obtener estado inicial del background
chrome.runtime.sendMessage({ type: 'get_status' }, async (response) => {
  if (response) {
    blockedSites = response.blockedSites || [];
    renderSitesList();
  }

  // Obtener estado y tiempo de Supabase
  await fetchStatus();
  updateUI();
  startTimer();
});

// Escuchar cambios de estado
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'focus_changed') {
    focusMode = message.active;
    if (focusMode) {
      startTime = Date.now();
    } else {
      startTime = null;
    }
    updateUI();
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
    if (focusMode && startTime) {
      const elapsed = Date.now() - startTime;
      timerEl.textContent = formatTime(elapsed);
    }
  }, 1000);
}

// Actualizar UI según estado
function updateUI() {
  if (focusMode) {
    statusEl.classList.remove('inactive');
    statusEl.classList.add('active');
    statusLabelEl.textContent = 'ACTIVO';
    toggleBtnEl.textContent = 'Desactivar Focus Mode';
    toggleBtnEl.classList.remove('activate');
    toggleBtnEl.classList.add('deactivate');
    timerEl.style.display = 'block';

    // Mostrar tiempo actual si hay startTime
    if (startTime) {
      const elapsed = Date.now() - startTime;
      timerEl.textContent = formatTime(elapsed);
    }
  } else {
    statusEl.classList.remove('active');
    statusEl.classList.add('inactive');
    statusLabelEl.textContent = 'INACTIVO';
    toggleBtnEl.textContent = 'Activar Focus Mode';
    toggleBtnEl.classList.remove('deactivate');
    toggleBtnEl.classList.add('activate');
    timerEl.style.display = 'none';
    timerEl.textContent = '00:00:00';
  }
}

// Renderizar lista de sitios bloqueados
function renderSitesList() {
  sitesListEl.innerHTML = blockedSites.map(site => `
    <div class="site-item">
      <div class="site-icon">${SITE_ICONS[site] || '🌐'}</div>
      <div class="site-name">${site}</div>
    </div>
  `).join('');
}
