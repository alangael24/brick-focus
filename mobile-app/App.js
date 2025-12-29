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
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Modal,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/lib/supabase';
import { brickStatusService } from './src/services/brickStatus';
import { blockedSitesService } from './src/services/blockedSites';
import { analyticsService } from './src/services/analytics';
import { linkCodesService } from './src/services/linkCodes';
import { screenTimeService, isScreenTimeAvailable } from './src/services/screenTime';
import AuthScreen from './src/screens/AuthScreen';
import AppBlockerScreen from './src/screens/AppBlockerScreen';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Manejar deep link de autenticación
  const handleDeepLink = async (url) => {
    if (!url) return;

    console.log('Deep link received:', url);

    // Extraer tokens del URL
    // El formato es: brickfocus://auth#access_token=...&refresh_token=...
    if (url.includes('access_token') || url.includes('#')) {
      try {
        // Parsear el fragmento
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const fragment = url.substring(hashIndex + 1);
          const params = new URLSearchParams(fragment);

          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            console.log('Setting session from deep link...');
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.log('Error setting session:', error);
              Alert.alert('Error', 'No se pudo iniciar sesión');
            } else {
              console.log('Session set successfully');
            }
          }
        }
      } catch (error) {
        console.log('Error parsing deep link:', error);
      }
    }
  };

  // Manejar autenticación
  useEffect(() => {
    // Obtener sesión actual
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoadingAuth(false);
      })
      .catch((error) => {
        console.log('Error getting session:', error);
        setLoadingAuth(false);
      });

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Manejar URL inicial (si la app se abrió desde un link)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Escuchar nuevos deep links mientras la app está abierta
    const linkingListener = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.unsubscribe();
      if (linkingListener) linkingListener.remove();
    };
  }, []);

  // Mostrar loading mientras verifica auth
  if (loadingAuth) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <Text style={styles.logo}>🧱</Text>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  // Si no hay sesión, mostrar login
  if (!session) {
    return <AuthScreen />;
  }

  // Si hay sesión, mostrar la app principal
  return <MainApp session={session} />;
}

