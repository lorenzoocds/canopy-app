import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { Report } from '../../types/database';

const STATUS_COLORS: Record<string, string> = {
  submitted: '#ffeb3b',
  dispatched: '#3498db',
  verified: '#2ecc71',
  rejected: '#e74c3c',
  work_order_created: '#9b59b6',
  resolved: '#95a5a6',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  dispatched: 'Dispatched',
  verified: 'Verified',
};

export default function ReporterHomeScreen({ navigation }: any) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
      }
    })();
    fetchReports();
  }, []);

  const fetchReports = async () => {
    const { data } = await supabase
      .from('reports')
      .select('*, category:categories(*)')
      .in('status', ['submitted', 'dispatched', 'verified'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setReports(data);
  };

  const defaultRegion = {
    latitude: location?.coords.latitude ?? 36.1627,
    longitude: location?.coords.longitude ?? -86.7816,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={defaultRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {reports.map((report) => (
          <Marker
            key={report.id}
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            pinColor={STATUS_COLORS[report.status] || '#3498db'}
            title={report.category?.name || 'Report'}
            description={report.address || ''}
          />
        ))}
      </MapView>

      {reports.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>📍</Text>
          <Text style={styles.emptyStateTitle}>No Reports Yet</Text>
          <Text style={styles.emptyStateText}>Reports you submit will appear here</Text>
        </View>
      )}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ffeb3b' }]} />
          <Text style={styles.legendLabel}>Submitted</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3498db' }]} />
          <Text style={styles.legendLabel}>Dispatched</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2ecc71' }]} />
          <Text style={styles.legendLabel}>Verified</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('SubmitReport')}
      >
        <Text style={styles.fabText}>+ Report Issue</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
  emptyState: {
    position: 'absolute', top: '50%', left: 0, right: 0,
    alignItems: 'center', transform: [{ translateY: -80 }],
  },
  emptyStateIcon: { fontSize: 56, marginBottom: 16 },
  emptyStateTitle: { fontSize: 20, fontWeight: '700', color: '#1a472a', marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: '#6b7c6b', textAlign: 'center', paddingHorizontal: 20 },
  legend: {
    position: 'absolute', bottom: 120, left: 16, right: 16,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  legendLabel: { fontSize: 13, color: '#333', fontWeight: '600' },
  fab: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: '#1a472a', borderRadius: 28, paddingHorizontal: 24,
    paddingVertical: 14, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
