import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const sendMagicLink = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Ingresa tu email');
      return;
    }

    // Validar email con regex más robusto
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Ingresa un email válido');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          // Usar página web intermedia que redirige a la app
          emailRedirectTo: 'https://qardvdarvlznlooprlvu.supabase.co/storage/v1/object/public/auth/index.html',
        },
      });

      if (error) throw error;

      setSent(true);
      Alert.alert(
        'Link enviado',
        'Revisa tu email y haz click en el link para entrar.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.log('Auth error:', error);
      Alert.alert('Error', error.message || 'No se pudo enviar el link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo */}
        <Text style={styles.logo}>🧱</Text>
        <Text style={styles.title}>Brick Focus</Text>
        <Text style={styles.subtitle}>Bloquea distracciones, enfócate</Text>

        {!sent ? (
          <>
            {/* Email input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="tu@email.com"
                placeholderTextColor="#666"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={sendMagicLink}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Enviar Magic Link</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.hint}>
              Te enviaremos un link a tu email.{'\n'}
              Sin contraseñas, sin complicaciones.
            </Text>
          </>
        ) : (
          <>
            {/* Success state */}
            <View style={styles.sentContainer}>
              <Text style={styles.sentEmoji}>📧</Text>
              <Text style={styles.sentTitle}>¡Link enviado!</Text>
              <Text style={styles.sentText}>
                Revisa tu email ({email}) y haz click en el link para entrar.
              </Text>
              <Text style={styles.sentHint}>
                Si no lo ves, revisa tu carpeta de spam.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={() => setSent(false)}
            >
              <Text style={styles.resendText}>Usar otro email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={sendMagicLink}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Reenviar link</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  logo: {
    fontSize: 80,
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 50,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
    marginLeft: 5,
  },
  input: {
    width: '100%',
    backgroundColor: '#2d2d44',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 2,
    borderColor: '#3d3d5c',
  },
  button: {
    width: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  hint: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 22,
  },
  sentContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  sentEmoji: {
    fontSize: 60,
    marginBottom: 20,
  },
  sentTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 15,
  },
  sentText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 24,
  },
  sentHint: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  resendButton: {
    marginBottom: 15,
  },
  resendText: {
    color: '#888',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});