function MainApp({ session }) {
  const [isLocked, setIsLocked] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcEnabled, setNfcEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [focusTime, setFocusTime] = useState(0);
  const [blockedSites, setBlockedSites] = useState([]);
  const [newSite, setNewSite] = useState('');
  const [showSites, setShowSites] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(null); // null = sin límite
  const [timerEndTime, setTimerEndTime] = useState(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [showAppBlocker, setShowAppBlocker] = useState(false);
  const [screenTimeEnabled, setScreenTimeEnabled] = useState(false);
  const [showLinkCode, setShowLinkCode] = useState(false);
  const [linkCode, setLinkCode] = useState(null);
  const [showChromeOffer, setShowChromeOffer] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const focusStartTime = useRef(null);
  const subscriptionRef = useRef(null);
  const sitesSubscriptionRef = useRef(null);

  // Presets de duración (en segundos)
  const DURATION_PRESETS = [
    { label: '25 min', seconds: 25 * 60, emoji: '🍅' },
    { label: '45 min', seconds: 45 * 60, emoji: '📚' },
    { label: '1 hora', seconds: 60 * 60, emoji: '💪' },
    { label: '2 horas', seconds: 120 * 60, emoji: '🚀' },
  ];

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
          // Cargar timer si existe
          if (status.timer_end_at) {
            setTimerEndTime(new Date(status.timer_end_at).getTime());
            setSelectedDuration(status.timer_duration_seconds);
          }
        }
        setConnected(true);

        // Verificar si mostrar offer de Chrome extension
        const chromeOfferShown = await AsyncStorage.getItem('chromeOfferShown');
        if (!chromeOfferShown) {
          setShowChromeOffer(true);
        }

        // Suscribirse a cambios en tiempo real
        const userId = session?.user?.id;
        if (!userId) {
          console.log('No user ID available');
          return;
        }
        subscriptionRef.current = brickStatusService.subscribeToChanges((newStatus) => {
          console.log('Realtime:', newStatus.is_locked ? 'LOCKED' : 'UNLOCKED');
          setIsLocked(newStatus.is_locked);
          Vibration.vibrate(100);

          if (newStatus.is_locked && newStatus.last_updated) {
            // Usar timestamp de Supabase para sincronizar
            focusStartTime.current = new Date(newStatus.last_updated).getTime();
            setFocusTime(Date.now() - focusStartTime.current);
            // Sincronizar timer
            if (newStatus.timer_end_at) {
              setTimerEndTime(new Date(newStatus.timer_end_at).getTime());
              setSelectedDuration(newStatus.timer_duration_seconds);
            } else {
              setTimerEndTime(null);
              setSelectedDuration(null);
            }
          } else {
            focusStartTime.current = null;
            setFocusTime(0);
            setTimerEndTime(null);
            setSelectedDuration(null);
          }
        }, userId);

        // Cargar sitios bloqueados
        const sites = await blockedSitesService.getSites();
        setBlockedSites(sites);

        // Cargar estadísticas
        const allStats = await analyticsService.getAllStats();
        setStats(allStats);

        // Suscribirse a cambios de sitios
        sitesSubscriptionRef.current = blockedSitesService.subscribeToChanges(() => {
          // Recargar lista cuando hay cambios
          blockedSitesService.getSites().then(setBlockedSites);
        }, userId);

        // Inicializar Screen Time (solo iOS)
        if (isScreenTimeAvailable()) {
          const authStatus = await screenTimeService.getAuthorizationStatus();
          // El status puede ser string ('approved') o número (2 = approved)
          setScreenTimeEnabled(authStatus === 'approved' || authStatus === 'authorized' || authStatus === 2);
        }
      } catch (error) {
        console.log('Error conectando a Supabase:', error);
        setConnected(false);
      }
    };

    init();

    return () => {
      // Limpiar NFC
      NfcManager.cancelTechnologyRequest().catch(() => {});
      // Limpiar Supabase
      if (subscriptionRef.current) {
        brickStatusService.unsubscribe(subscriptionRef.current);
      }
      if (sitesSubscriptionRef.current) {
        blockedSitesService.unsubscribe(sitesSubscriptionRef.current);
      }
    };
  }, []);

  // Timer del focus - usar ref para el interval
  const timerIntervalRef = useRef(null);
  const timerEndTimeRef = useRef(null);

  // Mantener ref sincronizado con state
  useEffect(() => {
    timerEndTimeRef.current = timerEndTime;
  }, [timerEndTime]);

  const startTimer = () => {
    // Limpiar interval anterior si existe
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    // Iniciar inmediatamente - usar ref para evitar stale closure
    timerIntervalRef.current = setInterval(() => {
      if (timerEndTimeRef.current) {
        // Modo countdown
        const remaining = timerEndTimeRef.current - Date.now();
        if (remaining <= 0) {
          // Timer terminado - auto desactivar
          handleTimerComplete();
        } else {
          setFocusTime(remaining);
        }
      } else if (focusStartTime.current) {
        // Modo count up (sin límite)
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

  // Auto-desactivar cuando termina el countdown
  const handleTimerComplete = async () => {
    stopTimer();
    Vibration.vibrate([0, 500, 200, 500, 200, 500]); // Vibración larga
    Alert.alert(
      '¡Tiempo completado!',
      'Has completado tu sesión de focus.',
      [{ text: 'OK' }]
    );

    // Desactivar focus mode
    setIsLocked(false);
    setFocusTime(0);
    setTimerEndTime(null);
    setSelectedDuration(null);
    focusStartTime.current = null;

    // Finalizar sesión de analytics
    await analyticsService.endSession(true);
    await loadStats();

    // Desactivar Screen Time (el schedule debería manejarlo, pero por seguridad)
    if (isScreenTimeAvailable() && screenTimeEnabled) {
      try {
        await screenTimeService.endFocusSession();
      } catch (e) {
        console.log('Screen Time end error:', e);
      }
    }

    // Actualizar en Supabase
    await brickStatusService.deactivate();
  };

  // Manejar inicio/parada del timer cuando cambia isLocked
  useEffect(() => {
    // Siempre limpiar timer anterior primero
    stopTimer();

    if (isLocked && (focusStartTime.current || timerEndTime)) {
      startTimer();
    }

    return () => stopTimer();
  }, [isLocked, timerEndTime]);

  // Animación de pulso cuando está activo
  const pulseAnimRef = useRef(null);

  useEffect(() => {
    if (isLocked) {
      // Detener animación anterior si existe
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
      }
      // Crear y guardar referencia a la nueva animación
      pulseAnimRef.current = Animated.loop(
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
      );
      pulseAnimRef.current.start();
    } else {
      // Detener animación y resetear
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
        pulseAnimRef.current = null;
      }
      pulseAnim.setValue(1);
    }

    // Cleanup al desmontar
    return () => {
      if (pulseAnimRef.current) {
        pulseAnimRef.current.stop();
      }
    };
  }, [isLocked]);

  // Leer tag NFC usando requestTechnology (funciona en iOS y Android)
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

    // Limpiar cualquier sesión anterior y esperar un momento
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (e) {
      // Ignorar - puede no haber sesión activa
    }

    // Pequeño delay para que iOS resetee la sesión NFC
    await new Promise(resolve => setTimeout(resolve, 300));

    setIsScanning(true);
    console.log('Starting NFC scan...');

    try {
      // En iOS, usar MifareIOS para NTAG215
      const tech = Platform.OS === 'ios' ? NfcTech.MifareIOS : NfcTech.NfcA;
      console.log('Using tech:', tech);

      await NfcManager.requestTechnology(tech, {
        alertMessage: 'Acerca tu Brick NFC al iPhone',
      });

      const tag = await NfcManager.getTag();
      console.log('Tag discovered:', JSON.stringify(tag));

      // Limpiar sesión NFC inmediatamente
      await NfcManager.cancelTechnologyRequest();

      Vibration.vibrate(100);
      setIsScanning(false);

      if (isLocked) {
        // Si ya está activo, desactivar
        toggleFocus('nfc');
      } else {
        // Si no está activo, mostrar selector de duración
        setShowDurationPicker(true);
      }

    } catch (e) {
      console.log('NFC error:', e.message || e);
      setIsScanning(false);

      // Limpiar sesión
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch (cleanupError) {}

      // Solo mostrar error si no fue cancelado por el usuario
      const errorMsg = e.message || '';
      if (!errorMsg.includes('cancel') && !errorMsg.includes('Cancel')) {
        Alert.alert('Error NFC', `No se pudo leer: ${errorMsg || 'Intenta de nuevo'}`);
      }
    }
  };

  // Cancelar escaneo
  const cancelNfcScan = async () => {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (e) {
      console.log('Cancel error:', e);
    }
    setIsScanning(false);
  };

  // Iniciar focus con duración específica
  const startFocusWithDuration = async (duration, source = 'mobile') => {
    setShowDurationPicker(false);

    try {
      // Primero actualizar en Supabase para confirmar que funciona
      const newStatus = await brickStatusService.setLocked(true, duration);
      console.log('Focus iniciado:', newStatus.is_locked, duration ? `${duration}s` : 'sin límite');

      // Solo si Supabase confirmó, actualizar UI y analytics
      setSelectedDuration(duration);
      setIsLocked(true);
      // Usar timestamp del servidor para sincronización precisa
      focusStartTime.current = newStatus.last_updated
        ? new Date(newStatus.last_updated).getTime()
        : Date.now();

      if (duration) {
        // Modo countdown - usar tiempo de Supabase para sincronización
        const endTime = newStatus.timer_end_at
          ? new Date(newStatus.timer_end_at).getTime()
          : Date.now() + duration * 1000;
        setTimerEndTime(endTime);
        setFocusTime(endTime - Date.now());
      } else {
        // Modo sin límite (count up)
        setTimerEndTime(null);
        setFocusTime(0);
      }

      startTimer();

      // Iniciar analytics después de confirmar estado
      await analyticsService.startSession(source);

      // Activar bloqueo de apps con Screen Time (iOS)
      if (isScreenTimeAvailable() && screenTimeEnabled) {
        try {
          // Verificar autorización antes de intentar bloquear
          const authStatus = await screenTimeService.getAuthorizationStatus();
          console.log('Screen Time auth status before blocking:', authStatus);

          // El status puede ser string ('approved') o número (2 = approved)
          const isAuthorized = authStatus === 'approved' || authStatus === 'authorized' || authStatus === 2;
          if (isAuthorized) {
            const result = await screenTimeService.startFocusSession(duration);
            console.log('Screen Time blocking result:', result);
          } else {
            console.log('Screen Time not authorized, skipping app blocking. Status:', authStatus);
          }
        } catch (screenTimeError) {
          console.log('Screen Time error (non-fatal):', screenTimeError?.message || screenTimeError);
          // No crashear la app si Screen Time falla
        }
      }
    } catch (error) {
      console.log('Error starting focus:', error);
      // Revertir estado local
      setIsLocked(false);
      setTimerEndTime(null);
      setSelectedDuration(null);
      stopTimer();
      Alert.alert('Error', 'No se pudo iniciar focus');
    }
  };

  // Toggle focus mode via Supabase
  const toggleFocus = async (source = 'mobile') => {
    if (!isLocked) {
      // Mostrar selector de duración antes de activar
      setShowDurationPicker(true);
      return;
    }

    // Desactivar focus
    try {
      stopTimer();
      setIsLocked(false);
      setFocusTime(0);
      setTimerEndTime(null);
      setSelectedDuration(null);
      focusStartTime.current = null;

      await analyticsService.endSession(true);
      await loadStats();

      // Desactivar bloqueo de apps con Screen Time (iOS)
      if (isScreenTimeAvailable() && screenTimeEnabled) {
        try {
          await screenTimeService.endFocusSession();
          console.log('Screen Time blocking deactivated');
        } catch (screenTimeError) {
          console.log('Screen Time end error (non-fatal):', screenTimeError);
        }
      }

      await brickStatusService.deactivate();
      console.log('Focus desactivado');
    } catch (error) {
      console.log('Error toggling:', error);
      Alert.alert('Error', 'No se pudo cambiar el estado');
    }
  };

  // Cargar estadísticas
  const loadStats = async () => {
    const allStats = await analyticsService.getAllStats();
    setStats(allStats);
  };

  // Agregar sitio bloqueado
  const addSite = async () => {
    if (!newSite.trim()) return;

    try {
      await blockedSitesService.addSite(newSite.trim());
      setNewSite('');
      const sites = await blockedSitesService.getSites();
      setBlockedSites(sites);
    } catch (error) {
      Alert.alert('Error', 'No se pudo agregar el sitio');
    }
  };

  // Eliminar sitio bloqueado
  const removeSite = async (domain) => {
    Alert.alert(
      'Eliminar sitio',
      `¿Eliminar ${domain} de la lista?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockedSitesService.removeSite(domain);
              const sites = await blockedSitesService.getSites();
              setBlockedSites(sites);
            } catch (error) {
              Alert.alert('Error', 'No se pudo eliminar el sitio');
            }
          }
        }
      ]
    );
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />

      {/* App Blocker Modal (Screen Time) */}
      <Modal
        visible={showAppBlocker}
        animationType="slide"
        onRequestClose={() => setShowAppBlocker(false)}
      >
        <AppBlockerScreen
          onClose={() => setShowAppBlocker(false)}
          onSelectionSaved={() => setScreenTimeEnabled(true)}
          isFocusActive={isLocked}
        />
      </Modal>

      {/* Duration Picker Modal */}
      <Modal
        visible={showDurationPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDurationPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>¿Cuánto tiempo de focus?</Text>

            {/* Presets */}
            <View style={styles.presetsGrid}>
              {DURATION_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.seconds}
                  style={styles.presetButton}
                  onPress={() => startFocusWithDuration(preset.seconds)}
                >
                  <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                  <Text style={styles.presetLabel}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom duration */}
            <View style={styles.customDuration}>
              <TextInput
                style={styles.customInput}
                placeholder="Minutos"
                placeholderTextColor="#666"
                keyboardType="number-pad"
                value={customMinutes}
                onChangeText={setCustomMinutes}
              />
              <TouchableOpacity
                style={styles.customButton}
                onPress={() => {
                  const mins = parseInt(customMinutes, 10);
                  if (!isNaN(mins) && mins > 0 && mins <= 480) {
                    startFocusWithDuration(mins * 60);
                    setCustomMinutes('');
                  } else if (mins > 480) {
                    Alert.alert('Error', 'El máximo es 8 horas (480 minutos)');
                  }
                }}
              >
                <Text style={styles.customButtonText}>Iniciar</Text>
              </TouchableOpacity>
            </View>

            {/* Sin límite */}
            <TouchableOpacity
              style={styles.noLimitButton}
              onPress={() => startFocusWithDuration(null)}
            >
              <Text style={styles.noLimitText}>Sin límite ∞</Text>
            </TouchableOpacity>

            {/* Cancelar */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowDurationPicker(false)}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* App Blocker Section (iOS only) */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity
            style={[styles.sitesHeader, styles.appBlockerHeader]}
            onPress={() => setShowAppBlocker(true)}
          >
            <View style={styles.appBlockerLeft}>
              <Text style={styles.appBlockerIcon}>📱</Text>
              <View>
                <Text style={styles.sitesTitle}>Bloqueo de Apps</Text>
                <Text style={styles.appBlockerSubtitle}>
                  {screenTimeEnabled ? 'Configurado' : 'Toca para configurar'}
                </Text>
              </View>
            </View>
            <View style={[
              styles.appBlockerStatus,
              screenTimeEnabled && styles.appBlockerStatusActive
            ]}>
              <Text style={[
                styles.appBlockerStatusText,
                screenTimeEnabled && styles.appBlockerStatusTextActive
              ]}>
                {screenTimeEnabled ? 'ON' : 'OFF'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Blocked Sites Section */}
        <TouchableOpacity
          style={styles.sitesHeader}
          onPress={() => setShowSites(!showSites)}
        >
          <Text style={styles.sitesTitle}>
            Sitios bloqueados ({blockedSites.length})
          </Text>
          <Text style={styles.sitesArrow}>{showSites ? '▼' : '▶'}</Text>
        </TouchableOpacity>

        {showSites && (
          <View style={styles.sitesContainer}>
            {/* Add site input */}
            <View style={styles.addSiteRow}>
              <TextInput
                style={styles.addSiteInput}
                placeholder="ejemplo.com"
                placeholderTextColor="#666"
                value={newSite}
                onChangeText={setNewSite}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={addSite}
              />
              <TouchableOpacity style={styles.addSiteBtn} onPress={addSite}>
                <Text style={styles.addSiteBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Sites list */}
            {blockedSites.map((site) => (
              <View key={site.domain} style={styles.siteItem}>
                <Text style={styles.siteIcon}>{site.icon || '🌐'}</Text>
                <Text style={styles.siteDomain}>{site.domain}</Text>
                <TouchableOpacity onPress={() => removeSite(site.domain)}>
                  <Text style={styles.siteRemove}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Stats Section */}
        <TouchableOpacity
          style={styles.sitesHeader}
          onPress={() => {
            setShowStats(!showStats);
            if (!showStats) loadStats();
          }}
        >
          <Text style={styles.sitesTitle}>
            Estadísticas
          </Text>
          <Text style={styles.sitesArrow}>{showStats ? '▼' : '▶'}</Text>
        </TouchableOpacity>

        {showStats && stats && (
          <View style={styles.statsContainer}>
            {/* Today stats */}
            <Text style={styles.statsSection}>Hoy</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.today?.totalMinutes || 0}</Text>
                <Text style={styles.statLabel}>minutos</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.today?.totalSessions || 0}</Text>
                <Text style={styles.statLabel}>sesiones</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.today?.blockedAttempts || 0}</Text>
                <Text style={styles.statLabel}>bloqueados</Text>
              </View>
            </View>

            {/* Week stats */}
            <Text style={styles.statsSection}>Esta semana</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.week?.totalHours || 0}</Text>
                <Text style={styles.statLabel}>horas</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.week?.totalSessions || 0}</Text>
                <Text style={styles.statLabel}>sesiones</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{stats.streak || 0}</Text>
                <Text style={styles.statLabel}>racha</Text>
              </View>
            </View>

            {/* Top blocked sites */}
            {stats.topBlocked && stats.topBlocked.length > 0 && (
              <>
                <Text style={styles.statsSection}>Más bloqueados</Text>
                {stats.topBlocked.map((site, i) => (
                  <View key={site.domain} style={styles.topBlockedItem}>
                    <Text style={styles.topBlockedRank}>#{i + 1}</Text>
                    <Text style={styles.topBlockedDomain}>{site.domain}</Text>
                    <Text style={styles.topBlockedCount}>{site.count}x</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            {session?.user?.email || 'Usuario'}
          </Text>
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

          <TouchableOpacity
            style={styles.linkButton}
            onPress={async () => {
              try {
                const { code } = await linkCodesService.createLinkCode();
                setLinkCode(code);
                setShowLinkCode(true);
              } catch (error) {
                Alert.alert('Error', 'No se pudo generar el código');
              }
            }}
          >
            <Text style={styles.linkButtonText}>Vincular extensión Chrome</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              Alert.alert(
                'Cerrar sesión',
                '¿Estás seguro?',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Cerrar sesión',
                    style: 'destructive',
                    onPress: () => supabase.auth.signOut()
                  }
                ]
              );
            }}
          >
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Link Code Modal */}
      <Modal
        visible={showLinkCode}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLinkCode(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Vincular extensión</Text>
            <Text style={styles.linkCodeInstructions}>
              Ingresa este código en la extensión de Chrome:
            </Text>
            <Text style={styles.linkCodeDisplay}>{linkCode}</Text>
            <Text style={styles.linkCodeExpiry}>Expira en 5 minutos</Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowLinkCode(false)}
            >
              <Text style={styles.cancelText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Chrome Extension Offer Modal */}
      <Modal
        visible={showChromeOffer}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowChromeOffer(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.chromeOfferEmoji}>🌐</Text>
            <Text style={styles.modalTitle}>Extensión de Chrome</Text>
            <Text style={styles.chromeOfferText}>
              Bloquea sitios web distractores en tu computadora sincronizado con tu teléfono
            </Text>

            <Image
              source={{ uri: 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://brickfocus.app/chrome' }}
              style={styles.qrCode}
            />
            <Text style={styles.qrCodeLabel}>Escanea para descargar</Text>

            <TouchableOpacity
              style={styles.chromeOfferButton}
              onPress={async () => {
                setShowChromeOffer(false);
                await AsyncStorage.setItem('chromeOfferShown', 'true');
                try {
                  const { code } = await linkCodesService.createLinkCode();
                  setLinkCode(code);
                  setShowLinkCode(true);
                } catch (error) {
                  Alert.alert('Error', 'No se pudo generar el código');
                }
              }}
            >
              <Text style={styles.chromeOfferButtonText}>Ya tengo la extensión</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={async () => {
                setShowChromeOffer(false);
                await AsyncStorage.setItem('chromeOfferShown', 'true');
              }}
            >
              <Text style={styles.cancelText}>Ahora no</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
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
    alignItems: 'center',
    marginTop: 30,
  },
  infoText: {
    color: '#666',
    fontSize: 12,
    marginVertical: 2,
  },
  // Blocked sites styles
  sitesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    marginTop: 20,
  },
  sitesTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sitesArrow: {
    color: '#666',
    fontSize: 14,
  },
  sitesContainer: {
    width: '100%',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    marginTop: 10,
    padding: 15,
  },
  addSiteRow: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  addSiteInput: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    marginRight: 10,
  },
  addSiteBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSiteBtnText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  siteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3d3d5c',
  },
  siteIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  siteDomain: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  siteRemove: {
    color: '#e53935',
    fontSize: 24,
    paddingHorizontal: 10,
  },
  // Stats styles
  statsContainer: {
    width: '100%',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    marginTop: 10,
    padding: 15,
  },
  statsSection: {
    color: '#888',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 15,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 15,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  statNumber: {
    color: '#4CAF50',
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 5,
  },
  topBlockedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3d3d5c',
  },
  topBlockedRank: {
    color: '#666',
    fontSize: 12,
    width: 30,
  },
  topBlockedDomain: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  topBlockedCount: {
    color: '#e53935',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#2d2d44',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxWidth: 350,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 25,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  presetButton: {
    width: '48%',
    backgroundColor: '#1a1a2e',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#3d3d5c',
  },
  presetEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  presetLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  customDuration: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  customInput: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#3d3d5c',
  },
  customButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  customButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noLimitButton: {
    backgroundColor: '#4a4a6a',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  noLimitText: {
    color: '#fff',
    fontSize: 16,
  },
  cancelButton: {
    padding: 15,
    alignItems: 'center',
  },
  cancelText: {
    color: '#888',
    fontSize: 16,
  },
  // Auth styles
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#2d2d44',
    borderRadius: 8,
  },
  linkButtonText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  linkCodeInstructions: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  linkCodeDisplay: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 10,
  },
  linkCodeExpiry: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  logoutButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  logoutText: {
    color: '#e53935',
    fontSize: 14,
  },
  // App Blocker styles
  appBlockerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appBlockerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appBlockerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  appBlockerSubtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  appBlockerStatus: {
    backgroundColor: '#3d3d5c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  appBlockerStatusActive: {
    backgroundColor: '#1e3a1e',
  },
  appBlockerStatusText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  appBlockerStatusTextActive: {
    color: '#4CAF50',
  },
  // Chrome Offer Modal styles
  chromeOfferEmoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 10,
  },
  chromeOfferText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  qrCode: {
    width: 180,
    height: 180,
    alignSelf: 'center',
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  qrCodeLabel: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  chromeOfferButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  chromeOfferButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
