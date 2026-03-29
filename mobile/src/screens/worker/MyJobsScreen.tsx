import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function MyJobsScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const [verifications, setVerifications] = useState<any[]>([]);
  const [errands, setErrands] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
    const activeStatuses = ['accepted', 'en_route', 'arrived'];
    const completedStatuses = ['completed'];
    const statuses = tab === 'active' ? activeStatuses : completedStatuses;

    const { data: vData } = await supabase
      .from('verifications')
      .select('*, report:reports(*, category:categories(*))')
      .eq('worker_id', user!.id)
      .in('status', statuses)
      .order('created_at', { ascending: false });
    if (vData) setVerifications(vData);

    const eStatuses = tab === 'active'
      ? ['accepted', 'picked_up', 'delivered']
      : ['completed'];
    const { data: eData } = await supabase
      .from('errands')
      .select('*')
      .eq('worker_id', user!.id)
      .in('status', eStatuses)
      .order('created_at', { ascending: false });
    if (eData) setErrands(eData);
  };

  useEffect(() => { fetchJobs(); }, [tab]);

  const onRefresh = async () => { setRefreshing(true); await fetchJobs(); setRefreshing(false); };

  const jobs = [
    ...verifications.map((v) => ({
      id: v.id, type: 'Verify' as const,
      title: v.report?.category?.name || 'Verify Job',
      address: v.report?.address || '',
      payout: '$5.00',
      date: v.completed_at || v.created_at,
      status: v.status,
    })),
    ...errands.map((e) => ({
      id: e.id, type: 'Errand' as const,
      title: e.title,
      address: e.pickup_address,
      payout: `$${e.payout_amount}`,
      date: e.updated_at || e.created_at,
      status: e.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Jobs</Text>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'active' && styles.tabActive]}
          onPress={() => setTab('active')}
        >
          <Text style={[styles.tabText, tab === 'active' && styles.tabTextActive]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'completed' && styles.tabActive]}
          onPress={() => setTab('completed')}
        >
          <Text style={[styles.tabText, tab === 'completed' && styles.tabTextActive]}>Completed</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.typeBadge, {
                backgroundColor: item.type === 'Verify' ? '#ebf5fb' : '#fef5ed'
              }]}>
                <Text style={[styles.typeBadgeText, {
                  color: item.type === 'Verify' ? '#3498db' : '#e67e22'
                }]}>{item.type}</Text>
              </View>
              <Text style={styles.payout}>{item.payout}</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardAddress}>{item.address}</Text>
            <Text style={styles.cardDate}>{new Date(item.date).toLocaleDateString()}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No {tab} jobs</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  heading: { fontSize: 24, fontWeight: '800', color: '#1a472a', padding: 20, paddingBottom: 10 },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 10 },
  tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, backgroundColor: '#f0f0f0' },
  tabActive: { backgroundColor: '#1a472a' },
  tabText: { fontWeight: '700', color: '#666' },
  tabTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e8efe8',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 12, fontWeight: '700' },
  payout: { fontSize: 18, fontWeight: '800', color: '#1a472a' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginTop: 8 },
  cardAddress: { fontSize: 13, color: '#888', marginTop: 4 },
  cardDate: { fontSize: 12, color: '#aaa', marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, color: '#888' },
});
