import { supabase } from '../lib/supabase';

export const focusSessionsService = {
  // Iniciar una nueva sesión de focus
  async startSession(userId, nfcTagId = null) {
    const { data, error } = await supabase
      .from('focus_sessions')
      .insert({
        user_id: userId,
        started_at: new Date().toISOString(),
        nfc_tag_id: nfcTagId,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Terminar la sesión activa
  async endSession(sessionId) {
    const endedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('focus_sessions')
      .update({
        ended_at: endedAt,
        is_active: false,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Obtener sesión activa del usuario
  async getActiveSession(userId) {
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  },

  // Obtener historial de sesiones
  async getSessionHistory(userId, limit = 20) {
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  // Obtener estadísticas del usuario
  async getStats(userId) {
    const { data, error } = await supabase
      .from('focus_sessions')
      .select('started_at, ended_at')
      .eq('user_id', userId)
      .eq('is_active', false);

    if (error) throw error;

    const totalSessions = data.length;
    let totalMinutes = 0;

    data.forEach(session => {
      if (session.ended_at) {
        const duration = new Date(session.ended_at) - new Date(session.started_at);
        totalMinutes += duration / (1000 * 60);
      }
    });

    return {
      totalSessions,
      totalMinutes: Math.round(totalMinutes),
      averageMinutes: totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0,
    };
  },

  // Registrar tag NFC
  async registerNfcTag(userId, tagId, tagName) {
    const { data, error } = await supabase
      .from('nfc_tags')
      .insert({
        user_id: userId,
        tag_id: tagId,
        tag_name: tagName,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Obtener tags del usuario
  async getUserTags(userId) {
    const { data, error } = await supabase
      .from('nfc_tags')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  },
};
