import { supabase } from '../lib/supabase';

export const blockedSitesService = {
  // Obtener el user_id actual
  async getUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');
    return user.id;
  },

  // Obtener todos los sitios bloqueados del usuario
  async getSites() {
    const userId = await this.getUserId();
    const { data, error } = await supabase
      .from('blocked_sites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');

    if (error) {
      console.log('Error fetching blocked sites:', error);
      return [];
    }
    return data || [];
  },

  // Agregar un sitio
  async addSite(domain, icon = '🌐') {
    const userId = await this.getUserId();
    // Limpiar el dominio
    domain = domain.toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .replace(/\/.*$/, '');

    const { data, error } = await supabase
      .from('blocked_sites')
      .insert({ user_id: userId, domain, icon })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Eliminar un sitio
  async removeSite(domain) {
    const userId = await this.getUserId();
    const { error } = await supabase
      .from('blocked_sites')
      .delete()
      .eq('user_id', userId)
      .eq('domain', domain);

    if (error) throw error;
    return true;
  },

  // Suscribirse a cambios en tiempo real
  subscribeToChanges(callback, userId) {
    const channelName = `blocked_sites_${userId}`;
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocked_sites', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log('Blocked sites change:', payload);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('Blocked sites subscription status:', status);
      });

    return subscription;
  },

  // Cancelar suscripción
  unsubscribe(subscription) {
    if (subscription) {
      supabase.removeChannel(subscription);
    }
  }
};
