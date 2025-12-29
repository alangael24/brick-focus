import { Platform } from 'react-native';

// Intentar importar el módulo de forma segura
let ReactNativeDeviceActivity = null;
try {
  ReactNativeDeviceActivity = require('react-native-device-activity');
} catch (e) {
  console.log('react-native-device-activity not available');
}

// Constantes
const SELECTION_ID = 'brick_focus_blocked_apps';
const ACTIVITY_NAME = 'brick_focus_session';

// Límite de Apple para apps bloqueadas (documentado en Screen Time API)
const MAX_BLOCKED_APPS = 50;

// Verificar si Screen Time está disponible (solo iOS 15+ y módulo instalado)
export const isScreenTimeAvailable = () => {
  if (Platform.OS !== 'ios' || ReactNativeDeviceActivity === null) return false;

  // Preferir el check del SDK si existe
  if (typeof ReactNativeDeviceActivity.isAvailable === 'function') {
    try {
      return !!ReactNativeDeviceActivity.isAvailable();
    } catch (e) {
      return false;
    }
  }

  const version = parseInt(String(Platform.Version ?? '0'), 10);
  return version >= 15;
};

// Helper para obtener metadata de una selección
const getSelectionMetadata = (selectionId) => {
  if (typeof ReactNativeDeviceActivity?.activitySelectionMetadata !== 'function') {
    return null;
  }
  try {
    return ReactNativeDeviceActivity.activitySelectionMetadata({ activitySelectionId: selectionId });
  } catch (e) {
    console.log('Error getting selection metadata:', e?.message || e);
    return null;
  }
};

// Helper para validar que no exceda el límite de 50 apps
const validateSelectionLimit = (metadata) => {
  if (!metadata) return { valid: true, count: 0 }; // Si no hay metadata, permitir

  const appCount = metadata.applicationCount ?? 0;
  const categoryCount = metadata.categoryCount ?? 0;
  const totalCount = appCount + categoryCount;

  return {
    valid: totalCount <= MAX_BLOCKED_APPS,
    count: totalCount,
    appCount,
    categoryCount,
  };
};

