import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, Alert, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Category } from '../../types/database';

export default function SubmitReportScreen({ navigation }: any) {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    fetchCategories();
    getLocation();
  }, []);

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').eq('active', true);
    if (data) setCategories(data);
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({});
    setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    const [geo] = await Location.reverseGeocodeAsync(loc.coords);
    if (geo) {
      setAddress(`${geo.streetNumber || ''} ${geo.street || ''}, ${geo.city || ''}, ${geo.region || ''}`);
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
    setPhotoUri(photo.uri);
    setShowCamera(false);
  };

  const uploadPhoto = async (uri: string): Promise<string> => {
    const ext = uri.split('.').pop() || 'jpg';
    const fileName = `${user!.id}/${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    const { error } = await supabase.storage
      .from('report-photos')
      .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('report-photos').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!photoUri) return Alert.alert('Photo Required', 'Please take a photo of the issue.');
    if (!selectedCategory) return Alert.alert('Category Required', 'Please select a category.');
    if (!coords) return Alert.alert('Location Error', 'Could not determine your location.');

    setLoading(true);
    try {
      const photoUrl = await uploadPhoto(photoUri);
      const { error } = await supabase.from('reports').insert({
        reporter_id: user!.id,
        category_id: selectedCategory,
        description: description || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        address,
        photo_url: photoUrl,
      });
      if (error) throw error;
      Alert.alert('Report Submitted!', 'You\'ll earn $5.00 when it\'s verified.');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (showCamera) {
    if (!permission?.granted) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permText}>Camera permission is required</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCamera(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  const CATEGORY_ICONS: Record<string, string> = {
    tree: '🌳', 'alert-circle': '⚠️', zap: '⚡', 'lightbulb-off': '💡',
    'cloud-rain': '🌧️', 'help-circle': '❓',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Report an Issue</Text>

      {/* Photo */}
      <TouchableOpacity style={styles.photoBox} onPress={() => setShowCamera(true)}>
        {photoUri ? (
          <>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <TouchableOpacity style={styles.retakeButton} onPress={() => { setPhotoUri(null); setShowCamera(true); }}>
              <Text style={styles.retakeButtonText}>Retake Photo</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoPlaceholderIcon}>📷</Text>
            <Text style={styles.photoPlaceholderText}>Take a photo</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Address */}
      <View style={styles.addressBox}>
        <Text style={styles.addressIcon}>📍</Text>
        <Text style={styles.addressText}>{address || 'Detecting location...'}</Text>
      </View>

      {/* Category chips */}
      <Text style={styles.sectionLabel}>Category</Text>
      <View style={styles.chipRow}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.chip, selectedCategory === cat.id && styles.chipActive]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Text style={styles.chipIcon}>{CATEGORY_ICONS[cat.icon || ''] || '📌'}</Text>
            <Text style={[styles.chipLabel, selectedCategory === cat.id && styles.chipLabelActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Description */}
      <View>
        <TextInput
          style={styles.textArea}
          placeholder="Optional description..."
          placeholderTextColor="#999"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
        <Text style={styles.charCount}>{description.length}/500 characters</Text>
      </View>

      {/* Bounty badge */}
      <View style={styles.bountyBadge}>
        <Text style={styles.bountyText}>💰 Earn $5.00 when verified</Text>
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={styles.submitBtn}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.submitBtnLoadingText}>Uploading...</Text>
          </>
        ) : (
          <Text style={styles.submitBtnText}>Submit Report</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  content: { padding: 20 },
  heading: { fontSize: 24, fontWeight: '800', color: '#1a472a', marginBottom: 20 },
  photoBox: { borderRadius: 16, overflow: 'hidden', marginBottom: 16, height: 200 },
  photoPreview: { width: '100%', height: '100%' },
  retakeButton: {
    position: 'absolute', bottom: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  retakeButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  photoPlaceholder: {
    width: '100%', height: '100%', backgroundColor: '#e8efe8',
    justifyContent: 'center', alignItems: 'center', borderRadius: 16,
    borderWidth: 2, borderColor: '#c8d8c8', borderStyle: 'dashed',
  },
  photoPlaceholderIcon: { fontSize: 40 },
  photoPlaceholderText: { color: '#6b7c6b', marginTop: 8, fontWeight: '600' },
  addressBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#e0e8e0',
  },
  addressIcon: { fontSize: 18, marginRight: 10 },
  addressText: { fontSize: 14, color: '#333', flex: 1 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#1a472a', marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: '#e0e8e0',
  },
  chipActive: { borderColor: '#1a472a', backgroundColor: '#f0f7f0' },
  chipIcon: { fontSize: 16, marginRight: 6 },
  chipLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  chipLabelActive: { color: '#1a472a' },
  textArea: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    fontSize: 15, borderWidth: 1, borderColor: '#e0e8e0',
    minHeight: 80, textAlignVertical: 'top', marginBottom: 4,
  },
  charCount: { fontSize: 12, color: '#999', paddingHorizontal: 6, marginBottom: 16, textAlign: 'right' },
  bountyBadge: {
    backgroundColor: '#f0f7f0', borderRadius: 12, padding: 14,
    alignItems: 'center', marginBottom: 20,
  },
  bountyText: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  submitBtn: {
    backgroundColor: '#1a472a', borderRadius: 14, padding: 18,
    alignItems: 'center', marginBottom: 40, justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  submitBtnLoadingText: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 6 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  permText: { fontSize: 16, color: '#333', marginBottom: 16, textAlign: 'center' },
  permBtn: { backgroundColor: '#1a472a', borderRadius: 12, padding: 14, paddingHorizontal: 24 },
  permBtnText: { color: '#fff', fontWeight: '700' },
  cameraOverlay: {
    flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40,
  },
  captureBtn: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  cancelBtn: { marginTop: 20 },
  cancelBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
