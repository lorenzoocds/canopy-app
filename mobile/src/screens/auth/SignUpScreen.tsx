import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types/database';

export default function SignUpScreen({ navigation }: any) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [role, setRole] = useState<UserRole>('reporter');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!fullName || !email || !password || !passwordConfirm) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, fullName.trim(), role);
      Alert.alert('Success', 'Account created! Check your email to confirm, then log in.');
      navigation.navigate('Login');
    } catch (error: any) {
      Alert.alert('Sign Up Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Join Canopy</Text>
        <Text style={styles.subtitle}>Help your community</Text>
      </View>

      <View style={styles.roleSelector}>
        <TouchableOpacity
          style={[styles.roleButton, role === 'reporter' && styles.roleActive]}
          onPress={() => setRole('reporter')}
        >
          <Text style={styles.roleIcon}>📍</Text>
          <Text style={[styles.roleLabel, role === 'reporter' && styles.roleLabelActive]}>
            Report Issues
          </Text>
          <Text style={styles.roleDesc}>Earn bounties</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roleButton, role === 'worker' && styles.roleActiveWorker]}
          onPress={() => setRole('worker')}
        >
          <Text style={styles.roleIcon}>💰</Text>
          <Text style={[styles.roleLabel, role === 'worker' && styles.roleLabelActive]}>
            Earn Money
          </Text>
          <Text style={styles.roleDesc}>Become a worker</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#999"
          value={fullName}
          onChangeText={setFullName}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 6 characters)"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor="#999"
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.button, role === 'worker' ? styles.buttonWorker : styles.buttonPrimary]}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {role === 'reporter' ? 'Start Reporting' : 'Start Earning'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkBold}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#1a472a' },
  subtitle: { fontSize: 14, color: '#6b7c6b', marginTop: 4 },
  roleSelector: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  roleButton: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16,
    alignItems: 'center', borderWidth: 2, borderColor: '#e0e8e0',
  },
  roleActive: { borderColor: '#1a472a', backgroundColor: '#f0f7f0' },
  roleActiveWorker: { borderColor: '#e67e22', backgroundColor: '#fef5ed' },
  roleIcon: { fontSize: 28, marginBottom: 4 },
  roleLabel: { fontSize: 14, fontWeight: '700', color: '#333' },
  roleLabelActive: { color: '#1a472a' },
  roleDesc: { fontSize: 11, color: '#999', marginTop: 2 },
  form: { gap: 14 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e8e0',
  },
  button: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonPrimary: { backgroundColor: '#1a472a' },
  buttonWorker: { backgroundColor: '#e67e22' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkText: { textAlign: 'center', color: '#6b7c6b', marginTop: 20, fontSize: 14 },
  linkBold: { color: '#1a472a', fontWeight: '700' },
});
