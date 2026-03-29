import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Image,
  Alert, ActivityIndicator, Linking, ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { isWithinGeofence, ERRAND_GEOFENCE_RADIUS, getDistanceMeters } from '../../utils/geofence';

type ErrandPhase =
  | 'en_route_pickup'
  | 'arrived_pickup'
  | 'camera_pickup'
  | 'en_route_dropoff'
  | 'arrived_dropoff'
  | 'camera_dropoff'
  | 'review';

export default function ActiveErrandJobScreen({ route, navigation }: any) {
  const { errand } = route.params;
  const { user } = useAuth();
  const [phase, setPhase] = useState<ErrandPhase>('en_route_pickup');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [withinPickup, setWithinPickup] = useState(false);
  const [withinDropoff, setWithinDropoff] = useState(false);
  const [pickupPhotoUri, setPickupPhotoUri] = useState<string | null>(null);
  const [dropoffPhotoUri, setDropoffPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    startWatching();
    return () => { locationSub.current?.remove(); };
  }, []);

  const startWatching = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      (loc) => {
        setLocation(loc);
        setWithinPickup(isWithinGeofence(
          loc.coords.latitude, loc.coords.longitude,
          errand.pickup_latitude, errand.pickup_longitude,
          ERRAND_GEOFENCE_RADIUS
        ));
        setWithinDropoff(isWithinGeofence(
          loc.coords.latitude, loc.coords.longitude,
          errand.dropoff_latitude, errand.dropoff_longitude,
          ERRAND_GEOFENCE_RADIUS
        ));
      }
    );
  };

  const openInMaps = (lat: number, lon: number) => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`);
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
    if (phase === 'camera_pickup') {
      setPickupPhotoUri(photo.uri);
      setPhase('en_route_dropoff');
      await uploadErrandPhoto(photo.uri, 'pickup');
      await supabase.from('errands').update({ status: 'picked_up' }).eq('id', errand.id);
    } else if (phase === 'camera_dropoff') {
      setDropoffPhotoUri(photo.uri);
      setPhase('review');
      await uploadErrandPhoto(photo.uri, 'dropoff');
    }
  };

  const uploadErrandPhoto = async (uri: string, type: 'pickup' | 'dropoff') => {
    const ext = uri.split('.').pop() || 'jpg';
    const fileName = `${user!.id}/${errand.id}_${type}_${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();
    await supabase.storage
      .from('errand-photos')
      .upload(fileName, arrayBuffer, { contentType: `image/${ext}` });
    const { data: urlData } = supabase.storage.from('errand-photos').getPublicUrl(fileName);

    await supabase.from('errand_photos').insert({
      errand_id: errand.id,
      worker_id: user!.id,
      type,
      photo_url: urlData.publicUrl,
      latitude: location?.coords.latitude,
      longitude: location?.coords.longitude,
    });
  };

  const completeErrand = async () => {
    setLoading(true);
    try {
      await supabase.from('errands')
        .update({ status: 'completed' })
        .eq('id', errand.id);
      Alert.alert('Errand Complete!', `$${errand.payout_amount} earned!`);
      navigation.popToTop();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Camera phases
  if (phase === 'camera_pickup' || phase === 'camera_dropoff') {
    if (!permission?.granted) {
      return (
        <View style={styles.centered}>
          <Text>Camera permission required</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
            <Text style={styles.permBtnText}>Grant</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraInstruction}>
            {phase === 'camera_pickup'
              ? 'Photograph the items before leaving'
              : 'Photograph the items at the dropoff location'}
          </Text>
          <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>
        </View>
      </CameraView>
    );
  }

  // Review/complete
  if (phase === 'review') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.reviewTitle}>Errand Complete!</Text>
        <View style={styles.photoRow}>
          <View style={styles.photoCol}>
            <Text style={styles.photoLabel}>Pickup</Text>
            {pickupPhotoUri && <Image source={{ uri: pickupPhotoUri }} style={styles.reviewPhoto} />}
          </View>
          <View style={styles.photoCol}>
            <Text style={styles.photoLabel}>Dropoff</Text>
            {dropoffPhotoUri && <Image source={{ uri: dropoffPhotoUri }} style={styles.reviewPhoto} />}
          </View>
        </View>
        <TouchableOpacity style={styles.completeBtn} onPress={completeErrand} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.completeBtnText}>Complete Errand — ${errand.payout_amount}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Map phases
  const isPickupPhase = phase === 'en_route_pickup' || phase === 'arrived_pickup';
  const targetLat = isPickupPhase ? errand.pickup_latitude : errand.dropoff_latitude;
  const targetLon = isPickupPhase ? errand.pickup_longitude : errand.dropoff_longitude;
  const targetAddress = isPickupPhase ? errand.pickup_address : errand.dropoff_address;
  const withinFence = isPickupPhase ? withinPickup : withinDropoff;

  const stepLabels = {
    en_route_pickup: { num: '1', label: 'En Route to Pickup', color: '#e67e22' },
    arrived_pickup: { num: '2', label: 'Arrived at Pickup', color: '#27ae60' },
    en_route_dropoff: { num: '3', label: 'En Route to Dropoff', color: '#e67e22' },
    arrived_dropoff: { num: '4', label: 'Arrived at Dropoff', color: '#27ae60' },
  };
  const currentStep = stepLabels[phase as keyof typeof stepLabels];

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={{
          latitude: targetLat,
          longitude: targetLon,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
        showsUserLocation
      >
        <Marker
          coordinate={{ latitude: targetLat, longitude: targetLon }}
          pinColor={isPickupPhase ? '#e67e22' : '#27ae60'}
          title={isPickupPhase ? 'Pickup' : 'Dropoff'}
        />
      </MapView>

      {/* Step progress bar */}
      <View style={styles.stepBar}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[styles.stepDot, {
              backgroundColor: s <= parseInt(currentStep?.num || '1')
                ? currentStep?.color
                : '#ddd',
            }]}
          />
        ))}
      </View>

      <View style={styles.bottomCard}>
        <View style={[styles.phaseBadge, { backgroundColor: currentStep?.color + '20' }]}>
          <Text style={[styles.phaseBadgeText, { color: currentStep?.color }]}>
            Step {currentStep?.num}: {currentStep?.label}
          </Text>
        </View>

        <Text style={styles.cardTitle}>{errand.title}</Text>
        <Text style={styles.cardAddress}>{targetAddress}</Text>

        {isPickupPhase && errand.pickup_instructions && (
          <View style={styles.instructionBox}>
            <Text style={styles.instructionLabel}>Instructions:</Text>
            <Text style={styles.instructionText}>{errand.pickup_instructions}</Text>
          </View>
        )}

        {isPickupPhase && phase === 'arrived_pickup' && (
          <View style={styles.itemBox}>
            <Text style={styles.itemText}>
              {errand.item_quantity}x {errand.item_description || 'items'}
            </Text>
          </View>
        )}

        {!isPickupPhase && errand.dropoff_instructions && (
          <View style={styles.instructionBox}>
            <Text style={styles.instructionLabel}>Dropoff Instructions:</Text>
            <Text style={styles.instructionText}>{errand.dropoff_instructions}</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.mapsBtn}
            onPress={() => openInMaps(targetLat, targetLon)}
          >
            <Text style={styles.mapsBtnText}>Open in Maps</Text>
          </TouchableOpacity>

          {(phase === 'en_route_pickup' || phase === 'en_route_dropoff') ? (
            <TouchableOpacity
              style={[styles.arriveBtn, !withinFence && styles.arriveBtnDisabled]}
              onPress={() => {
                if (!withinFence) {
                  Alert.alert('Not at location', `Must be within ${ERRAND_GEOFENCE_RADIUS}m`);
                  return;
                }
                setPhase(phase === 'en_route_pickup' ? 'arrived_pickup' : 'arrived_dropoff');
              }}
            >
              <Text style={styles.arriveBtnText}>I've Arrived</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.photoBtn}
              onPress={() => setPhase(phase === 'arrived_pickup' ? 'camera_pickup' : 'camera_dropoff')}
            >
              <Text style={styles.photoBtnText}>
                📷 {phase === 'arrived_pickup' ? 'Photo Items' : 'Photo Dropoff'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { flex: 1 },
  stepBar: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    padding: 12, backgroundColor: '#fff',
  },
  stepDot: { width: 40, height: 4, borderRadius: 2 },
  bottomCard: {
    backgroundColor: '#fff', padding: 20, paddingBottom: 36,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  phaseBadge: {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  phaseBadgeText: { fontSize: 13, fontWeight: '700' },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  cardAddress: { fontSize: 14, color: '#666', marginTop: 4 },
  instructionBox: {
    backgroundColor: '#fef5ed', borderRadius: 12, padding: 12, marginTop: 12,
  },
  instructionLabel: { fontSize: 12, fontWeight: '700', color: '#e67e22' },
  instructionText: { fontSize: 14, color: '#333', marginTop: 4 },
  itemBox: {
    backgroundColor: '#f0f7f0', borderRadius: 12, padding: 12, marginTop: 12,
  },
  itemText: { fontSize: 16, fontWeight: '700', color: '#1a472a' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  mapsBtn: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', backgroundColor: '#f0f0f0',
  },
  mapsBtnText: { fontSize: 14, fontWeight: '700', color: '#333' },
  arriveBtn: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', backgroundColor: '#e67e22',
  },
  arriveBtnDisabled: { backgroundColor: '#f0c89a' },
  arriveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  photoBtn: {
    flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', backgroundColor: '#27ae60',
  },
  photoBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  permBtn: { backgroundColor: '#e67e22', borderRadius: 12, padding: 14, marginTop: 12 },
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
  reviewTitle: { fontSize: 24, fontWeight: '800', color: '#1a472a', marginBottom: 20 },
  photoRow: { flexDirection: 'row', gap: 12 },
  photoCol: { flex: 1 },
  photoLabel: { fontSize: 14, fontWeight: '700', color: '#666', marginBottom: 8 },
  reviewPhoto: { width: '100%', height: 200, borderRadius: 12 },
  completeBtn: {
    backgroundColor: '#27ae60', borderRadius: 14, padding: 18,
    alignItems: 'center', marginTop: 24, marginBottom: 40,
  },
  completeBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
});
