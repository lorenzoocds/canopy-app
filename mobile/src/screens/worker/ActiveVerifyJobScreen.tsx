import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  Alert, ActivityIndicator, Linking, Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { isWithinGeofence, VERIFY_GEOFENCE_RADIUS, getDistanceMeters } from '../../utils/geofence';

type Phase = 'en_route' | 'arrived' | 'camera' | 'review';

export default function ActiveVerifyJobScreen({ route, navigation }: any) {
  const { report } = route.params;
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('en_route');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [withinGeofence, setWithinGeofence] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    startWatchingLocation();
    return () => { locationSub.current?.remove(); };
  }, []);

  const startWatchingLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      (loc) => {
        setLocation(loc);
        const within = isWithinGeofence(
          loc.coords.latitude, loc.coords.longitude,
          report.latitude, report.longitude,
          VERIFY_GEOFENCE_RADIUS
        );
        setWithinGeofence(within);
      }
    );
  };

  const handleArrived = () => {
    if (!withinGeofence) {
      const dist = location
        ? Math.round(getDistanceMeters(
            location.coords.latitude, location.coords.longitude,
            report.latitude, report.longitude
          ))
        : '?';
      Alert.alert(
        'Not at location yet',
        `You need to be within ${VERIFY_GEOFENCE_RADIUS}m of the report. Currently ${dist}m away.`
      );
      return;
    }
    setPhase('arrived');
  };

  const openInMaps = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`;
    Linking.openURL(url);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    setPhotoUri(photo.uri);
    setPhase('review');
  };

  const submitVerification = async () => {
    if (!photoUri) return;
    setLoading(true);
    try {
      const ext = photoUri.split('.').pop() || 'jpg';
      const fileName = `${user!.id}/${Date.now()}.${ext}`;
      const response = await fetch(photoUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      await supabase.storage
        .from('verification-photos')
        .upload(fileName, arrayBuffer, { contentType: `image/${ext}` });
      const { data: urlData } = supabase.storage
        .from('verification-photos')
        .getPublicUrl(fileName);

      // Update verification
      await supabase
        .from('verifications')
        .update({
          status: 'completed',
          photo_url: urlData.publicUrl,
          notes: notes || null,
          completed_at: new Date().toISOString(),
        })
        .eq('report_id', report.id)
        .eq('worker_id', user!.id);

      // Update report
      await supabase
        .from('reports')
        .update({ status: 'verified', bounty_status: 'earned' })
        .eq('id', report.id);

      Alert.alert('Verification Submitted!', 'Great work! $5.00 earned.');
      navigation.popToTop();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const distanceText = location
    ? `${(getDistanceMeters(
        location.coords.latitude, location.coords.longitude,
        report.latitude, report.longitude
      ) / 1609.34).toFixed(1)} mi away`
    : 'Calculating...';

  // Camera phase
  if (phase === 'camera') {
    if (!permission?.granted) {
      return (
        <View style={styles.centered}>
          <Text>Camera permission required</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
            <Text style={styles.permBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraInstruction}>
            Take a photo of the issue at this location
          </Text>
          <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
        </View>
      </CameraView>
    );
  }

  // Review phase
  if (phase === 'review') {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photoUri! }} style={styles.reviewPhoto} />
        <View style={styles.reviewActions}>
          <TouchableOpacity
            style={styles.retakeBtn}
            onPress={() => { setPhotoUri(null); setPhase('camera'); }}
          >
            <Text style={styles.retakeBtnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={submitVerification}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Verification</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // En route / Arrived phases
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={{
          latitude: report.latitude,
          longitude: report.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
      >
        <Marker
          coordinate={{ latitude: report.latitude, longitude: report.longitude }}
          pinColor="#3498db"
          title="Report Location"
        />
      </MapView>

      <View style={styles.bottomCard}>
        <View style={styles.statusChip}>
          <Text style={styles.statusChipText}>
            {phase === 'en_route' ? '🚗 En Route' : '📍 Arrived'}
          </Text>
        </View>

        <Text style={styles.cardTitle}>{report.category?.name || 'Verify Job'}</Text>
        <Text style={styles.cardAddress}>{report.address}</Text>
        <Text style={styles.cardDistance}>{distanceText}</Text>

        {phase === 'arrived' && (
          <View style={styles.referenceBox}>
            <Text style={styles.referenceLabel}>Reporter's photo:</Text>
            <Image source={{ uri: report.photo_url }} style={styles.referencePhoto} />
            <Text style={styles.referenceInstruction}>
              Take a photo of the issue at this exact location
            </Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.mapsBtn} onPress={openInMaps}>
            <Text style={styles.mapsBtnText}>Open in Maps</Text>
          </TouchableOpacity>

          {phase === 'en_route' ? (
            <TouchableOpacity
              style={[styles.arriveBtn, !withinGeofence && styles.arriveBtnDisabled]}
              onPress={handleArrived}
            >
              <Text style={styles.arriveBtnText}>I've Arrived</Text>
              {!withinGeofence && (
                <Text style={styles.geofenceHint}>
                  {VERIFY_GEOFENCE_RADIUS}m geofence required
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={() => setPhase('camera')}
            >
              <Text style={styles.cameraBtnText}>📷 Take Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  map: { flex: 1 },
  bottomCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1, shadowRadius: 8,
  },
  statusChip: {
    backgroundColor: '#ebf5fb', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 12,
  },
  statusChipText: { fontSize: 13, fontWeight: '700', color: '#3498db' },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  cardAddress: { fontSize: 14, color: '#666', marginTop: 4 },
  cardDistance: { fontSize: 13, color: '#888', marginTop: 4 },
  referenceBox: {
    backgroundColor: '#f8f8f8', borderRadius: 12, padding: 12, marginTop: 16,
  },
  referenceLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 8 },
  referencePhoto: { width: '100%', height: 120, borderRadius: 8 },
  referenceInstruction: { fontSize: 13, color: '#666', marginTop: 8, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  mapsBtn: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  mapsBtnText: { fontSize: 14, fontWeight: '700', color: '#333' },
  arriveBtn: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center',
    backgroundColor: '#3498db',
  },
  arriveBtnDisabled: { backgroundColor: '#a0c4e8' },
  arriveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  geofenceHint: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  cameraBtn: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center',
    backgroundColor: '#27ae60',
  },
  cameraBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  permBtn: { backgroundColor: '#3498db', borderRadius: 12, padding: 14, marginTop: 12 },
  permBtnText: { color: '#fff', fontWeight: '700' },
  cameraOverlay: {
    flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 50,
  },
  cameraInstruction: {
    color: '#fff', fontSize: 16, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 10, marginBottom: 20,
  },
  captureBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  captureBtnInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  reviewPhoto: { flex: 1 },
  reviewActions: {
    flexDirection: 'row', gap: 12, padding: 20, paddingBottom: 36,
    backgroundColor: '#fff',
  },
  retakeBtn: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  retakeBtnText: { fontSize: 14, fontWeight: '700', color: '#333' },
  submitBtn: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center',
    backgroundColor: '#27ae60',
  },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
