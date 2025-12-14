import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { brickStatusService } from './src/services/brickStatus';
import NfcManager, { NfcTech, NfcEvents } from 'react-native-nfc-manager';

export default function App() {
  const [isLocked, setIsLocked] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcEnabled, setNfcEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [focusTime, setFocusTime] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const focusStartTime = useRef(null);
  const subscriptionRef = useRef(null);

  // Inicializar NFC y Supabase Realtime
  useEffect(() => {
    const init = async () => {
      // Inicializar NFC
      try {
        const supported = await NfcManager.isSupported();
        setNfcSupported(supported);

        if (supported) {
          await NfcManager.start();
          if (Platform.OS === 'android') {
            const enabled = await NfcManager.isEnabled();
            setNfcEnabled(enabled);
          } else {
            setNfcEnabled(true); // iOS siempre habilitado si soportado
          }
        }
      } catch (error) {
        console.log('Error inicializando NFC:', error);
      }

      // Obtener estado inicial de Supabase
      try {
        const status = await brickStatusService.getStatus();
        setIsLocked(status.is_locked);
        if (status.is_locked && status.last_updated) {
          focusStartTime.current = new Date(status.last_updated).getTime();
        }
        setConnected(true);

        // Suscribirse a cambios en tiempo real
        subscriptionRef.current = brickStatusService.subscribeToChanges((newStatus) => {
          console.log('Realtime:', newStatus.is_locked ? 'LOCKED' : 'UNLOCKED');
          setIsLocked(newStatus.is_locked);
          Vibration.vibrate(100);

          if (newStatus.is_locked && newStatus.last_updated) {
            // Usar timestamp de Supabase para sincronizar
            focusStartTime.current = new Date(newStatus.last_updated).getTime();
            setFocusTime(Date.now() - focusStartTime.current);
          } else {
            focusStartTime.current = null;
            setFocusTime(0);
          }
        });
      } catch (error) {
        console.log('Error conectando a Supabase:', error);
        setConnected(false);
      }
    };

    init();

    return () => {
      // Limpiar NFC
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      NfcManager.unregisterTagEvent().catch(() => {});
      NfcManager.cancelTechnologyRequest().catch(() => {});
      // Limpiar Supabase
      if (subscriptionRef.current) {
        brickStatusService.unsubscribe(subscriptionRef.current);
      }
    };
  }, []);

  // Timer del focus - usar ref para el interval
  const timerIntervalRef = useRef(null);

  const startTimer = () => {
    // Limpiar interval anterior si existe
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    // Iniciar inmediatamente
    timerIntervalRef.current = setInterval(() => {
      if (focusStartTime.current) {
        setFocusTime(Date.now() - focusStartTime.current);
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Manejar inicio/parada del timer cuando cambia isLocked
  useEffect(() => {
    if (isLocked && focusStartTime.current) {
      startTimer();
    } else {
      stopTimer();
    }
    return () => stopTimer();
  }, [isLocked]);

  // Animación de pulso cuando está activo
  useEffect(() => {
    if (isLocked) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isLocked]);

  // Leer tag NFC usando evento (más simple y estable)
  const readNfc = async () => {
    console.log('readNfc called');
    console.log('nfcSupported:', nfcSupported);
    console.log('nfcEnabled:', nfcEnabled);

    if (!nfcSupported) {
      Alert.alert('Error', 'Tu dispositivo no soporta NFC');
      return;
    }

    if (!nfcEnabled) {
      Alert.alert('Error', 'NFC está desactivado en tu dispositivo');
      return;
    }

    setIsScanning(true);
    console.log('Starting NFC scan...');

    try {
      // Registrar handler para cuando se detecte un tag
      NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag) => {
        console.log('Tag discovered:', tag);
        Vibration.vibrate(100);
        NfcManager.unregisterTagEvent().catch(() => {});
        setIsScanning(false);
        toggleFocus();
      });

      // Iniciar escaneo
      await NfcManager.registerTagEvent();
      console.log('Tag event registered, waiting for tag...');

    } catch (e) {
      console.log('NFC error:', e);
      setIsScanning(false);
      Alert.alert('Error NFC', 'No se pudo iniciar el escaneo');
    }
  };

  // Cancelar escaneo
  const cancelNfcScan = async () => {
    try {
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      await NfcManager.unregisterTagEvent();
    } catch (e) {
      console.log('Cancel error:', e);
    }
    setIsScanning(false);
  };

  // Toggle focus mode via Supabase
  const toggleFocus = async () => {
    try {
      // Actualizar UI inmediatamente para mejor UX
      const newLockState = !isLocked;
      setIsLocked(newLockState);

      if (newLockState) {
        // Iniciar timer inmediatamente
        focusStartTime.current = Date.now();
        setFocusTime(0);
        startTimer();
      } else {
        stopTimer();
        focusStartTime.current = null;
        setFocusTime(0);
      }

      const newStatus = await brickStatusService.toggle();
      console.log('Toggle enviado:', newStatus.is_locked);

      // Si el servidor devuelve un estado diferente, corregir
      if (newStatus.is_locked !== newLockState) {
        setIsLocked(newStatus.is_locked);
        if (newStatus.is_locked && newStatus.last_updated) {
          focusStartTime.current = new Date(newStatus.last_updated).getTime();
        }
      } else if (newStatus.last_updated) {
        // Sincronizar con timestamp del servidor
        focusStartTime.current = new Date(newStatus.last_updated).getTime();
      }
    } catch (error) {
      console.log('Error toggling:', error);
      // Revertir cambio si falla
      setIsLocked(isLocked);
      Alert.alert('Error', 'No se pudo cambiar el estado');
    }
  };

  // Formatear tiempo
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>🧱</Text>
        <Text style={styles.title}>Brick Focus</Text>
        <View style={[styles.connectionDot, connected && styles.connected]} />
      </View>

      {/* Status */}
      <Animated.View
        style={[
          styles.statusContainer,
          isLocked && styles.statusActive,
          { transform: [{ scale: pulseAnim }] }
        ]}
      >
        <Text style={[styles.statusLabel, isLocked && styles.statusLabelActive]}>
          {isLocked ? 'FOCUS ACTIVO' : 'FOCUS INACTIVO'}
        </Text>
        {isLocked && (
          <Text style={styles.timer}>{formatTime(focusTime)}</Text>
        )}
      </Animated.View>

      {/* NFC Button */}
      <TouchableOpacity
        style={[styles.nfcButton, isScanning && styles.nfcButtonScanning]}
        onPress={isScanning ? cancelNfcScan : readNfc}
      >
        <Text style={styles.nfcButtonText}>
          {isScanning ? 'Cancelar escaneo' : 'Escanear NFC'}
        </Text>
      </TouchableOpacity>

      {/* Manual Toggle */}
      <TouchableOpacity
        style={[
          styles.toggleButton,
          isLocked ? styles.toggleButtonOff : styles.toggleButtonOn
        ]}
        onPress={toggleFocus}
      >
        <Text style={styles.toggleButtonText}>
          {isLocked ? 'Desactivar Focus' : 'Activar Focus'}
        </Text>
      </TouchableOpacity>

      {/* Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          {!NfcManager
            ? 'NFC no disponible (Expo Go)'
            : nfcSupported
              ? (nfcEnabled ? 'NFC listo' : 'NFC desactivado')
              : 'NFC no soportado'
          }
        </Text>
        <Text style={styles.infoText}>
          {connected ? 'Conectado a Supabase' : 'Sin conexion'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 60,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#666',
    marginTop: 10,
  },
  connected: {
    backgroundColor: '#4CAF50',
  },
  statusContainer: {
    backgroundColor: '#2d2d44',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    marginBottom: 40,
    borderWidth: 3,
    borderColor: '#3d3d5c',
  },
  statusActive: {
    backgroundColor: '#1e3a1e',
    borderColor: '#4CAF50',
  },
  statusLabel: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#888',
  },
  statusLabelActive: {
    color: '#4CAF50',
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 10,
    fontVariant: ['tabular-nums'],
  },
  nfcButton: {
    backgroundColor: '#4a4a6a',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 15,
    marginBottom: 20,
  },
  nfcButtonScanning: {
    backgroundColor: '#6a6a8a',
  },
  nfcButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  toggleButton: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginBottom: 40,
  },
  toggleButtonOn: {
    backgroundColor: '#4CAF50',
  },
  toggleButtonOff: {
    backgroundColor: '#e53935',
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoContainer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  infoText: {
    color: '#666',
    fontSize: 12,
    marginVertical: 2,
  },
});
