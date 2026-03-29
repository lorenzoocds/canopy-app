import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Switch, Dimensions, Modal } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Report, Errand } from '../../types/database';
import JobOfferModal from '../../components/JobOfferModal';
import { getDistanceMeters } from '../../utils/geofence';

export default function WorkerHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [errands, setErrands] = useState<Errand[]>([]);
  const [jobOffer, setJobOffer] = useState<{ type: 'verify' | 'errand'; data: any } | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      }
    })();
    return () => {
      locationSubscription.current?.remove();
    };
  }, []);

  // Toggle online/offline
  const toggleOnline = async (value: boolean) => {
    setIsOnline(value);
    await supabase.from('users').update({ is_online: value }).eq('id', user!.id);

    if (value) {
      // Start watching location
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 50 },
        (loc) => setLocation(loc)
      );
      fetchAvailableJobs();
      subscribeToNewJobs();
    } else {
      locationSubscription.current?.remove();
    }
  };

  const fetchAvailableJobs = async () => {
    const { data: reps } = await supabase
      .from('reports')
      .select('*, category:categories(*)')
      .eq('status', 'submitted')
      .limit(20);
    if (reps) setReports(reps);

    const { data: errs } = await supabase
      .from('errands')
      .select('*')
      .eq('status', 'open')
      .limit(20);
    if (errs) setErrands(errs);
  };

  const subscribeToNewJobs = () => {
    // Listen for new reports (verify jobs)
    const reportChannel = supabase
      .channel('new-reports')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        (payload) => {
          const newReport = payload.new as Report;
          if (location) {
            const dist = getDistanceMeters(
              location.coords.latitude, location.coords.longitude,
              newReport.latitude, newReport.longitude
            );
            if (dist <= 16000) { // 10 miles
              setJobOffer({ type: 'verify', data: { ...newReport, distance: dist } });
            }
          }
          setReports((prev) => [newReport, ...prev]);
        }
      )
      .subscribe();

    // Listen for new errands
    const errandChannel = supabase
      .channel('new-errands')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'errands' },
        (payload) => {
          const newErrand = payload.new as Errand;
          if (location) {
            const dist = getDistanceMeters(
              location.coords.latitude, location.coords.longitude,
              newErrand.pickup_latitude, newErrand.pickup_longitude
            );
            if (dist <= 24000) { // 15 miles
              setJobOffer({ type: 'errand', data: { ...newErrand, distance: dist } });
            }
          }
          setErrands((prev) => [newErrand, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reportChannel);
      supabase.removeChannel(errandChannel);
    };
  };

  const handleAcceptJob = async () => {
    if (!jobOffer) return;

    if (jobOffer.type === 'verify') {
      // Create verification record, update report status
      const { error: vError } = await supabase.from('verifications').insert({
        report_id: jobOffer.data.id,
        worker_id: user!.id,
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      });
      if (!vError) {
        await supabase
          .from('reports')
          .update({ status: 'dispatched' })
          .eq('id', jobOffer.data.id);
      }
      setJobOffer(null);
      navigation.navigate('ActiveVerifyJob', { report: jobOffer.data });
    } else {
      // Accept errand
      const { error } = await supabase
        .from('errands')
        .update({ status: 'accepted', worker_id: user!.id })
        .eq('id', jobOffer.data.id);
      if (!error) {
        setJobOffer(null);
        navigation.navigate('ActiveErrandJob', { errand: jobOffer.data });
      }
    }
  };

  const handleDeclineJob = () => setJobOffer(null);

  const defaultRegion = {
    latitude: location?.coords.latitude ?? 36.1627,
    longitude: location?.coords.longitude ?? -86.7816,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={defaultRegion}
        showsUserLocation
      >
        {isOnline && reports.map((r) => (
          <Marker
            key={r.id}
            coordinate={{ latitude: r.latitude, longitude: r.longitude }}
            pinColor="#3498db"
            title={r.category?.name || 'Verify Job'}
          />
        ))}
        {isOnline && errands.map((e) => (
          <Marker
            key={e.id}
            coordinate={{ latitude: e.pickup_latitude, longitude: e.pickup_longitude }}
            pinColor="#e67e22"
            title={e.title}
          />
        ))}
      </MapView>

      {/* Online/Offline Toggle */}
      <View style={[styles.toggleBar, isOnline ? styles.toggleOnline : styles.toggleOffline]}>
        <View style={styles.toggleContent}>
          <View style={[styles.statusDot, isOnline && styles.statusDotOnline]} />
          <Text style={[styles.toggleText, isOnline && styles.toggleTextOnline]}>
            {isOnline ? "You're Online" : "You're Offline — Go online to start earning"}
          </Text>
        </View>
        <Switch
          value={isOnline}
          onValueChange={toggleOnline}
          trackColor={{ false: '#ccc', true: '#27ae60' }}
          thumbColor="#fff"
        />
      </View>

      {/* Offline overlay */}
      {!isOnline && (
        <View style={styles.offlineOverlay}>
          <Text style={styles.offlineText}>Go online to see available jobs</Text>
        </View>
      )}

      {/* Job Offer Modal */}
      {jobOffer && (
        <JobOfferModal
          visible={!!jobOffer}
          type={jobOffer.type}
          data={jobOffer.data}
          onAccept={handleAcceptJob}
          onDecline={handleDeclineJob}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  toggleBar: {
    position: 'absolute', top: 60, left: 16, right: 16,
    borderRadius: 16, padding: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4,
  },
  toggleOnline: { backgroundColor: '#eafaf1' },
  toggleOffline: { backgroundColor: '#fff' },
  toggleContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  statusDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#ccc', marginRight: 10,
  },
  statusDotOnline: { backgroundColor: '#27ae60' },
  toggleText: { fontSize: 14, color: '#666', fontWeight: '600', flex: 1 },
  toggleTextOnline: { color: '#1a472a' },
  offlineOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center',
  },
  offlineText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
