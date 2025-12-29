import { useState, useEffect, useCallback } from 'react';
import { brickStatusService } from '../services/brickStatus';
import { supabase } from '../lib/supabase';

export function useBrickStatus() {
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cargar estado inicial y suscribirse a cambios
  useEffect(() => {
    let subscription;

    const init = async () => {
      try {
        // Obtener userId de la sesión
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        // Obtener estado inicial
        const status = await brickStatusService.getStatus();
        setIsLocked(status.is_locked);
        setLoading(false);

        // Suscribirse a cambios en tiempo real (requiere userId)
        if (userId) {
          subscription = brickStatusService.subscribeToChanges((newStatus) => {
            console.log('Realtime update:', newStatus);
            setIsLocked(newStatus.is_locked);
          }, userId);
        }
      } catch (err) {
        console.log('Error inicializando brick status:', err);
        setError(err);
        setLoading(false);
      }
    };

    init();

    // Cleanup: cancelar suscripción
    return () => {
      if (subscription) {
        brickStatusService.unsubscribe(subscription);
      }
    };
  }, []);

  // Toggle el estado
  const toggle = useCallback(async () => {
    try {
      setLoading(true);
      const newStatus = await brickStatusService.toggle();
      setIsLocked(newStatus.is_locked);
    } catch (err) {
      console.log('Error toggling:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Establecer estado específico
  const setLocked = useCallback(async (locked) => {
    try {
      setLoading(true);
      const newStatus = await brickStatusService.setLocked(locked);
      setIsLocked(newStatus.is_locked);
    } catch (err) {
      console.log('Error setting locked:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isLocked,
    loading,
    error,
    toggle,
    setLocked,
    lock: () => setLocked(true),
    unlock: () => setLocked(false),
  };
}
