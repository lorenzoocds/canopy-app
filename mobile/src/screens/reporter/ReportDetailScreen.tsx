import React, { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Report } from '../../types/database';

const STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'dispatched', label: 'Worker Dispatched' },
  { key: 'verified', label: 'Verified' },
  { key: 'work_order_created', label: 'Work Order Created' },
  { key: 'resolved', label: 'Resolved' },
];

const BOUNTY_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending Verification', color: '#f39c12', bg: '#fef5ed' },
  earned: { label: 'Earned — $5.00', color: '#27ae60', bg: '#eafaf1' },
  paid: { label: 'Paid — $5.00', color: '#2ecc71', bg: '#eafaf1' },
};

export default function ReportDetailScreen({ route }: any) {
  const { reportId } = route.params;
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    fetchReport();

    // Supabase Realtime subscription — live progress updates
    const channel = supabase
      .channel(`report-${reportId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reports',
          filter: `id=eq.${reportId}`,
        },
        (payload) => {
          setReport((prev) => prev ? { ...prev, ...payload.new } as Report : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reportId]);

  const fetchReport = async () => {
    const { data } = await supabase
      .from('reports')
      .select('*, category:categories(*)')
      .eq('id', reportId)
      .single();
    if (data) setReport(data as Report);
  };

  if (!report) {
    return (
      <View style={styles.loading}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === report.status);
  const bounty = BOUNTY_DISPLAY[report.bounty_status];

  return (
    <ScrollView style={styles.container}>
      {/* Photo */}
      <Image source={{ uri: report.photo_url }} style={styles.photo} />

      {/* Info */}
      <View style={styles.infoSection}>
        <Text style={styles.category}>{report.category?.name || 'Report'}</Text>
        <Text style={styles.address}>📍 {report.address}</Text>
        {report.description && <Text style={styles.description}>{report.description}</Text>}
      </View>

      {/* Progress Tracker */}
      <View style={styles.trackerSection}>
        <Text style={styles.sectionTitle}>Progress</Text>
        {STEPS.map((step, index) => {
          const isComplete = index <= currentStepIndex;
          const isCurrent = index === currentStepIndex;
          return (
            <View key={step.key} style={styles.stepRow}>
              <View style={styles.stepIndicatorCol}>
                <View
                  style={[
                    styles.stepDot,
                    isComplete && styles.stepDotComplete,
                    isCurrent && styles.stepDotCurrent,
                  ]}
                >
                  {isComplete && <Text style={styles.checkmark}>✓</Text>}
                </View>
                {index < STEPS.length - 1 && (
                  <View style={[styles.stepLine, isComplete && styles.stepLineComplete]} />
                )}
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepLabel, isComplete && styles.stepLabelComplete]}>
                  {step.label}
                </Text>
                {isComplete && step.key === 'resolved' && report.category && (
                  <Text style={styles.stepDate}>
                    Est. resolution date set by utility
                  </Text>
                )}
                {isComplete && step.key !== 'resolved' && (
                  <Text style={styles.stepDate}>
                    {new Date(report.updated_at).toLocaleString()}
                  </Text>
                )}
                {!isComplete && <Text style={styles.stepPending}>Pending</Text>}
              </View>
            </View>
          );
        })}
      </View>

      {/* Bounty */}
      <View style={[styles.bountyBadge, { backgroundColor: bounty?.bg }]}>
        <Text style={[styles.bountyText, { color: bounty?.color }]}>
          💰 {bounty?.label}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8faf8' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photo: { width: '100%', height: 250 },
  infoSection: { padding: 20 },
  category: { fontSize: 22, fontWeight: '800', color: '#1a472a' },
  address: { fontSize: 14, color: '#666', marginTop: 6 },
  description: { fontSize: 15, color: '#444', marginTop: 10, lineHeight: 22 },
  trackerSection: { paddingHorizontal: 20, marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1a472a', marginBottom: 16 },
  stepRow: { flexDirection: 'row', minHeight: 56 },
  stepIndicatorCol: { width: 32, alignItems: 'center' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: '#d0d8d0', backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  stepDotComplete: { borderColor: '#27ae60', backgroundColor: '#27ae60' },
  stepDotCurrent: { borderColor: '#1a472a', backgroundColor: '#1a472a', transform: [{ scale: 1.1 }] },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepLine: { flex: 1, width: 2, backgroundColor: '#d0d8d0', marginVertical: 2 },
  stepLineComplete: { backgroundColor: '#27ae60' },
  stepContent: { flex: 1, paddingLeft: 14, paddingBottom: 20 },
  stepLabel: { fontSize: 15, fontWeight: '600', color: '#999' },
  stepLabelComplete: { color: '#333' },
  stepDate: { fontSize: 12, color: '#888', marginTop: 2 },
  stepPending: { fontSize: 12, color: '#ccc', marginTop: 2 },
  bountyBadge: {
    marginHorizontal: 20, borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 10, marginBottom: 40,
  },
  bountyText: { fontSize: 16, fontWeight: '700' },
});
