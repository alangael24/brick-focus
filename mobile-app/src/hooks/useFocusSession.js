import { useState, useEffect, useCallback, useRef } from 'react';
import { focusSessionsService } from '../services/focusSessions';
import { useAuth } from '../context/AuthContext';

export function useFocusSession() {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState(null);
  const [focusTime, setFocusTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const intervalRef = useRef(null);

  // Cargar sesión activa al iniciar
  useEffect(() => {
    if (user) {
      loadActiveSession();
      loadStats();
    }
  }, [user]);

  // Timer para el tiempo de focus
  useEffect(() => {
    if (activeSession) {
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - new Date(activeSession.started_at).getTime();
        setFocusTime(elapsed);
      }, 1000);
    } else {
      setFocusTime(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeSession]);

  const loadActiveSession = async () => {
    if (!user) return;
    try {
      const session = await focusSessionsService.getActiveSession(user.id);
      setActiveSession(session);
    } catch (error) {
      console.log('Error cargando sesión activa:', error);
    }
  };

  const loadStats = async () => {
    if (!user) return;
    try {
      const userStats = await focusSessionsService.getStats(user.id);
      setStats(userStats);
    } catch (error) {
      console.log('Error cargando estadísticas:', error);
    }
  };

  const startFocus = useCallback(async (nfcTagId = null) => {
    if (!user || activeSession) return null;

    setLoading(true);
    try {
      const session = await focusSessionsService.startSession(user.id, nfcTagId);
      setActiveSession(session);
      return session;
    } catch (error) {
      console.log('Error iniciando sesión:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user, activeSession]);

  const endFocus = useCallback(async () => {
    if (!activeSession) return null;

    setLoading(true);
    try {
      const session = await focusSessionsService.endSession(activeSession.id);
      setActiveSession(null);
      await loadStats(); // Actualizar estadísticas
      return session;
    } catch (error) {
      console.log('Error terminando sesión:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [activeSession]);

  const toggleFocus = useCallback(async (nfcTagId = null) => {
    if (activeSession) {
      return await endFocus();
    } else {
      return await startFocus(nfcTagId);
    }
  }, [activeSession, startFocus, endFocus]);

  return {
    activeSession,
    focusTime,
    isActive: !!activeSession,
    loading,
    stats,
    startFocus,
    endFocus,
    toggleFocus,
    refreshStats: loadStats,
  };
}
