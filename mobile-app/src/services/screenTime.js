import { Platform } from 'react-native';

// Intentar importar el módulo de forma segura
let ReactNativeDeviceActivity = null;
try {
  ReactNativeDeviceActivity = require('react-native-device-activity');
} catch (e) {
  console.log('react-native-device-activity not available');
}

// Constantes para identificar selecciones y actividades
const SELECTION_ID = 'brick_focus_blocked_apps';
const ACTIVITY_NAME = 'brick_focus_session';
const SHIELD_ID = 'brick_focus_shield';

// Verificar si Screen Time está disponible (solo iOS y módulo instalado)
export const isScreenTimeAvailable = () => {
  return Platform.OS === 'ios' && ReactNativeDeviceActivity !== null;
};

export const screenTimeService = {
  // Estado de autorización
  authorizationStatus: null,

  // Solicitar autorización de Screen Time
  async requestAuthorization() {
    if (!isScreenTimeAvailable()) {
      console.log('Screen Time solo está disponible en iOS');
      return 'unavailable';
    }

    try {
      const status = await ReactNativeDeviceActivity.requestAuthorization();
      this.authorizationStatus = status;
      console.log('Screen Time authorization status:', status);
      return status;
    } catch (error) {
      console.log('Error requesting Screen Time authorization:', error);
      return 'error';
    }
  },

  // Obtener estado de autorización actual
  async getAuthorizationStatus() {
    if (!isScreenTimeAvailable()) {
      return 'unavailable';
    }

    try {
      const status = await ReactNativeDeviceActivity.getAuthorizationStatus();
      this.authorizationStatus = status;
      return status;
    } catch (error) {
      console.log('Error getting authorization status:', error);
      return 'error';
    }
  },

  // Guardar selección de apps del usuario
  async saveAppSelection(familyActivitySelection) {
    if (!isScreenTimeAvailable() || !familyActivitySelection) {
      return false;
    }

    try {
      ReactNativeDeviceActivity.setFamilyActivitySelectionId({
        id: SELECTION_ID,
        familyActivitySelection: familyActivitySelection,
      });
      console.log('App selection saved with ID:', SELECTION_ID);
      return true;
    } catch (error) {
      console.log('Error saving app selection:', error);
      return false;
    }
  },

  // Obtener selección guardada
  async getSavedSelection() {
    if (!isScreenTimeAvailable()) {
      return null;
    }

    try {
      // La selección se guarda en UserDefaults con el ID
      const selection = await ReactNativeDeviceActivity.userDefaultsGet(
        `familyActivitySelection_${SELECTION_ID}`
      );
      return selection;
    } catch (error) {
      console.log('Error getting saved selection:', error);
      return null;
    }
  },

  // Configurar el shield (pantalla de bloqueo)
  async configureShield() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      // Configurar apariencia del shield
      ReactNativeDeviceActivity.updateShield(
        {
          title: 'Modo Focus Activo',
          subtitle: 'Esta app está bloqueada durante tu sesión de focus',
          primaryButtonLabel: 'OK',
          // Colores del tema Brick Focus
          backgroundColor: {
            red: 26,
            green: 26,
            blue: 46,
          },
          titleColor: {
            red: 76,
            green: 175,
            blue: 80,
          },
          subtitleColor: {
            red: 136,
            green: 136,
            blue: 136,
          },
          primaryButtonBackgroundColor: {
            red: 76,
            green: 175,
            blue: 80,
          },
          primaryButtonLabelColor: {
            red: 255,
            green: 255,
            blue: 255,
          },
        },
        {
          primary: {
            type: 'dismiss',
            behavior: 'close',
          },
        }
      );
      console.log('Shield configured');
      return true;
    } catch (error) {
      console.log('Error configuring shield:', error);
      return false;
    }
  },

  // Bloquear apps seleccionadas (activar bloqueo inmediatamente)
  async blockApps() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      // Configurar shield primero
      await this.configureShield();

      // Bloquear la selección guardada
      ReactNativeDeviceActivity.blockSelection({
        familyActivitySelectionId: SELECTION_ID,
      });
      console.log('Apps blocked');
      return true;
    } catch (error) {
      console.log('Error blocking apps:', error);
      return false;
    }
  },

  // Desbloquear apps
  async unblockApps() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      ReactNativeDeviceActivity.unblockSelection({
        familyActivitySelectionId: SELECTION_ID,
      });
      console.log('Apps unblocked');
      return true;
    } catch (error) {
      console.log('Error unblocking apps:', error);
      return false;
    }
  },

  // Iniciar sesión de focus con bloqueo programado
  async startFocusSession(durationSeconds = null) {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      // Configurar shield
      await this.configureShield();

      // Detener monitoreo anterior si existe
      try {
        await ReactNativeDeviceActivity.stopMonitoring(ACTIVITY_NAME);
      } catch (e) {
        // Ignorar error si no había monitoreo activo
      }

      if (durationSeconds) {
        // Sesión con duración específica
        const now = new Date();
        const endTime = new Date(now.getTime() + durationSeconds * 1000);

        // Configurar acciones para cuando inicie el intervalo
        ReactNativeDeviceActivity.configureActions({
          activityName: ACTIVITY_NAME,
          callbackName: 'intervalDidStart',
          actions: [
            {
              type: 'blockSelection',
              familyActivitySelectionId: SELECTION_ID,
              shieldId: SHIELD_ID,
            },
          ],
        });

        // Configurar acciones para cuando termine el intervalo
        ReactNativeDeviceActivity.configureActions({
          activityName: ACTIVITY_NAME,
          callbackName: 'intervalDidEnd',
          actions: [
            {
              type: 'unblockSelection',
              familyActivitySelectionId: SELECTION_ID,
            },
          ],
        });

        // Iniciar monitoreo con el schedule
        await ReactNativeDeviceActivity.startMonitoring(
          ACTIVITY_NAME,
          {
            intervalStart: {
              hour: now.getHours(),
              minute: now.getMinutes(),
              second: now.getSeconds(),
            },
            intervalEnd: {
              hour: endTime.getHours(),
              minute: endTime.getMinutes(),
              second: endTime.getSeconds(),
            },
            repeats: false,
          },
          []
        );
        console.log('Focus session started with duration:', durationSeconds);
      } else {
        // Sesión sin límite - bloquear directamente
        await this.blockApps();
        console.log('Focus session started without time limit');
      }

      return true;
    } catch (error) {
      console.log('Error starting focus session:', error);
      return false;
    }
  },

  // Terminar sesión de focus
  async endFocusSession() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      // Detener monitoreo
      try {
        await ReactNativeDeviceActivity.stopMonitoring(ACTIVITY_NAME);
      } catch (e) {
        // Ignorar si no había monitoreo
      }

      // Desbloquear apps
      await this.unblockApps();
      console.log('Focus session ended');
      return true;
    } catch (error) {
      console.log('Error ending focus session:', error);
      return false;
    }
  },

  // Escuchar eventos de Device Activity (cuando la app está activa)
  onDeviceActivityEvent(callback) {
    if (!isScreenTimeAvailable()) {
      return null;
    }

    return ReactNativeDeviceActivity.onDeviceActivityMonitorEvent((event) => {
      console.log('Device Activity Event:', event.nativeEvent);
      callback(event.nativeEvent);
    });
  },

  // Obtener historial de eventos
  async getEvents() {
    if (!isScreenTimeAvailable()) {
      return [];
    }

    try {
      const events = await ReactNativeDeviceActivity.getEvents();
      return events || [];
    } catch (error) {
      console.log('Error getting events:', error);
      return [];
    }
  },

  // Revocar autorización (para debug/testing)
  async revokeAuthorization() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      await ReactNativeDeviceActivity.revokeAuthorization();
      this.authorizationStatus = null;
      return true;
    } catch (error) {
      console.log('Error revoking authorization:', error);
      return false;
    }
  },
};

// Exportar el componente de selección de apps
export const DeviceActivitySelectionView =
  isScreenTimeAvailable() && ReactNativeDeviceActivity
    ? ReactNativeDeviceActivity.DeviceActivitySelectionView
    : null;
