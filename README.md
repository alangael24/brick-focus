# 🧱 Brick Focus

Bloquea sitios distractores en tu PC cuando activas el modo focus desde tu teléfono (usando NFC).

## Arquitectura

```
   ┌──────────┐                      ┌──────────────┐
   │   TAG    │  ◄── Tap ──────►    │   TELÉFONO   │
   │   NFC    │                      │     APP      │
   └──────────┘                      └──────┬───────┘
                                            │
                                     WebSocket
                                            │
                                     ┌──────▼───────┐
                                     │   SERVIDOR   │
                                     │   Node.js    │
                                     └──────┬───────┘
                                            │
                                     WebSocket
                                            │
                                     ┌──────▼───────┐
                                     │   EXTENSIÓN  │
                                     │    CHROME    │
                                     └──────────────┘
```

## Instalación

### 1. Backend (Servidor)

```bash
cd backend
npm install
npm start
```

El servidor corre en `http://localhost:3000`

### 2. Extensión de Chrome

1. Abre Chrome y ve a `chrome://extensions/`
2. Activa "Modo desarrollador" (esquina superior derecha)
3. Click en "Cargar descomprimida"
4. Selecciona la carpeta `chrome-extension`

### 3. Probar sin móvil

Puedes simular el tap NFC usando curl:

```bash
# Ver estado actual
curl http://localhost:3000/api/status

# Simular tap NFC (toggle focus)
curl -X POST http://localhost:3000/api/nfc-tap
```

## Sitios bloqueados por defecto

- instagram.com
- twitter.com / x.com
- tiktok.com
- facebook.com
- youtube.com
- reddit.com
- twitch.tv

## App Móvil (pendiente)

La app móvil se desarrollará con React Native y permitirá:
- Leer tags NFC para activar/desactivar focus
- Ver estado actual
- Configurar sitios bloqueados

## Hardware necesario

- 1x Tag NFC NTAG215 (~$0.50)
- Opcional: carcasa decorativa para el tag

## Desarrollo

### Estructura del proyecto

```
brick-focus/
├── backend/           # Servidor Node.js + WebSocket
├── chrome-extension/  # Extensión de Chrome
└── mobile-app/        # App React Native (pendiente)
```