export const screenTimeService = {
  authorizationStatus: null,

  // Solicitar autorización de Screen Time
  async requestAuthorization() {
    if (!isScreenTimeAvailable()) {
      console.log('Screen Time solo está disponible en iOS');
      return 'unavailable';
    }

    try {
      await ReactNativeDeviceActivity.requestAuthorization();

      const status =
        typeof ReactNativeDeviceActivity.pollAuthorizationStatus === 'function'
          ? await ReactNativeDeviceActivity.pollAuthorizationStatus({ maxAttempts: 10, pollIntervalMs: 250 })
          : await this.getAuthorizationStatus();

      this.authorizationStatus = status;
      console.log('Screen Time authorization status:', status);

      if (status === 2 || status === 'approved') return 'authorized';
      if (status === 1 || status === 'denied') return 'denied';
      return 'notDetermined';
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
      if (typeof ReactNativeDeviceActivity.getAuthorizationStatus !== 'function') {
        console.log('getAuthorizationStatus method not available');
        return 'error';
      }

      const status = ReactNativeDeviceActivity.getAuthorizationStatus();
      this.authorizationStatus = status;

      if (status === undefined || status === null) {
        return 'notDetermined';
      }

      return status;
    } catch (error) {
      console.log('Error getting authorization status:', error?.message || error);
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
      if (typeof ReactNativeDeviceActivity.setFamilyActivitySelectionId !== 'function') {
        console.log('setFamilyActivitySelectionId method not available');
        return false;
      }

      // Guardar la selección
      await ReactNativeDeviceActivity.setFamilyActivitySelectionId({
        id: SELECTION_ID,
        familyActivitySelection: familyActivitySelection,
      });

      // Validar el límite de 50 apps DESPUÉS de guardar (porque necesitamos el metadata)
      const metadata = getSelectionMetadata(SELECTION_ID);
      if (metadata) {
        const validation = validateSelectionLimit(metadata);
        console.log(`Selection saved: ${validation.appCount} apps, ${validation.categoryCount} categories`);

        if (!validation.valid) {
          console.warn(`Warning: Selection exceeds ${MAX_BLOCKED_APPS} items (${validation.count}). This may cause crashes.`);
          // No fallamos, solo advertimos - el usuario puede querer usar categorías
        }
      }

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
      const selectionIds = ReactNativeDeviceActivity.userDefaultsGet?.('familyActivitySelectionIds');
      return selectionIds?.[SELECTION_ID] ?? null;
    } catch (error) {
      console.log('Error getting saved selection:', error);
      return null;
    }
  },

  // Limpiar bloqueos existentes de forma segura
  async clearExistingBlocks() {
    if (typeof ReactNativeDeviceActivity?.resetBlocks !== 'function') {
      console.log('resetBlocks not available, skipping cleanup');
      return true; // No es un error crítico
    }

    try {
      ReactNativeDeviceActivity.resetBlocks('cleanup');
      console.log('Existing blocks cleared');
      return true;
    } catch (error) {
      console.log('Error clearing blocks:', error?.message || error);
      // Continuar de todos modos - el bloqueo nuevo debería funcionar
      return true;
    }
  },

  // Configurar el shield (pantalla de bloqueo)
  async configureShield() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      if (typeof ReactNativeDeviceActivity.updateShield !== 'function') {
        console.log('updateShield method not available');
        return false;
      }

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

  // Bloquear apps seleccionadas
  async blockApps() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      // Verificar que blockSelection existe
      if (typeof ReactNativeDeviceActivity.blockSelection !== 'function') {
        console.log('blockSelection method not available');
        return false;
      }

      // Validar que hay una selección guardada
      const metadata = getSelectionMetadata(SELECTION_ID);
      if (!metadata) {
        console.log('No saved selection found, cannot block');
        return false;
      }

      const validation = validateSelectionLimit(metadata);
      if (validation.count === 0) {
        console.log('Selection is empty, nothing to block');
        return false;
      }

      if (!validation.valid) {
        console.warn(`Warning: Blocking ${validation.count} items (exceeds ${MAX_BLOCKED_APPS} limit)`);
      }

      // Limpiar bloqueos anteriores primero
      await this.clearExistingBlocks();

      // Configurar shield (no es crítico si falla)
      await this.configureShield().catch(e => {
        console.log('Shield config warning:', e?.message || e);
      });

      // Bloquear apps - ENVUELTO EN TRY-CATCH
      try {
        ReactNativeDeviceActivity.blockSelection({ activitySelectionId: SELECTION_ID });
        console.log('Apps blocked successfully');
        return true;
      } catch (blockError) {
        console.log('Error in blockSelection:', blockError?.message || blockError);
        return false;
      }
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
      if (typeof ReactNativeDeviceActivity.resetBlocks === 'function') {
        ReactNativeDeviceActivity.resetBlocks('unblock');
        console.log('Apps unblocked via resetBlocks');
        return true;
      } else if (typeof ReactNativeDeviceActivity.unblockSelection === 'function') {
        ReactNativeDeviceActivity.unblockSelection({ activitySelectionId: SELECTION_ID });
        console.log('Apps unblocked via unblockSelection');
        return true;
      } else {
        console.log('No unblock method available');
        return false;
      }
    } catch (error) {
      console.log('Error unblocking apps:', error?.message || error);
      return false;
    }
  },

  // Iniciar sesión de focus con bloqueo
  async startFocusSession(durationSeconds = null) {
    if (!isScreenTimeAvailable()) {
      console.log('Screen Time not available for focus session');
      return false;
    }

    try {
      // Verificar autorización
      const authStatus = await this.getAuthorizationStatus();
      const isAuthorized = authStatus === 'approved' || authStatus === 2;

      if (!isAuthorized) {
        console.log('Screen Time not authorized, status:', authStatus);
        return false;
      }

      // Verificar que hay apps seleccionadas
      const metadata = getSelectionMetadata(SELECTION_ID);
      if (!metadata || (metadata.applicationCount === 0 && metadata.categoryCount === 0)) {
        console.log('No apps selected to block');
        return false;
      }

      console.log(`Starting focus session: ${metadata.applicationCount} apps, ${metadata.categoryCount} categories`);

      // Bloquear usando el método dedicado
      const blocked = await this.blockApps();
      if (!blocked) {
        console.log('Failed to block apps');
        return false;
      }

      console.log('Focus session started with app blocking');
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
      // Detener monitoreo si existe
      if (typeof ReactNativeDeviceActivity.stopMonitoring === 'function') {
        try {
          await ReactNativeDeviceActivity.stopMonitoring(ACTIVITY_NAME);
        } catch (e) {
          // Ignorar - puede que no hubiera monitoreo activo
        }
      }

      // Desbloquear apps
      const unblocked = await this.unblockApps();
      console.log('Focus session ended, unblock result:', unblocked);
      return true;
    } catch (error) {
      console.log('Error ending focus session:', error?.message || error);
      return false;
    }
  },

  // Escuchar eventos de Device Activity
  onDeviceActivityEvent(callback) {
    if (!isScreenTimeAvailable()) {
      return null;
    }

    return ReactNativeDeviceActivity.onDeviceActivityMonitorEvent?.((event) => {
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
      const events = await ReactNativeDeviceActivity.getEvents?.();
      return events || [];
    } catch (error) {
      console.log('Error getting events:', error);
      return [];
    }
  },

  // Revocar autorización (para testing)
  async revokeAuthorization() {
    if (!isScreenTimeAvailable()) {
      return false;
    }

    try {
      await ReactNativeDeviceActivity.revokeAuthorization?.();
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
