// Mostrar tiempo transcurrido en focus mode
const SUPABASE_URL = 'https://qardvdarvlznlooprlvu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhcmR2ZGFydmx6bmxvb3BybHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3MjA0MzMsImV4cCI6MjA4MTI5NjQzM30.6mk1w_gT9Xc6vLqLxnndl-64vZRgqdUBBLTCofUJZd8';

let startTime = null;

// Obtener tiempo de inicio desde Supabase
async function fetchStartTime() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/brick_config?id=eq.1&select=last_updated,is_locked`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    );
    const data = await response.json();
    if (data && data[0] && data[0].is_locked && data[0].last_updated) {
      startTime = new Date(data[0].last_updated).getTime();
      updateTimer();
      setInterval(updateTimer, 1000);
    }
  } catch (error) {
    console.log('Error:', error);
  }
}

function updateTimer() {
  if (!startTime) return;

  const elapsed = Date.now() - startTime;
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  document.getElementById('timer').textContent =
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

fetchStartTime();

// Botón volver atrás
document.getElementById('backBtn').addEventListener('click', (e) => {
  e.preventDefault();
  history.back();
});
