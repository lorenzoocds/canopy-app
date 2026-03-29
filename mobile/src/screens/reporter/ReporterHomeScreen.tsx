import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { Report } from '../../types/database';

const STATUS_COLORS: Record<string, string> = {
  submitted: '#3498db',
  dispatched: '#f39c12',
  verified: '#2ecc71',
  rejected: '#e74c3c',
  work_order_created: '#9b59b6',
  resolved: '#95a5a6',
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
  fab: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: '#1a472a', borderRadius: 28, paddingHorizontal: 24,
    paddingVertical: 14, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
