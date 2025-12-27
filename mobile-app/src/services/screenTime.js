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
    if (!isScreenTimeAvailable()) {
      console.log('Screen Time not available');
      return false;
    }

    if (!familyActivitySelection) {
      console.log('No family activity selection provided');
      return false;
    }

    try {
      // Verificar que el método existe
      if (typeof ReactNativeDeviceActivity.setFamilyActivitySelectionId !== 'function') {
        console.log('setFamilyActivitySelectionId method not available');
        return false;
      }

      await ReactNativeDeviceActivity.setFamilyActivitySelectionId({
        id: SELECTION_ID,
        familyActivitySelection: familyActivitySelection,
      });
      console.log('App selection saved with ID:', SELECTION_ID);
      return true;
    } catch (error) {
      console.log('Error saving app selection:', error?.message || error);
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
      // Verificar que el método existe
      if (typeof ReactNativeDeviceActivity.updateShield !== 'function') {
        console.log('updateShield method not available');
        return false;
      }

      // Configurar apariencia del shield
      await ReactNativeDeviceActivity.updateShield(
        {
          title: 'Modo Focus Activo',
          subtitle: 'Esta app está bloqueada durante tu sesión de focus',
          primaryButtonLabel: 'OK',
          backgroundColor: { red: 26, green: 26, blue: 46 },
          titleColor: { red: 76, green: 175, blue: 80 },
          subtitleColor: { red: 136, green: 136, blue: 136 },
          primaryButtonBackgroundColor: { red: 76, green: 175, blue: 80 },
          primaryButtonLabelColor: { red: 255, green: 255, blue: 255 },
        },
        {
          primary: { type: 'dismiss', behavior: 'close' },
        }
      );
      console.log('Shield configured');
      return true;
    } catch (error) {
      console.log('Error configuring shield:', error?.message || error);
      return false;
    }
  },

  // Bloquear apps seleccionadas (activar bloqueo inmediatamente)
  async blockApps() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      // Configurar shield primero (no fatal si falla)
      await this.configureShield().catch(e => {
        console.log('Shield config error (non-fatal):', e?.message || e);
      });

      // Verificar que el método existe
      if (typeof ReactNativeDeviceActivity.blockSelection !== 'function') {
        console.log('blockSelection method not available');
        return false;
      }

      // Bloquear la selección guardada
      await ReactNativeDeviceActivity.blockSelection({
        familyActivitySelectionId: SELECTION_ID,
      });
      console.log('Apps blocked');
      return true;
    } catch (error) {
      console.log('Error blocking apps:', error?.message || error);
      return false;
    }
  },

  // Desbloquear apps
  async unblockApps() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      // Verificar que el método existe
      if (typeof ReactNativeDeviceActivity.unblockSelection !== 'function') {
        console.log('unblockSelection method not available');
        return false;
      }

      await ReactNativeDeviceActivity.unblockSelection({
        familyActivitySelectionId: SELECTION_ID,
      });
      console.log('Apps unblocked');
      return true;
    } catch (error) {
      console.log('Error unblocking apps:', error?.message || error);
      return false;
    }
  },

  // Iniciar sesión de focus con bloqueo programado
  async startFocusSession(durationSeconds = null) {
    if (!isScreenTimeAvailable()) {
      console.log('Screen Time not available for focus session');
      return false;
    }

    try {
      // Configurar shield primero (no fatal si falla)
      await this.configureShield().catch(e => {
        console.log('Shield config error (non-fatal):', e?.message || e);
      });

      // Detener monitoreo anterior si existe
      if (typeof ReactNativeDeviceActivity.stopMonitoring === 'function') {
        try {
          await ReactNativeDeviceActivity.stopMonitoring(ACTIVITY_NAME);
        } catch (e) {
          // Ignorar error si no había monitoreo activo
        }
      }

      // Bloquear apps directamente (más simple y confiable)
      if (typeof ReactNativeDeviceActivity.blockSelection === 'function') {
        try {
          await ReactNativeDeviceActivity.blockSelection({
            familyActivitySelectionId: SELECTION_ID,
          });
          console.log('Apps blocked for focus session');
        } catch (blockError) {
          console.log('Error blocking apps:', blockError?.message || blockError);
          // Continuar aunque falle el bloqueo - no es fatal
        }
      }

      return true;
    } catch (error) {
      console.log('Error starting focus session:', error?.message || error);
      return false;
    }
  },

  // Terminar sesión de focus
  async endFocusSession() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      // Detener monitoreo si el método existe
      if (typeof ReactNativeDeviceActivity.stopMonitoring === 'function') {
        try {
          await ReactNativeDeviceActivity.stopMonitoring(ACTIVITY_NAME);
        } catch (e) {
          // Ignorar si no había monitoreo
        }
      }

      // Desbloquear apps
      await this.unblockApps().catch(e => {
        console.log('Error unblocking apps (non-fatal):', e?.message || e);
      });

      console.log('Focus session ended');
      return true;
    } catch (error) {
      console.log('Error ending focus session:', error?.message || error);
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
