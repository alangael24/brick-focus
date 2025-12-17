// Mostrar tiempo en focus mode - sincronizado con Supabase
const SUPABASE_URL = 'https://qardvdarvlznlooprlvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhcmR2ZGFydmx6bmxvb3BybHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MjA0MzMsImV4cCI6MjA4MTI5NjQzM30.6mk1w_gT9Xc6vLqLxnndl-64vZRgqdUBBLTCofUJZd8';

let startTime = null;
let timerEndAt = null;
let userId = null;

// Obtener userId y tiempo desde Supabase
async function init() {
  // Obtener userId del storage de Chrome
  const stored = await chrome.storage.local.get(['userId']);
  userId = stored.userId;

  if (!userId) {
    document.getElementById('timer').textContent = '--:--:--';
    return;
  }

  await fetchStatus();
  setInterval(fetchStatus, 5000); // Actualizar cada 5 segundos
  setInterval(updateTimer, 1000); // Actualizar display cada segundo
}

async function fetchStatus() {
  if (!userId) return;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/brick_config?user_id=eq.${userId}&select=last_updated,is_locked,timer_end_at`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    const data = await response.json();

    if (data && data[0]) {
      if (data[0].is_locked && data[0].last_updated) {
        startTime = new Date(data[0].last_updated).getTime();
      } else {
        startTime = null;
      }

      if (data[0].timer_end_at) {
        timerEndAt = new Date(data[0].timer_end_at).getTime();
      } else {
        timerEndAt = null;
      }

      // Si ya no está bloqueado, redirigir de vuelta
      if (!data[0].is_locked) {
        history.back();
      }

      updateTimer();
    }
  } catch (error) {
    console.log('Error:', error);
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimer() {
  const timerEl = document.getElementById('timer');
  const timerLabelEl = document.querySelector('.timer-label');

  if (timerEndAt) {
    // Modo countdown
    const remaining = timerEndAt - Date.now();
    if (remaining > 0) {
      timerEl.textContent = formatTime(remaining);
      timerLabelEl.textContent = 'Tiempo restante';
    } else {
      timerEl.textContent = '00:00:00';
      timerLabelEl.textContent = 'Completado';
    }
  } else if (startTime) {
    // Modo count up
    const elapsed = Date.now() - startTime;
    timerEl.textContent = formatTime(elapsed);
    timerLabelEl.textContent = 'Tiempo en focus';
  } else {
    timerEl.textContent = '--:--:--';
  }
}

init();

// Botón volver atrás
document.getElementById('backBtn').addEventListener('click', (e) => {
  e.preventDefault();
  history.back();
});
