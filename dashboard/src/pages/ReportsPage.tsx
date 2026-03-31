import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { dispatchJob } from '../lib/dispatch';

interface Report {
  id: string;
  date_submitted: string;
  category: string;
  address: string;
  status: string;
  bounty_amount: number;
  reporter_id: string;
  verifier_id: string | null;
  reporter_photo_url: string | null;
  verifier_photo_url: string | null;
  notes: string;
  created_at: string;
  verified_at: string | null;
  work_order_created: boolean;
  source?: string;
  latitude?: number;
  longitude?: number;
  external_id?: string;
}

interface AnalyticsData {
  todayCount: number;
  yesterdayCount: number;
  weeklyCount: number;
  totalCount: number;
  submittedCount: number;
  verifiedCount: number;
  rejectedCount: number;
  avgVerificationTimeHours: number | null;
  verificationRate: number;
}

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [userUtilityCompany, setUserUtilityCompany] = useState<string | null>(null);
  const [dispatchEnabled, setDispatchEnabled] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    todayCount: 0,
    yesterdayCount: 0,
    weeklyCount: 0,
    totalCount: 0,
    submittedCount: 0,
    verifiedCount: 0,
    rejectedCount: 0,
    avgVerificationTimeHours: null,
    verificationRate: 0,
  });
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchUserProfile();
    fetchReports();

    // Auto-refresh every 5 minutes
    autoRefreshRef.current = setInterval(() => {
      fetchReports(true);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current);
      }
    };
  }, []);

  // Recalculate analytics whenever reports change
  useEffect(() => {
    calculateAnalytics(reports);
  }, [reports]);

  const calculateAnalytics = (reportData: Report[]) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const todayCount = reportData.filter(
      (r) => new Date(r.created_at) >= todayStart
    ).length;
    const yesterdayCount = reportData.filter(
      (r) => {
        const d = new Date(r.created_at);
        return d >= yesterdayStart && d < todayStart;
      }
    ).length;
    const weeklyCount = reportData.filter(
      (r) => new Date(r.created_at) >= weekStart
    ).length;

    const submittedCount = reportData.filter((r) => r.status === 'submitted').length;
    const verifiedCount = reportData.filter((r) => r.status === 'verified').length;
    const rejectedCount = reportData.filter((r) => r.status === 'rejected').length;

    // Average verification time (for reports that have verified_at)
    const verifiedReports = reportData.filter((r) => r.verified_at && r.created_at);
    let avgVerificationTimeHours: number | null = null;
    if (verifiedReports.length > 0) {
      const totalHours = verifiedReports.reduce((sum, r) => {
        const created = new Date(r.created_at).getTime();
        const verified = new Date(r.verified_at!).getTime();
        return sum + (verified - created) / (1000 * 60 * 60);
      }, 0);
      avgVerificationTimeHours = Math.round((totalHours / verifiedReports.length) * 10) / 10;
    }

    const totalWithDecision = verifiedCount + rejectedCount;
    const verificationRate = totalWithDecision > 0
      ? Math.round((verifiedCount / totalWithDecision) * 100)
      : 0;

    setAnalytics({
      todayCount,
      yesterdayCount,
      weeklyCount,
      totalCount: reportData.length,
      submittedCount,
      verifiedCount,
      rejectedCount,
      avgVerificationTimeHours,
      verificationRate,
    });
  };

  const fetchUserProfile = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;

      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (profile?.utility_company) {
        setUserUtilityCompany(profile.utility_company);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  const fetchReports = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from('reports')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data as Report[]);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // First, trigger the ingest edge function to pull latest NYC 311 data
      const response = await fetch(
        'https://wowyavzbcmegwqnmulff.supabase.co/functions/v1/ingest-311-nyc',
        { method: 'POST' }
      );
      if (!response.ok) {
        console.warn('Ingest function returned:', response.status);
      }
      // Then re-fetch reports from the database
      await fetchReports(true);
    } catch (err) {
      console.error('Error during manual refresh:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleCreateWorkOrder = async (reportId: string) => {
    try {
      setDispatchLoading(true);
      setDispatchResult(null);

      const { error } = await supabase
        .from('reports')
        .update({ work_order_created: true })
        .eq('id', reportId);

      if (error) throw error;

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (userId) {
        const { error: woError } = await supabase.from('work_orders').insert({
          report_id: reportId,
          errand_id: null,
          created_by: userId,
          status: 'open',
          utility_company: userUtilityCompany,
          estimated_resolution_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

        if (woError) throw woError;
      }

      // Optionally dispatch via DoorDash
      if (dispatchEnabled && selectedReport) {
        const result = await dispatchJob({
          jobType: 'verify',
          reportId: reportId,
          pickupAddress: selectedReport.address || '',
          pickupLat: selectedReport.latitude || 0,
          pickupLng: selectedReport.longitude || 0,
          dropoffAddress: selectedReport.address || '',
          dropoffLat: selectedReport.latitude || 0,
          dropoffLng: selectedReport.longitude || 0,
          taskDescription: `Verify reported ${selectedReport.category} at ${selectedReport.address}`,
          payoutAmount: 7.00,
        });

        if (result.success) {
          setDispatchResult(`Dispatched to DoorDash! Delivery ID: ${result.deliveryId}`);
        } else {
          setDispatchResult(`Work order saved. DoorDash dispatch failed: ${result.error}`);
        }
      }

      fetchReports();
      if (!dispatchEnabled) {
        setShowModal(false);
      }
    } catch (err) {
      console.error('Error creating work order:', err);
    } finally {
      setDispatchLoading(false);
    }
  };

  const handleRejectReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('reports')
        .update({ status: 'rejected' })
        .eq('id', reportId);

      if (error) throw error;

      fetchReports();
      setShowModal(false);
    } catch (err) {
      console.error('Error rejecting report:', err);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (sourceFilter && r.source !== sourceFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const exportToCSV = () => {
    const headers = ['Date', 'Category', 'Address', 'Source', 'Status', 'Bounty', 'Notes'];
    const rows = filteredReports.map((r) => [
      new Date(r.created_at).toLocaleDateString(),
      r.category,
      r.address,
      r.source || 'canopy_app',
      r.status,
      `$${r.bounty_amount}`,
      r.notes,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reports.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div style={styles.container}>
      {/* Analytics Bar */}
      <div style={styles.analyticsBar}>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{analytics.todayCount}</div>
          <div style={styles.metricLabel}>Today</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{analytics.yesterdayCount}</div>
          <div style={styles.metricLabel}>Yesterday</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{analytics.weeklyCount}</div>
          <div style={styles.metricLabel}>This Week</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{analytics.totalCount}</div>
          <div style={styles.metricLabel}>Total</div>
        </div>
        <div style={styles.metricDivider} />
        <div style={styles.metricCard}>
          <div style={{ ...styles.metricValue, color: '#856404' }}>{analytics.submittedCount}</div>
          <div style={styles.metricLabel}>Pending</div>
        </div>
        <div style={styles.metricCard}>
          <div style={{ ...styles.metricValue, color: '#155724' }}>{analytics.verifiedCount}</div>
          <div style={styles.metricLabel}>Verified</div>
        </div>
        <div style={styles.metricCard}>
          <div style={{ ...styles.metricValue, color: '#721c24' }}>{analytics.rejectedCount}</div>
          <div style={styles.metricLabel}>Rejected</div>
        </div>
        <div style={styles.metricDivider} />
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>{analytics.verificationRate}%</div>
          <div style={styles.metricLabel}>Approval Rate</div>
        </div>
        <div style={styles.metricCard}>
          <div style={styles.metricValue}>
            {analytics.avgVerificationTimeHours !== null
              ? `${analytics.avgVerificationTimeHours}h`
              : '—'}
          </div>
          <div style={styles.metricLabel}>Avg Verify Time</div>
        </div>
      </div>

      {/* Header with filters and refresh */}
      <div style={styles.header}>
        <h1 style={styles.title}>Reports</h1>
        <div style={styles.headerActions}>
          <div style={styles.sourceChips}>
            {[
              { label: 'All Sources', value: '' },
              { label: 'Canopy App', value: 'canopy_app' },
              { label: 'NYC 311', value: '311_nyc' },
            ].map((chip) => (
              <button
                key={chip.value}
                onClick={() => { setSourceFilter(chip.value); setCurrentPage(1); }}
                style={{
                  ...styles.chip,
                  ...(sourceFilter === chip.value ? styles.chipActive : {}),
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={styles.filterSelect}
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            style={{
              ...styles.refreshButton,
              opacity: refreshing ? 0.6 : 1,
              cursor: refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing ? '↻ Refreshing...' : '↻ Refresh Data'}
          </button>
          <span style={styles.lastRefreshed}>
            Updated {formatTimeAgo(lastRefreshed)}
          </span>
          <button onClick={exportToCSV} style={styles.exportButton}>
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : paginatedReports.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No reports found</p>
        </div>
      ) : (
        <>
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.headerRow}>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Address</th>
                  <th style={styles.th}>Source</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Bounty</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.map((report) => (
                  <tr
                    key={report.id}
                    style={styles.row}
                    onClick={() => {
                      setSelectedReport(report);
                      setShowModal(true);
                      setDispatchResult(null);
                    }}
                  >
                    <td style={styles.td}>{new Date(report.created_at).toLocaleDateString()}</td>
                    <td style={styles.td}>{report.category}</td>
                    <td style={styles.td}>{report.address}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.sourceBadge,
                        ...(report.source === '311_nyc'
                          ? { backgroundColor: '#e3f2fd', color: '#0d47a1' }
                          : { backgroundColor: '#e8f5e9', color: '#2e7d32' }),
                      }}>
                        {report.source === '311_nyc' ? 'NYC 311' : 'Canopy'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...getStatusBadgeColor(report.status) }}>
                        {report.status}
                      </span>
                    </td>
                    <td style={styles.td}>${report.bounty_amount}</td>
                    <td style={styles.td}>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedReport(report); setShowModal(true); }} style={styles.actionButton}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={styles.pagination}>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                style={{
                  ...styles.paginationButton,
                  ...(currentPage === 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
              >
                Previous
              </button>
              <span style={styles.pageInfo}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                style={{
                  ...styles.paginationButton,
                  ...(currentPage === totalPages ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Report Detail Modal */}
      {showModal && selectedReport && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.closeButton} onClick={() => setShowModal(false)}>
              ×
            </button>
            <h2 style={styles.modalTitle}>Report Details</h2>

            <div style={styles.modalContent}>
              {/* Map Section */}
              {selectedReport.latitude && selectedReport.longitude && (
                <div style={styles.mapSection}>
                  <p style={styles.sectionLabel}>Location</p>
                  <iframe
                    title="Report Location"
                    width="100%"
                    height="250"
                    style={{ border: 'none', borderRadius: '6px' }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedReport.longitude - 0.005},${selectedReport.latitude - 0.003},${selectedReport.longitude + 0.005},${selectedReport.latitude + 0.003}&layer=mapnik&marker=${selectedReport.latitude},${selectedReport.longitude}`}
                  />
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${selectedReport.latitude}&mlon=${selectedReport.longitude}#map=17/${selectedReport.latitude}/${selectedReport.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.mapLink}
                  >
                    Open in full map ↗
                  </a>
                </div>
              )}

              {/* Photo Section */}
              <div style={styles.photoSection}>
                {selectedReport.reporter_photo_url && (
                  <div style={styles.photoBox}>
                    <p style={styles.photoLabel}>Reporter Photo</p>
                    <img
                      src={selectedReport.reporter_photo_url}
                      alt="Reporter submission"
                      style={styles.photo}
                    />
                  </div>
                )}
                {selectedReport.verifier_photo_url && selectedReport.status === 'verified' && (
                  <div style={styles.photoBox}>
                    <p style={styles.photoLabel}>Verifier Photo</p>
                    <img
                      src={selectedReport.verifier_photo_url}
                      alt="Verifier confirmation"
                      style={styles.photo}
                    />
                  </div>
                )}
                {!selectedReport.reporter_photo_url && !selectedReport.verifier_photo_url && (
                  <div style={styles.noPhotos}>
                    <span style={{ fontSize: '24px' }}>📷</span>
                    <p style={{ margin: '4px 0 0 0', color: '#999', fontSize: '13px' }}>
                      {selectedReport.source === '311_nyc'
                        ? 'NYC 311 reports do not include photos'
                        : 'No photos attached to this report'}
                    </p>
                  </div>
                )}
              </div>

              {/* Details */}
              <div style={styles.details}>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Category</span>
                  <span>{selectedReport.category}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Address</span>
                  <span>{selectedReport.address}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Source</span>
                  <span style={{
                    ...styles.sourceBadge,
                    ...(selectedReport.source === '311_nyc'
                      ? { backgroundColor: '#e3f2fd', color: '#0d47a1' }
                      : { backgroundColor: '#e8f5e9', color: '#2e7d32' }),
                  }}>
                    {selectedReport.source === '311_nyc' ? 'NYC 311' : 'Canopy App'}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Status</span>
                  <span style={{ ...styles.badge, ...getStatusBadgeColor(selectedReport.status) }}>
                    {selectedReport.status}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Bounty</span>
                  <span>${selectedReport.bounty_amount}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Submitted</span>
                  <span>{new Date(selectedReport.created_at).toLocaleString()}</span>
                </div>
                {selectedReport.verified_at && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Verified</span>
                    <span>{new Date(selectedReport.verified_at).toLocaleString()}</span>
                  </div>
                )}
                {selectedReport.latitude && selectedReport.longitude && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Coordinates</span>
                    <span>{selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}</span>
                  </div>
                )}
                {selectedReport.notes && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Notes</span>
                    <span>{selectedReport.notes}</span>
                  </div>
                )}
                {selectedReport.external_id && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>External ID</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{selectedReport.external_id}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedReport.status === 'verified' && !selectedReport.work_order_created && (
              <div style={styles.dispatchToggle}>
                <label style={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={dispatchEnabled}
                    onChange={(e) => setDispatchEnabled(e.target.checked)}
                    style={styles.checkbox}
                  />
                  Dispatch via DoorDash
                </label>
                <span style={styles.toggleHint}>
                  {dispatchEnabled
                    ? 'A DoorDash Dasher will be assigned to verify this report'
                    : 'Work order saved without dispatch (manual verification)'}
                </span>
              </div>
            )}

            {dispatchResult && (
              <div style={styles.dispatchResultBox}>
                {dispatchResult}
              </div>
            )}

            <div style={styles.modalActions}>
              {selectedReport.status === 'verified' && !selectedReport.work_order_created && (
                <button
                  onClick={() => handleCreateWorkOrder(selectedReport.id)}
                  disabled={dispatchLoading}
                  style={{
                    ...styles.actionBtn,
                    ...styles.primaryBtn,
                    ...(dispatchLoading ? { opacity: 0.6 } : {}),
                  }}
                >
                  {dispatchLoading
                    ? 'Dispatching...'
                    : dispatchEnabled
                    ? 'Create & Dispatch'
                    : 'Create Work Order'}
                </button>
              )}
              {selectedReport.status !== 'rejected' && (
                <button
                  onClick={() => handleRejectReport(selectedReport.id)}
                  style={{ ...styles.actionBtn, ...styles.dangerBtn }}
                >
                  Reject Report
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const getStatusBadgeColor = (status: string): React.CSSProperties => {
  const colors: Record<string, { backgroundColor: string; color: string }> = {
    submitted: { backgroundColor: '#fff3cd', color: '#856404' },
    verified: { backgroundColor: '#d4edda', color: '#155724' },
    rejected: { backgroundColor: '#f8d7da', color: '#721c24' },
  };
  return colors[status] || { backgroundColor: '#e2e3e5', color: '#383d41' };
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '30px',
  },
  // Analytics bar
  analyticsBar: {
    display: 'flex',
    gap: '0',
    marginBottom: '24px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    padding: '16px 20px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metricCard: {
    flex: '1',
    textAlign: 'center' as const,
    minWidth: '80px',
    padding: '4px 8px',
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1a472a',
    lineHeight: '1.2',
  },
  metricLabel: {
    fontSize: '11px',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginTop: '2px',
  },
  metricDivider: {
    width: '1px',
    height: '40px',
    backgroundColor: '#e0e0e0',
    margin: '0 8px',
  },
  // Header and filters
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  headerActions: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  sourceChips: {
    display: 'flex',
    gap: '6px',
  },
  chip: {
    padding: '6px 14px',
    border: '1px solid #ddd',
    borderRadius: '20px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    color: '#666',
  },
  chipActive: {
    backgroundColor: '#1a472a',
    color: 'white',
    borderColor: '#1a472a',
  },
  sourceBadge: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
  },
  filterSelect: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  title: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
  },
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#2196f3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
  },
  lastRefreshed: {
    fontSize: '12px',
    color: '#999',
    whiteSpace: 'nowrap' as const,
  },
  exportButton: {
    padding: '8px 16px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
  },
  // Table
  tableWrapper: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  headerRow: {
    backgroundColor: '#f5f5f5',
    borderBottom: '2px solid #ddd',
  },
  th: {
    padding: '12px',
    textAlign: 'left' as const,
    fontWeight: '600',
    color: '#333',
    fontSize: '14px',
  },
  row: {
    borderBottom: '1px solid #eee',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
    color: '#333',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  actionButton: {
    padding: '6px 12px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  // Modal
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    maxWidth: '700px',
    width: '90%',
    maxHeight: '85vh',
    overflowY: 'auto' as const,
    position: 'relative' as const,
  },
  closeButton: {
    position: 'absolute' as const,
    top: '10px',
    right: '10px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#666',
  },
  modalTitle: {
    margin: '0 0 20px 0',
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    marginBottom: '20px',
  },
  // Map section
  mapSection: {
    marginBottom: '20px',
  },
  sectionLabel: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  mapLink: {
    display: 'inline-block',
    marginTop: '6px',
    fontSize: '12px',
    color: '#2196f3',
    textDecoration: 'none',
  },
  // Photo section
  photoSection: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
  },
  photoBox: {
    flex: 1,
  },
  photoLabel: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: '600',
    color: '#666',
  },
  photo: {
    width: '100%',
    height: '200px',
    objectFit: 'cover' as const,
    borderRadius: '6px',
    border: '1px solid #eee',
  },
  noPhotos: {
    width: '100%',
    padding: '24px',
    backgroundColor: '#fafafa',
    borderRadius: '6px',
    border: '1px dashed #ddd',
    textAlign: 'center' as const,
  },
  // Detail rows
  details: {
    fontSize: '14px',
  },
  detailRow: {
    display: 'flex',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0',
    gap: '12px',
  },
  detailLabel: {
    fontWeight: '600',
    color: '#666',
    minWidth: '110px',
    flexShrink: 0,
  },
  // Dispatch
  dispatchToggle: {
    padding: '12px',
    backgroundColor: '#f0f7f0',
    borderRadius: '6px',
    border: '1px solid #c8e6c9',
    marginBottom: '16px',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1a472a',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  toggleHint: {
    display: 'block',
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
    marginLeft: '26px',
  },
  dispatchResultBox: {
    padding: '10px 14px',
    backgroundColor: '#e8f5e9',
    borderRadius: '4px',
    border: '1px solid #a5d6a7',
    fontSize: '13px',
    color: '#2e7d32',
    marginBottom: '16px',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: '#388e3c',
    color: 'white',
  },
  dangerBtn: {
    backgroundColor: '#d32f2f',
    color: 'white',
  },
  // Other
  loading: {
    textAlign: 'center' as const,
    fontSize: '16px',
    color: '#666',
    padding: '40px',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    fontSize: '16px',
    color: '#666',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
  },
  paginationButton: {
    padding: '8px 16px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  pageInfo: {
    fontSize: '14px',
    color: '#666',
    minWidth: '120px',
    textAlign: 'center' as const,
  },
};

export default ReportsPage;
