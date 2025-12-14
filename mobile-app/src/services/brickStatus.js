import { supabase } from '../lib/supabase';

export const brickStatusService = {
  // Obtener estado actual
  async getStatus() {
    const { data, error } = await supabase
      .from('brick_config')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;
    return data;
  },

  // Cambiar estado de bloqueo
  async setLocked(isLocked) {
    const { data, error } = await supabase
      .from('brick_config')
      .update({ is_locked: isLocked })
      .eq('id', 1)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Toggle el estado
  async toggle() {
    const current = await this.getStatus();
    return await this.setLocked(!current.is_locked);
  },

  // Suscribirse a cambios en tiempo real
  subscribeToChanges(callback) {
    const subscription = supabase
      .channel('brick_config_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'brick_config',
          filter: 'id=eq.1',
        },
        (payload) => {
          callback(payload.new);
        }
      )
      .subscribe();

    return subscription;
  },

  // Cancelar suscripción
  unsubscribe(subscription) {
    if (subscription) {
      supabase.removeChannel(subscription);
    }
  },
};
