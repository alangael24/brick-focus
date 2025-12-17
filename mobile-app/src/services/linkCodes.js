import { supabase } from '../lib/supabase';

export const linkCodesService = {
  // Generar código de 6 dígitos
  generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  // Crear código de vinculación para el usuario actual
  async createLinkCode() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    // Eliminar códigos anteriores del usuario
    await supabase
      .from('link_codes')
      .delete()
      .eq('user_id', user.id);

    // Crear nuevo código
    const { data, error } = await supabase
      .from('link_codes')
      .insert({
        code,
        user_id: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { code, expiresAt };
  },

  // Verificar código (usado por la extensión)
  async verifyCode(code) {
    const { data, error } = await supabase
      .from('link_codes')
      .select('user_id, expires_at')
      .eq('code', code)
      .single();

    if (error || !data) {
      return { valid: false, error: 'Código inválido' };
    }

    // Verificar expiración
    if (new Date(data.expires_at) < new Date()) {
      return { valid: false, error: 'Código expirado' };
    }

    return { valid: true, userId: data.user_id };
  },
};
