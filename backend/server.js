// Brick Focus - Backend Server
// Sincroniza el estado de focus entre todos los dispositivos conectados

const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Estado global del focus mode
let focusState = {
  active: false,
  startTime: null,
  blockedSites: [
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

// Clientes conectados
const clients = new Set();

// WebSocket connections
wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString(36);
  clients.add(ws);

  console.log(`Cliente conectado: ${clientId} (Total: ${clients.size})`);

  // Enviar estado actual al nuevo cliente
  ws.send(JSON.stringify({
    type: 'focus_status',
    active: focusState.active,
    startTime: focusState.startTime,
    blockedSites: focusState.blockedSites
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Cliente desconectado (Total: ${clients.size})`);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Manejar mensajes de los clientes
function handleMessage(sender, message) {
  switch (message.type) {
    case 'get_status':
      sender.send(JSON.stringify({
        type: 'focus_status',
        active: focusState.active,
        startTime: focusState.startTime,
        blockedSites: focusState.blockedSites
      }));
      break;

    case 'focus_status':
      // Actualizar estado y notificar a todos
      focusState.active = message.active;
      focusState.startTime = message.active ? Date.now() : null;

      console.log(`Focus mode: ${focusState.active ? 'ACTIVADO' : 'DESACTIVADO'} (desde ${message.source || 'unknown'})`);

      broadcast({
        type: 'focus_status',
        active: focusState.active,
        startTime: focusState.startTime,
        source: message.source
      }, sender);
      break;

    case 'toggle_focus':
      // Toggle y notificar a todos
      focusState.active = !focusState.active;
      focusState.startTime = focusState.active ? Date.now() : null;

      console.log(`Focus mode toggled: ${focusState.active ? 'ACTIVADO' : 'DESACTIVADO'}`);

      broadcast({
        type: 'focus_status',
        active: focusState.active,
        startTime: focusState.startTime
      });
      break;

    case 'update_sites':
      focusState.blockedSites = message.sites;
      broadcast({
        type: 'update_sites',
        sites: focusState.blockedSites
      });
      break;

    case 'nfc_tap':
      // Cuando se toca el tag NFC desde el móvil
      focusState.active = !focusState.active;
      focusState.startTime = focusState.active ? Date.now() : null;

      console.log(`NFC TAP - Focus mode: ${focusState.active ? 'ACTIVADO' : 'DESACTIVADO'}`);

      broadcast({
        type: 'focus_status',
        active: focusState.active,
        startTime: focusState.startTime,
        source: 'nfc'
      });
      break;
  }
}

// Enviar mensaje a todos los clientes (excepto sender opcional)
function broadcast(message, excludeSender = null) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== excludeSender && client.readyState === 1) {
      client.send(data);
    }
  });
}

// REST API para verificar estado (útil para debugging)
app.get('/api/status', (req, res) => {
  res.json({
    focusActive: focusState.active,
    startTime: focusState.startTime,
    blockedSites: focusState.blockedSites,
    connectedClients: clients.size
  });
});

// Toggle via REST (útil para testing)
app.post('/api/toggle', (req, res) => {
  focusState.active = !focusState.active;
  focusState.startTime = focusState.active ? Date.now() : null;

  broadcast({
    type: 'focus_status',
    active: focusState.active,
    startTime: focusState.startTime,
    source: 'api'
  });

  res.json({ success: true, focusActive: focusState.active });
});

// Simular tap NFC via REST (para testing sin móvil)
app.post('/api/nfc-tap', (req, res) => {
  focusState.active = !focusState.active;
  focusState.startTime = focusState.active ? Date.now() : null;

  broadcast({
    type: 'focus_status',
    active: focusState.active,
    startTime: focusState.startTime,
    source: 'nfc'
  });

  console.log(`[API] NFC TAP simulado - Focus: ${focusState.active}`);
  res.json({ success: true, focusActive: focusState.active });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║         🧱 BRICK FOCUS SERVER            ║
╠══════════════════════════════════════════╣
║  WebSocket: ws://localhost:${PORT}          ║
║  REST API:  http://localhost:${PORT}/api    ║
╠══════════════════════════════════════════╣
║  Endpoints:                              ║
║  GET  /api/status  - Ver estado          ║
║  POST /api/toggle  - Cambiar focus       ║
║  POST /api/nfc-tap - Simular NFC         ║
╚══════════════════════════════════════════╝
  `);
});
