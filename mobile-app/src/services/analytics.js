import { supabase } from '../lib/supabase';

export const analyticsService = {
  currentSessionId: null,

  // Obtener el user_id actual
  async getUserId() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');
    return user.id;
  },

  // Iniciar una nueva sesión de focus
  async startSession(source = 'mobile') {
    try {
      const userId = await this.getUserId();
      const { data, error } = await supabase
        .from('focus_sessions')
        .insert({
          user_id: userId,
          started_at: new Date().toISOString(),
          source,
          completed: false
        })
        .select()
        .single();

      if (error) throw error;
      this.currentSessionId = data.id;
      console.log('Analytics: Session started', data.id);
      return data;
    } catch (error) {
      console.log('Analytics: Error starting session', error);
      return null;
    }
  },

  // Finalizar la sesión actual
  async endSession(completed = true) {
    if (!this.currentSessionId) {
      console.log('Analytics: No active session to end');
      return null;
    }

    try {
      const endedAt = new Date();

      // Obtener la sesión para calcular duración
      const { data: session } = await supabase
        .from('focus_sessions')
        .select('started_at')
        .eq('id', this.currentSessionId)
        .single();

      const startedAt = new Date(session.started_at);
      const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

      const { data, error } = await supabase
        .from('focus_sessions')
        .update({
          ended_at: endedAt.toISOString(),
          duration_seconds: durationSeconds,
          completed
        })
        .eq('id', this.currentSessionId)
        .select()
        .single();

      if (error) throw error;

      console.log('Analytics: Session ended', data.id, `(${durationSeconds}s)`);
      this.currentSessionId = null;
      return data;
    } catch (error) {
      console.log('Analytics: Error ending session', error);
      return null;
    }
  },

  // Registrar intento de acceso bloqueado
  async logBlockedAttempt(domain, source = 'mobile') {
    try {
      const userId = await this.getUserId();
      const { data, error } = await supabase
        .from('blocked_attempts')
        .insert({
          user_id: userId,
          session_id: this.currentSessionId,
          domain,
          source
        })
        .select()
        .single();

      if (error) throw error;
      console.log('Analytics: Blocked attempt logged', domain);
      return data;
    } catch (error) {
      console.log('Analytics: Error logging blocked attempt', error);
      return null;
    }
  },

  // Obtener estadísticas de hoy
  async getTodayStats() {
    const userId = await this.getUserId();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Sesiones de hoy
      const { data: sessions } = await supabase
        .from('focus_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', today.toISOString());

      // Intentos bloqueados hoy
      const { data: attempts } = await supabase
        .from('blocked_attempts')
        .select('*')
        .eq('user_id', userId)
        .gte('attempted_at', today.toISOString());

      const totalSeconds = (sessions || [])
        .filter(s => s.duration_seconds)
        .reduce((acc, s) => acc + s.duration_seconds, 0);

      return {
        totalSessions: sessions?.length || 0,
        completedSessions: sessions?.filter(s => s.completed).length || 0,
        totalSeconds,
        totalMinutes: Math.floor(totalSeconds / 60),
        totalHours: Math.floor(totalSeconds / 3600),
        blockedAttempts: attempts?.length || 0
      };
    } catch (error) {
      console.log('Analytics: Error getting today stats', error);
      return {
        totalSessions: 0,
        completedSessions: 0,
        totalSeconds: 0,
        totalMinutes: 0,
        totalHours: 0,
        blockedAttempts: 0
      };
    }
  },

  // Obtener estadísticas de la semana
  async getWeekStats() {
    const userId = await this.getUserId();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    try {
      const { data: sessions } = await supabase
        .from('focus_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', weekAgo.toISOString());

      const { data: attempts } = await supabase
        .from('blocked_attempts')
        .select('*')
        .eq('user_id', userId)
        .gte('attempted_at', weekAgo.toISOString());

      const totalSeconds = (sessions || [])
        .filter(s => s.duration_seconds)
        .reduce((acc, s) => acc + s.duration_seconds, 0);

      // Agrupar por día
      const byDay = {};
      (sessions || []).forEach(s => {
        const day = new Date(s.started_at).toLocaleDateString();
        if (!byDay[day]) byDay[day] = { sessions: 0, seconds: 0 };
        byDay[day].sessions++;
        byDay[day].seconds += s.duration_seconds || 0;
      });

      return {
        totalSessions: sessions?.length || 0,
        completedSessions: sessions?.filter(s => s.completed).length || 0,
        totalSeconds,
        totalHours: Math.floor(totalSeconds / 3600),
        blockedAttempts: attempts?.length || 0,
        byDay
      };
    } catch (error) {
      console.log('Analytics: Error getting week stats', error);
      return {
        totalSessions: 0,
        completedSessions: 0,
        totalSeconds: 0,
        totalHours: 0,
        blockedAttempts: 0,
        byDay: {}
      };
    }
  },

  // Obtener racha actual (días consecutivos con al menos 1 sesión)
  async getCurrentStreak() {
    try {
      const userId = await this.getUserId();
      const { data: sessions } = await supabase
        .from('focus_sessions')
        .select('started_at')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(100);

      if (!sessions || sessions.length === 0) return 0;

      // Obtener días únicos con sesiones
      const daysWithSessions = new Set();
      sessions.forEach(s => {
        const day = new Date(s.started_at).toDateString();
        daysWithSessions.add(day);
      });

      // Contar días consecutivos desde hoy
      let streak = 0;
      let currentDate = new Date();

      while (true) {
        const dayStr = currentDate.toDateString();
        if (daysWithSessions.has(dayStr)) {
          streak++;
          currentDate.setDate(currentDate.getDate() - 1);
        } else {
          // Si es hoy y no hay sesión, no rompemos la racha aún
          if (streak === 0 && currentDate.toDateString() === new Date().toDateString()) {
            currentDate.setDate(currentDate.getDate() - 1);
            continue;
          }
          break;
        }
      }

      return streak;
    } catch (error) {
      console.log('Analytics: Error getting streak', error);
      return 0;
    }
  },

  // Obtener sitios más bloqueados
  async getTopBlockedSites(limit = 5) {
    try {
      const userId = await this.getUserId();
      const { data } = await supabase
        .from('blocked_attempts')
        .select('domain')
        .eq('user_id', userId);

      if (!data) return [];

      // Contar por dominio
      const counts = {};
      data.forEach(a => {
        counts[a.domain] = (counts[a.domain] || 0) + 1;
      });

      // Ordenar y limitar
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([domain, count]) => ({ domain, count }));
    } catch (error) {
      console.log('Analytics: Error getting top blocked sites', error);
      return [];
    }
  },

  // Obtener todas las estadísticas
  async getAllStats() {
    const [today, week, streak, topBlocked] = await Promise.all([
      this.getTodayStats(),
      this.getWeekStats(),
      this.getCurrentStreak(),
      this.getTopBlockedSites()
    ]);

    return {
      today,
      week,
      streak,
      topBlocked
    };
  }
};
