import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { dispatchJob } from '../lib/dispatch';

interface Report {
  id: string;
  date_submitted: string;
  category_id: string;
  description: string;
  address: string;
  status: string;
  bounty_amount: number;
  reporter_id: string | null;
  photo_url: string | null;
  source?: string;
  created_at: string;
  updated_at: string;
  latitude?: number;
  longitude?: number;
  external_id?: string;
  categories?: { name: string };
  // computed
  priority_score?: number;
  priority_label?: string;
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
  categoryBreakdown: { name: string; count: number }[];
}

// ─── Priority Engine ────────────────────────────────────────────────
// Scores each report 0–100 so admins can see what to verify first.
// Higher = more urgent.

const CATEGORY_SEVERITY: Record<string, number> = {
  'Power Line Hazard': 40,
  'Storm Damage': 30,
  'Pothole': 20,
  'Street Light Out': 15,
  'Downed Branch': 18,
  'Other': 10,
};

function computePriorityScore(report: Report, allReports: Report[]): number {
  let score = 0;
  const categoryName = report.categories?.name || 'Other';

  // 1. Category severity (0–40 pts)
  score += CATEGORY_SEVERITY[categoryName] ?? 10;

  // 2. Age penalty — older unresolved reports get more urgent (0–25 pts)
  const ageHours = (Date.now() - new Date(report.created_at).getTime()) / (1000 * 60 * 60);
  if (ageHours > 168) score += 25;       // > 1 week
  else if (ageHours > 72) score += 18;   // > 3 days
  else if (ageHours > 24) score += 12;   // > 1 day
  else if (ageHours > 6) score += 6;     // > 6 hours
  else score += 2;

  // 3. Location clustering — multiple reports near same spot = real problem (0–25 pts)
  if (report.latitude && report.longitude) {
    const CLUSTER_RADIUS_KM = 0.3; // ~300 meters
    const nearby = allReports.filter((r) => {
      if (r.id === report.id || !r.latitude || !r.longitude) return false;
      const dist = haversineKm(report.latitude!, report.longitude!, r.latitude!, r.longitude!);
      return dist < CLUSTER_RADIUS_KM;
    });
    if (nearby.length >= 5) score += 25;
    else if (nearby.length >= 3) score += 18;
    else if (nearby.length >= 1) score += 8;
  }

  // 4. Source bonus — Canopy app reports have a human reporter invested (0–10 pts)
  if (report.source === 'canopy_app') score += 10;
  else score += 3; // 311 still gets some weight

  return Math.min(score, 100);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPriorityLabel(score: number): string {
  if (score >= 70) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

function getPriorityColor(label: string): { backgroundColor: string; color: string } {
  switch (label) {
    case 'Critical': return { backgroundColor: '#f8d7da', color: '#721c24' };
    case 'High': return { backgroundColor: '#fff3cd', color: '#856404' };
    case 'Medium': return { backgroundColor: '#d4edda', color: '#155724' };
    default: return { backgroundColor: '#e2e3e5', color: '#383d41' };
  }
}

// ─── Constants ───────────────────────────────────────────────────────
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

type SortMode = 'priority' | 'newest' | 'oldest';

// ─── Component ───────────────────────────────────────────────────────
const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [currentPage, setCurrentPage] = useState(1);
  const [userUtilityCompany, setUserUtilityCompany] = useState<string | null>(null);
  const [dispatchEnabled, setDispatchEnabled] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    todayCount: 0, yesterdayCount: 0, weeklyCount: 0, totalCount: 0,
    submittedCount: 0, verifiedCount: 0, rejectedCount: 0,
    avgVerificationTimeHours: null, verificationRate: 0,
    categoryBreakdown: [],
  });
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const itemsPerPage = 15;

  useEffect(() => {
    fetchUserProfile();
    fetchReports();
    autoRefreshRef.current = setInterval(() => fetchReports(true), AUTO_REFRESH_INTERVAL);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, []);

  useEffect(() => { calculateAnalytics(reports); }, [reports]);

  // ─── Scoring ────────────────────────────────────────────
  const scoredReports = useMemo(() => {
    return reports.map((r) => {
      const score = computePriorityScore(r, reports);
      return { ...r, priority_score: score, priority_label: getPriorityLabel(score) };
    });
  }, [reports]);

  // ─── Filtering & Sorting ───────────────────────────────
  const filteredReports = useMemo(() => {
    let result = scoredReports.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (sourceFilter && r.source !== sourceFilter) return false;
      if (categoryFilter && r.categories?.name !== categoryFilter) return false;
      return true;
    });

    if (sortMode === 'priority') {
      result.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
    } else if (sortMode === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    return result;
  }, [scoredReports, statusFilter, sourceFilter, categoryFilter, sortMode]);

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = filteredReports.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    reports.forEach((r) => { if (r.categories?.name) cats.add(r.categories.name); });
    return Array.from(cats).sort();
  }, [reports]);

  // ─── Analytics ──────────────────────────────────────────
  const calculateAnalytics = (data: Report[]) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);

    const todayCount = data.filter((r) => new Date(r.created_at) >= todayStart).length;
    const yesterdayCount = data.filter((r) => { const d = new Date(r.created_at); return d >= yesterdayStart && d < todayStart; }).length;
    const weeklyCount = data.filter((r) => new Date(r.created_at) >= weekStart).length;
    const submittedCount = data.filter((r) => r.status === 'submitted').length;
    const verifiedCount = data.filter((r) => r.status === 'verified').length;
    const rejectedCount = data.filter((r) => r.status === 'rejected').length;
    const totalWithDecision = verifiedCount + rejectedCount;
    const verificationRate = totalWithDecision > 0 ? Math.round((verifiedCount / totalWithDecision) * 100) : 0;

    // Category breakdown
    const catCounts: Record<string, number> = {};
    data.forEach((r) => {
      const name = r.categories?.name || 'Unknown';
      catCounts[name] = (catCounts[name] || 0) + 1;
    });
    const categoryBreakdown = Object.entries(catCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    setAnalytics({
      todayCount, yesterdayCount, weeklyCount, totalCount: data.length,
      submittedCount, verifiedCount, rejectedCount,
      avgVerificationTimeHours: null, verificationRate, categoryBreakdown,
    });
  };

  // ─── Data Fetching ──────────────────────────────────────
  const fetchUserProfile = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;
      const { data: profile } = await supabase.from('users').select('*').eq('id', userId).single();
      if (profile?.utility_company) setUserUtilityCompany(profile.utility_company);
    } catch (err) { console.error('Error fetching user profile:', err); }
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
    } catch (err) { console.error('Error fetching reports:', err); }
    finally { if (!silent) setLoading(false); }
  };

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('https://wowyavzbcmegwqnmulff.supabase.co/functions/v1/ingest-311-nyc', { method: 'POST' });
      await fetchReports(true);
    } catch (err) { console.error('Error during manual refresh:', err); }
    finally { setRefreshing(false); }
  }, []);

  // ─── Actions ────────────────────────────────────────────
  const handleCreateWorkOrder = async (reportId: string) => {
    try {
      setDispatchLoading(true); setDispatchResult(null);
      await supabase.from('reports').update({ status: 'verified' }).eq('id', reportId);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (userId) {
        await supabase.from('work_orders').insert({
          report_id: reportId, errand_id: null, created_by: userId, status: 'open',
          utility_company: userUtilityCompany,
          estimated_resolution_date: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
      }
      if (dispatchEnabled && selectedReport) {
        const result = await dispatchJob({
          jobType: 'verify', reportId,
          pickupAddress: selectedReport.address || '',
          pickupLat: selectedReport.latitude || 0, pickupLng: selectedReport.longitude || 0,
          dropoffAddress: selectedReport.address || '',
          dropoffLat: selectedReport.latitude || 0, dropoffLng: selectedReport.longitude || 0,
          taskDescription: `Verify reported ${selectedReport.categories?.name || 'issue'} at ${selectedReport.address}`,
          payoutAmount: 7.00,
        });
        setDispatchResult(result.success
          ? `Dispatched to DoorDash! Delivery ID: ${result.deliveryId}`
          : `Work order saved. DoorDash dispatch failed: ${result.error}`);
      }
      fetchReports();
      if (!dispatchEnabled) setShowModal(false);
    } catch (err) { console.error('Error creating work order:', err); }
    finally { setDispatchLoading(false); }
  };

  const handleRejectReport = async (reportId: string) => {
    try {
      await supabase.from('reports').update({ status: 'rejected' }).eq('id', reportId);
      fetchReports(); setShowModal(false);
    } catch (err) { console.error('Error rejecting report:', err); }
  };

  // ─── Helpers ────────────────────────────────────────────
  const exportToCSV = () => {
    const headers = ['Date', 'Category', 'Description', 'Address', 'Source', 'Status', 'Priority'];
    const rows = filteredReports.map((r) => [
      new Date(r.created_at).toLocaleDateString(),
      r.categories?.name || '',
      r.description,
      r.address,
      r.source || 'canopy_app',
      r.status,
      r.priority_label || '',
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'canopy-reports.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimeAgo = (date: Date) => {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  };

  const truncate = (text: string, max: number) =>
    text && text.length > max ? text.slice(0, max) + '...' : text || '';

  // ─── Render ─────────────────────────────────────────────
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
      </div>

      {/* Category Breakdown Mini Chips */}
      {analytics.categoryBreakdown.length > 0 && (
        <div style={styles.categoryBar}>
          {analytics.categoryBreakdown.map((cat) => (
            <span
              key={cat.name}
              onClick={() => { setCategoryFilter(categoryFilter === cat.name ? '' : cat.name); setCurrentPage(1); }}
              style={{
                ...styles.catChip,
                ...(categoryFilter === cat.name ? styles.catChipActive : {}),
              }}
            >
              {cat.name} ({cat.count})
            </span>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          Reports
          {sortMode === 'priority' && (
            <span style={styles.titleBadge}>Sorted by Priority</span>
          )}
        </h1>
        <div style={styles.headerActions}>
          <div style={styles.sourceChips}>
            {[{ label: 'All', value: '' }, { label: 'Canopy', value: 'canopy_app' }, { label: 'NYC 311', value: '311_nyc' }].map((chip) => (
              <button key={chip.value} onClick={() => { setSourceFilter(chip.value); setCurrentPage(1); }}
                style={{ ...styles.chip, ...(sourceFilter === chip.value ? styles.chipActive : {}) }}>
                {chip.label}
              </button>
            ))}
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} style={styles.filterSelect}>
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={sortMode} onChange={(e) => { setSortMode(e.target.value as SortMode); setCurrentPage(1); }} style={styles.filterSelect}>
            <option value="priority">Sort: Priority</option>
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
          <button onClick={handleManualRefresh} disabled={refreshing}
            style={{ ...styles.refreshButton, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <span style={styles.lastRefreshed}>Updated {formatTimeAgo(lastRefreshed)}</span>
          <button onClick={exportToCSV} style={styles.exportButton}>Export CSV</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={styles.loading}>Loading reports...</div>
      ) : paginatedReports.length === 0 ? (
        <div style={styles.emptyState}><p>No reports found</p></div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.headerRow}>
                {sortMode === 'priority' && <th style={{ ...styles.th, width: '90px' }}>Priority</th>}
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Category</th>
                <th style={{ ...styles.th, minWidth: '200px' }}>Description</th>
                <th style={styles.th}>Address</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedReports.map((report) => (
                <tr key={report.id} style={styles.row}
                  onClick={() => { setSelectedReport(report); setShowModal(true); setDispatchResult(null); }}>
                  {sortMode === 'priority' && (
                    <td style={styles.td}>
                      <span style={{ ...styles.badge, ...getPriorityColor(report.priority_label || 'Low') }}>
                        {report.priority_label}
                      </span>
                    </td>
                  )}
                  <td style={styles.td}>{new Date(report.created_at).toLocaleDateString()}</td>
                  <td style={styles.td}>
                    <span style={styles.categoryName}>{report.categories?.name || '—'}</span>
                  </td>
                  <td style={{ ...styles.td, color: '#555', fontSize: '13px' }}>
                    {truncate(report.description, 60)}
                  </td>
                  <td style={styles.td}>{truncate(report.address, 35)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>

          <div style={styles.pagination}>
            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
              style={{ ...styles.paginationButton, ...(currentPage === 1 ? { opacity: 0.5 } : {}) }}>
              Previous
            </button>
            <span style={styles.pageInfo}>Page {currentPage} of {totalPages} ({filteredReports.length} reports)</span>
            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
              style={{ ...styles.paginationButton, ...(currentPage === totalPages ? { opacity: 0.5 } : {}) }}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* Report Detail Modal */}
      {showModal && selectedReport && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.closeButton} onClick={() => setShowModal(false)}>×</button>

            {/* Priority banner */}
            {selectedReport.priority_label && selectedReport.status === 'submitted' && (
              <div style={{
                ...styles.priorityBanner,
                ...getPriorityColor(selectedReport.priority_label),
                borderLeft: `4px solid ${getPriorityColor(selectedReport.priority_label).color}`,
              }}>
                <strong>{selectedReport.priority_label} Priority</strong>
                <span style={{ marginLeft: '8px', fontWeight: 'normal' }}>
                  — Score {selectedReport.priority_score}/100
                  {selectedReport.priority_label === 'Critical' && ' — Recommend immediate verification'}
                  {selectedReport.priority_label === 'High' && ' — Should be verified soon'}
                </span>
              </div>
            )}

            <h2 style={styles.modalTitle}>
              {selectedReport.categories?.name || 'Report Details'}
            </h2>
            <p style={styles.modalDescription}>{selectedReport.description}</p>

            <div style={styles.modalContent}>
              {/* Map */}
              {selectedReport.latitude && selectedReport.longitude && (
                <div style={styles.mapSection}>
                  <p style={styles.sectionLabel}>Location</p>
                  <iframe
                    title="Report Location" width="100%" height="250"
                    style={{ border: 'none', borderRadius: '6px' }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedReport.longitude - 0.005},${selectedReport.latitude - 0.003},${selectedReport.longitude + 0.005},${selectedReport.latitude + 0.003}&layer=mapnik&marker=${selectedReport.latitude},${selectedReport.longitude}`}
                  />
                  <a href={`https://www.openstreetmap.org/?mlat=${selectedReport.latitude}&mlon=${selectedReport.longitude}#map=17/${selectedReport.latitude}/${selectedReport.longitude}`}
                    target="_blank" rel="noopener noreferrer" style={styles.mapLink}>
                    Open in full map
                  </a>
                </div>
              )}

              {/* Photo */}
              {selectedReport.photo_url ? (
                <div style={{ marginBottom: '16px' }}>
                  <p style={styles.sectionLabel}>Photo</p>
                  <img src={selectedReport.photo_url} alt="Report" style={styles.photo} />
                </div>
              ) : (
                <div style={styles.noPhotos}>
                  <span style={{ fontSize: '20px' }}>📷</span>
                  <p style={{ margin: '4px 0 0', color: '#999', fontSize: '13px' }}>
                    {selectedReport.source === '311_nyc'
                      ? 'NYC 311 reports do not include photos'
                      : 'No photo attached'}
                  </p>
                </div>
              )}

              {/* Details Grid */}
              <div style={styles.details}>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Category</span>
                  <span>{selectedReport.categories?.name || '—'}</span>
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
                  <span style={styles.detailLabel}>Submitted</span>
                  <span>{new Date(selectedReport.created_at).toLocaleString()}</span>
                </div>
                {selectedReport.latitude && selectedReport.longitude && (
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>Coordinates</span>
                    <span>{selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}</span>
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

            {/* Dispatch Toggle */}
            {selectedReport.status === 'submitted' && (
              <div style={styles.dispatchToggle}>
                <label style={styles.toggleLabel}>
                  <input type="checkbox" checked={dispatchEnabled}
                    onChange={(e) => setDispatchEnabled(e.target.checked)} style={styles.checkbox} />
                  Dispatch via DoorDash
                </label>
                <span style={styles.toggleHint}>
                  {dispatchEnabled
                    ? 'A DoorDash Dasher will be assigned to verify this report'
                    : 'Work order saved without dispatch (manual verification)'}
                </span>
              </div>
            )}

            {dispatchResult && <div style={styles.dispatchResultBox}>{dispatchResult}</div>}

            <div style={styles.modalActions}>
              {selectedReport.status === 'submitted' && (
                <button onClick={() => handleCreateWorkOrder(selectedReport.id)}
                  disabled={dispatchLoading}
                  style={{ ...styles.actionBtn, ...styles.primaryBtn, ...(dispatchLoading ? { opacity: 0.6 } : {}) }}>
                  {dispatchLoading ? 'Processing...' : dispatchEnabled ? 'Verify & Dispatch' : 'Verify Report'}
                </button>
              )}
              {selectedReport.status === 'submitted' && (
                <button onClick={() => handleRejectReport(selectedReport.id)}
                  style={{ ...styles.actionBtn, ...styles.dangerBtn }}>
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

// ─── Styles ──────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: { padding: '24px 30px' },
  // Analytics
  analyticsBar: {
    display: 'flex', gap: '0', marginBottom: '16px', backgroundColor: 'white',
    borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    padding: '14px 20px', alignItems: 'center', flexWrap: 'wrap',
  },
  metricCard: { flex: '1', textAlign: 'center', minWidth: '70px', padding: '4px 6px' },
  metricValue: { fontSize: '22px', fontWeight: 'bold', color: '#1a472a', lineHeight: '1.2' },
  metricLabel: { fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' },
  metricDivider: { width: '1px', height: '36px', backgroundColor: '#e0e0e0', margin: '0 6px' },
  // Category bar
  categoryBar: {
    display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap',
  },
  catChip: {
    padding: '4px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: '500',
    backgroundColor: '#f5f5f5', color: '#555', cursor: 'pointer', border: '1px solid #e0e0e0',
  },
  catChipActive: {
    backgroundColor: '#1a472a', color: 'white', borderColor: '#1a472a',
  },
  // Header
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '16px', flexWrap: 'wrap', gap: '10px',
  },
  headerActions: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  sourceChips: { display: 'flex', gap: '4px' },
  chip: {
    padding: '5px 12px', border: '1px solid #ddd', borderRadius: '16px',
    backgroundColor: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: '500', color: '#666',
  },
  chipActive: { backgroundColor: '#1a472a', color: 'white', borderColor: '#1a472a' },
  sourceBadge: { display: 'inline-block', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' },
  filterSelect: { padding: '6px 10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', backgroundColor: 'white', cursor: 'pointer' },
  title: { margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' },
  titleBadge: { fontSize: '11px', fontWeight: '500', color: '#666', backgroundColor: '#f0f0f0', padding: '3px 8px', borderRadius: '10px' },
  refreshButton: {
    padding: '6px 14px', backgroundColor: '#2196f3', color: 'white',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500',
  },
  lastRefreshed: { fontSize: '11px', color: '#999', whiteSpace: 'nowrap' },
  exportButton: {
    padding: '6px 14px', backgroundColor: '#1a472a', color: 'white',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500',
  },
  // Table
  tableWrapper: { backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  headerRow: { backgroundColor: '#f8f8f8', borderBottom: '2px solid #e0e0e0' },
  th: { padding: '10px 12px', textAlign: 'left', fontWeight: '600', color: '#444', fontSize: '13px' },
  row: { borderBottom: '1px solid #f0f0f0', cursor: 'pointer' },
  td: { padding: '10px 12px', fontSize: '13px', color: '#333' },
  badge: { display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' },
  categoryName: { fontWeight: '600', color: '#333' },
  // Modal
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center',
    alignItems: 'center', zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white', borderRadius: '8px', padding: '28px',
    maxWidth: '700px', width: '92%', maxHeight: '85vh', overflowY: 'auto', position: 'relative',
  },
  closeButton: {
    position: 'absolute', top: '10px', right: '14px',
    backgroundColor: 'transparent', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#666',
  },
  priorityBanner: {
    padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px',
  },
  modalTitle: { margin: '0 0 4px 0', fontSize: '22px', fontWeight: 'bold', color: '#333' },
  modalDescription: { margin: '0 0 20px 0', fontSize: '14px', color: '#555', lineHeight: '1.5' },
  modalContent: { marginBottom: '16px' },
  mapSection: { marginBottom: '16px' },
  sectionLabel: { margin: '0 0 6px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' },
  mapLink: { display: 'inline-block', marginTop: '4px', fontSize: '12px', color: '#2196f3', textDecoration: 'none' },
  photo: { width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #eee' },
  noPhotos: {
    padding: '20px', backgroundColor: '#fafafa', borderRadius: '6px',
    border: '1px dashed #ddd', textAlign: 'center', marginBottom: '16px',
  },
  details: { fontSize: '14px' },
  detailRow: { display: 'flex', padding: '7px 0', borderBottom: '1px solid #f0f0f0', gap: '12px' },
  detailLabel: { fontWeight: '600', color: '#666', minWidth: '100px', flexShrink: 0, fontSize: '13px' },
  dispatchToggle: {
    padding: '12px', backgroundColor: '#f0f7f0', borderRadius: '6px',
    border: '1px solid #c8e6c9', marginBottom: '14px',
  },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: '#1a472a', cursor: 'pointer' },
  checkbox: { width: '18px', height: '18px', cursor: 'pointer' },
  toggleHint: { display: 'block', fontSize: '12px', color: '#666', marginTop: '4px', marginLeft: '26px' },
  dispatchResultBox: {
    padding: '10px 14px', backgroundColor: '#e8f5e9', borderRadius: '4px',
    border: '1px solid #a5d6a7', fontSize: '13px', color: '#2e7d32', marginBottom: '14px',
  },
  modalActions: { display: 'flex', gap: '10px', justifyContent: 'flex-end' },
  actionBtn: { padding: '10px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' },
  primaryBtn: { backgroundColor: '#388e3c', color: 'white' },
  dangerBtn: { backgroundColor: '#d32f2f', color: 'white' },
  loading: { textAlign: 'center', fontSize: '16px', color: '#666', padding: '40px' },
  emptyState: { textAlign: 'center', padding: '40px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', color: '#666' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '14px' },
  paginationButton: { padding: '7px 14px', backgroundColor: '#1a472a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  pageInfo: { fontSize: '13px', color: '#666', minWidth: '160px', textAlign: 'center' },
};

export default ReportsPage;
