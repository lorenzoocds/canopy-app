import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Report } from '../../types/database';

const STATUS_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  submitted: { label: 'Submitted', color: '#2980b9', bg: '#ebf5fb' },
  dispatched: { label: 'Dispatched', color: '#e67e22', bg: '#fef5ed' },
  verified: { label: 'Verified', color: '#27ae60', bg: '#eafaf1' },
  rejected: { label: 'Rejected', color: '#e74c3c', bg: '#fdedec' },
  work_order_created: { label: 'Work Order', color: '#8e44ad', bg: '#f5eef8' },
  resolved: { label: 'Resolved', color: '#7f8c8d', bg: '#f2f3f4' },
};

const BOUNTY_BADGES: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending Verification', color: '#f39c12' },
  earned: { label: 'Earned — $5.00', color: '#27ae60' },
  paid: { label: 'Paid', color: '#2ecc71' },
};

const CATEGORY_ICONS: Record<string, string> = {
  tree: '🌳', 'alert-circle': '⚠️', zap: '⚡', 'lightbulb-off': '💡',
  'cloud-rain': '🌧️', 'help-circle': '❓',
};

export default function MyReportsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReports = async () => {
    const { data } = await supabase
      .from('reports')
      .select('*, category:categories(*)')
      .eq('reporter_id', user!.id)
      .order('created_at', { ascending: false });
    if (data) setReports(data);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReports();
    setRefreshing(false);
  };

  const renderReport = ({ item }: { item: Report }) => {
    const status = STATUS_BADGES[item.status];
    const bounty = BOUNTY_BADGES[item.bounty_status];
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ReportDetail', { reportId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.categoryIcon}>
            {CATEGORY_ICONS[item.category?.icon || ''] || '📌'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.categoryName}>{item.category?.name || 'Report'}</Text>
            <Text style={styles.address}>{item.address || 'Unknown location'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status?.bg }]}>
            <Text style={[styles.statusText, { color: status?.color }]}>{status?.label}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={[styles.bountyChip, { color: bounty?.color }]}>{bounty?.label}</Text>
          <Text style={styles.date}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Reports</Text>
      <FlatList
        data={reports}
        renderItem={renderReport}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No reports yet</Text>
            <Text style={styles.emptySubtext}>Tap "+ Report Issue" on the map to get started</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  heading: { fontSize: 24, fontWeight: '800', color: '#1a472a', padding: 20, paddingBottom: 10 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#e8efe8', marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryIcon: { fontSize: 28 },
  categoryName: { fontSize: 16, fontWeight: '700', color: '#333' },
  address: { fontSize: 13, color: '#888', marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#f0f4f0',
  },
  bountyChip: { fontSize: 13, fontWeight: '600' },
  date: { fontSize: 12, color: '#aaa' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 4 },
});
