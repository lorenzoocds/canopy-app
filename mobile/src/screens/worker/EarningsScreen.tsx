import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function EarningsScreen() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<any[]>([]);
  const [totals, setTotals] = useState({ today: 0, week: 0, month: 0, lifetime: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const fetchEarnings = async () => {
    // Completed verifications
    const { data: vData } = await supabase
      .from('verifications')
      .select('*, report:reports(bounty_amount, address, category:categories(name))')
      .eq('worker_id', user!.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    // Completed errands
    const { data: eData } = await supabase
      .from('errands')
      .select('*')
      .eq('worker_id', user!.id)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false });

    const allEarnings = [
      ...(vData || []).map((v: any) => ({
        id: v.id, type: 'Verify', amount: v.report?.bounty_amount || 5,
        title: v.report?.category?.name || 'Verify', date: v.completed_at,
      })),
      ...(eData || []).map((e: any) => ({
        id: e.id, type: 'Errand', amount: e.payout_amount,
        title: e.title, date: e.updated_at,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setEarnings(allEarnings);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    setTotals({
      today: allEarnings.filter((e) => new Date(e.date) >= todayStart).reduce((s, e) => s + e.amount, 0),
      week: allEarnings.filter((e) => new Date(e.date) >= weekStart).reduce((s, e) => s + e.amount, 0),
      month: allEarnings.filter((e) => new Date(e.date) >= monthStart).reduce((s, e) => s + e.amount, 0),
      lifetime: allEarnings.reduce((s, e) => s + e.amount, 0),
    });
  };

  useEffect(() => { fetchEarnings(); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchEarnings(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Earnings</Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Today</Text>
          <Text style={styles.summaryAmount}>${totals.today.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>This Week</Text>
          <Text style={styles.summaryAmount}>${totals.week.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>This Month</Text>
          <Text style={styles.summaryAmount}>${totals.month.toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.lifetimeBox}>
        <Text style={styles.lifetimeLabel}>Lifetime Earnings</Text>
        <Text style={styles.lifetimeAmount}>${totals.lifetime.toFixed(2)}</Text>
      </View>

      <View style={styles.payoutBadge}>
        <Text style={styles.payoutBadgeText}>
          💳 Payout Pending — Processed weekly once payment setup is complete
        </Text>
      </View>

      <FlatList
        data={earnings}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>💰</Text>
            <Text style={styles.emptyStateTitle}>No Earnings Yet</Text>
            <Text style={styles.emptyStateText}>Complete jobs to start earning money</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.earningRow}>
            <View>
              <Text style={styles.earningTitle}>{item.title}</Text>
              <Text style={styles.earningType}>{item.type} • {new Date(item.date).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.earningAmount}>+${item.amount.toFixed(2)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80,
  },
  emptyStateIcon: { fontSize: 56, marginBottom: 16 },
  emptyStateTitle: { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 8 },
  emptyStateText: { fontSize: 14, color: '#6b7c6b', textAlign: 'center', paddingHorizontal: 20 },
  heading: { fontSize: 24, fontWeight: '800', color: '#1a472a', padding: 20, paddingBottom: 10 },
  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  summaryCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#e8efe8',
  },
  summaryLabel: { fontSize: 12, color: '#888', fontWeight: '600' },
  summaryAmount: { fontSize: 20, fontWeight: '800', color: '#1a472a', marginTop: 4 },
  lifetimeBox: {
    backgroundColor: '#1a472a', borderRadius: 16, margin: 16, padding: 20,
    alignItems: 'center',
  },
  lifetimeLabel: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  lifetimeAmount: { fontSize: 36, fontWeight: '900', color: '#fff', marginTop: 4 },
  payoutBadge: {
    backgroundColor: '#fef5ed', borderRadius: 12, marginHorizontal: 16,
    padding: 12, marginBottom: 12,
  },
  payoutBadgeText: { fontSize: 12, color: '#e67e22', textAlign: 'center' },
  earningRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e8efe8',
  },
  earningTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  earningType: { fontSize: 12, color: '#888', marginTop: 2 },
  earningAmount: { fontSize: 18, fontWeight: '800', color: '#27ae60' },
});
