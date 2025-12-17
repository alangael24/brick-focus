import { supabase } from '../lib/supabase';

export const brickStatusService = {
  // Obtener el user_id actual
  async getUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');
    return user.id;
  },

  // Obtener estado actual (crea registro si no existe)
  async getStatus() {
    const userId = await this.getUserId();
    const { data, error } = await supabase
      .from('brick_config')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Si no existe registro, crearlo
    if (error && error.code === 'PGRST116') {
      console.log('Creating new brick_config for user');
      const { data: newData, error: insertError } = await supabase
        .from('brick_config')
        .insert({
          user_id: userId,
          is_locked: false,
          timer_duration_seconds: null,
          timer_end_at: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return newData;
    }

    if (error) throw error;
    return data;
  },

  // Cambiar estado de bloqueo
  async setLocked(isLocked, timerDuration = null) {
    const userId = await this.getUserId();
    const updateData = {
      is_locked: isLocked,
      timer_duration_seconds: timerDuration,
      timer_end_at: timerDuration ? new Date(Date.now() + timerDuration * 1000).toISOString() : null,
      last_updated: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('brick_config')
      .update(updateData)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Toggle el estado
  async toggle(timerDuration = null) {
    const current = await this.getStatus();
    return await this.setLocked(!current.is_locked, current.is_locked ? null : timerDuration);
  },

  // Desactivar focus (cuando termina timer)
  async deactivate() {
    const userId = await this.getUserId();
    const { data, error } = await supabase
      .from('brick_config')
      .update({
        is_locked: false,
        timer_duration_seconds: null,
        timer_end_at: null,
        last_updated: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Suscribirse a cambios en tiempo real
  subscribeToChanges(callback, userId) {
    const subscription = supabase
      .channel(`brick_config_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'brick_config',
          filter: `user_id=eq.${userId}`,
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
