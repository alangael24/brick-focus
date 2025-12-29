import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import {
  screenTimeService,
  DeviceActivitySelectionView,
  isScreenTimeAvailable,
} from '../services/screenTime';

export default function AppBlockerScreen({ onClose, onSelectionSaved, isFocusActive }) {
  const [authStatus, setAuthStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentSelection, setCurrentSelection] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    initializeScreenTime();
  }, []);

  const initializeScreenTime = async () => {
    setLoading(true);

    // Verificar disponibilidad
    if (!isScreenTimeAvailable()) {
      setAuthStatus('unavailable');
      setLoading(false);
      return;
    }

    // Solicitar autorización
    const status = await screenTimeService.requestAuthorization();
    setAuthStatus(status);
    setLoading(false);
  };

  const handleSelectionChange = (event) => {
    try {
      // El evento puede venir en diferentes formatos según la versión
      const selection = event?.nativeEvent?.familyActivitySelection ?? event?.familyActivitySelection ?? null;

      // Siempre actualizar la selección (incluyendo null cuando se deselecciona todo)
      setCurrentSelection(selection);
      console.log('Selection changed:', selection ? 'Has selection' : 'No selection (cleared)');
    } catch (error) {
      console.log('Error handling selection change:', error);
      setCurrentSelection(null);
    }
  };

  const handleSave = async () => {
    if (!currentSelection) {
      Alert.alert('Error', 'Selecciona al menos una app para bloquear');
      return;
    }

    setSaving(true);

    try {
      const success = await screenTimeService.saveAppSelection(currentSelection);

      if (success) {
        // Si el focus está activo, bloquear las apps inmediatamente
        if (isFocusActive) {
          try {
            await screenTimeService.blockApps();
            console.log('Apps blocked immediately (focus was active)');
          } catch (blockError) {
            console.log('Error blocking apps immediately:', blockError);
          }
        }

        Alert.alert(
          'Apps guardadas',
          isFocusActive
            ? 'Las apps seleccionadas han sido bloqueadas.'
            : 'Las apps seleccionadas se bloquearán durante tus sesiones de focus.',
          [
            {
              text: 'OK',
              onPress: () => {
                if (onSelectionSaved) onSelectionSaved();
                if (onClose) onClose();
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'No se pudieron guardar las apps');
      }
    } catch (error) {
      console.log('Error saving selection:', error);
      Alert.alert('Error', 'Ocurrió un error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Pantalla de no disponible (Android)
  if (authStatus === 'unavailable') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cerrar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Bloqueo de Apps</Text>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.unavailableEmoji}>📱</Text>
          <Text style={styles.unavailableTitle}>Solo disponible en iOS</Text>
          <Text style={styles.unavailableText}>
            El bloqueo de apps usando Screen Time solo está disponible en dispositivos iOS.
          </Text>
          <Text style={styles.unavailableText}>
            En Android, puedes usar la extensión de Chrome para bloquear sitios web.
          </Text>
        </View>
      </View>
    );
  }

  // Pantalla de loading
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cerrar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Bloqueo de Apps</Text>
        </View>

        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Inicializando Screen Time...</Text>
        </View>
      </View>
    );
  }

  // Pantalla de autorización denegada o error
  if (authStatus === 'denied' || authStatus === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cerrar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Bloqueo de Apps</Text>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.unavailableEmoji}>{authStatus === 'error' ? '⚠️' : '🔒'}</Text>
          <Text style={styles.unavailableTitle}>
            {authStatus === 'error' ? 'Error de Screen Time' : 'Permiso requerido'}
          </Text>
          <Text style={styles.unavailableText}>
            {authStatus === 'error'
              ? 'Ocurrió un error al inicializar Screen Time. Verifica que tu dispositivo sea compatible (iOS 17+).'
              : 'Para bloquear apps, necesitas dar permiso de Screen Time a Brick Focus.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={initializeScreenTime}
          >
            <Text style={styles.retryText}>Intentar de nuevo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Pantalla principal de selección
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Seleccionar Apps</Text>
        <TouchableOpacity
          style={[styles.saveButton, !currentSelection && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!currentSelection || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveText}>Guardar</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.instructions}>
        Selecciona las apps que quieres bloquear durante tus sesiones de focus.
        {'\n'}
        <Text style={styles.instructionsTip}>Tip: Usa categorías en lugar de apps individuales para evitar problemas.</Text>
      </Text>

      {/* Contenedor del picker de apps */}
      <View style={styles.pickerContainer}>
        {DeviceActivitySelectionView && (
          <DeviceActivitySelectionView
            style={styles.picker}
            onSelectionChange={handleSelectionChange}
          />
        )}

        {/* Fallback view detrás del picker por si crashea */}
        <View style={styles.fallbackView}>
          <Text style={styles.fallbackText}>
            Si no ves el selector, intenta cerrar y abrir de nuevo.
          </Text>
          <TouchableOpacity
            style={styles.fallbackButton}
            onPress={initializeScreenTime}
          >
            <Text style={styles.fallbackButtonText}>Recargar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {currentSelection && (
        <View style={styles.selectionInfo}>
          <Text style={styles.selectionText}>
            Apps seleccionadas. Toca "Guardar" para confirmar.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  closeButton: {
    padding: 10,
  },
  closeText: {
    color: '#888',
    fontSize: 16,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#3d3d5c',
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  instructions: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    padding: 15,
    lineHeight: 20,
  },
  instructionsTip: {
    color: '#FFA500',
    fontSize: 12,
    fontStyle: 'italic',
  },
  pickerContainer: {
    flex: 1,
    position: 'relative',
  },
  picker: {
    flex: 1,
    width: '100%',
    zIndex: 10,
  },
  fallbackView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1,
  },
  fallbackText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
  fallbackButton: {
    backgroundColor: '#2d2d44',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  fallbackButtonText: {
    color: '#888',
    fontSize: 14,
  },
  selectionInfo: {
    padding: 15,
    backgroundColor: '#1e3a1e',
    borderTopWidth: 1,
    borderTopColor: '#4CAF50',
  },
  selectionText: {
    color: '#4CAF50',
    fontSize: 14,
    textAlign: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  unavailableEmoji: {
    fontSize: 60,
    marginBottom: 20,
  },
  unavailableTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  unavailableText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 10,
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    marginTop: 20,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
