import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
import { dispatchJob } from '../lib/dispatch';

/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */
interface Report {
  id: string;
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
  priority_score?: number;
  priority_label?: string;
}

interface AnalyticsData {
  todayCount: number;
  yesterdayCount: number;
  weeklyCount: number;
  totalCount: number;
  byStatus: Record<string, number>;
  categoryBreakdown: { name: string; count: number }[];
}

interface ClusterGroup {
  id: string;
  category: string;
  address: string;
  reports: Report[];
  maxScore: number;
  expanded: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   Priority Engine
   ═══════════════════════════════════════════════════════════════════ */
const CATEGORY_SEVERITY: Record<string, number> = {
  'Power Line Hazard': 40,
  'Storm Damage': 30,
  'Pothole': 20,
  'Downed Branch': 18,
  'Street Light Out': 15,
  'Other': 10,
};

const CATEGORY_IMAGES: Record<string, string> = {
  'Pothole': 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&h=300&fit=crop',
  'Street Light Out': 'https://images.unsplash.com/photo-1542332213-31f87348057f?w=600&h=300&fit=crop',
  'Storm Damage': 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=600&h=300&fit=crop',
  'Downed Branch': 'https://images.unsplash.com/photo-1508193638397-1c4234db14d8?w=600&h=300&fit=crop',
  'Power Line Hazard': 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600&h=300&fit=crop',
  'Other': 'https://images.unsplash.com/photo-1517732306149-e8f829eb588a?w=600&h=300&fit=crop',
};

function computePriorityScore(report: Report, allReports: Report[]): number {
  let score = 0;
  const cat = report.categories?.name || 'Other';

  // 1. Category severity (0–40)
  score += CATEGORY_SEVERITY[cat] ?? 10;

  // 2. Age — older unresolved = more urgent (0–25)
  const ageH = (Date.now() - new Date(report.created_at).getTime()) / 3600000;
  if (ageH > 168) score += 25;
  else if (ageH > 72) score += 18;
  else if (ageH > 24) score += 12;
  else if (ageH > 6) score += 6;
  else score += 2;

  // 3. Cluster density — nearby reports = real problem (0–25)
  if (report.latitude && report.longitude) {
    const near = allReports.filter((r) => {
      if (r.id === report.id || !r.latitude || !r.longitude) return false;
      return haversineKm(report.latitude!, report.longitude!, r.latitude!, r.longitude!) < 0.3;
    }).length;
    if (near >= 5) score += 25;
    else if (near >= 3) score += 18;
    else if (near >= 1) score += 8;
  }

  // 4. Source (0–10)
  score += report.source === 'canopy_app' ? 10 : 3;

  return Math.min(score, 100);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPriorityLabel(score: number): string {
  if (score >= 70) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Medium';
  return 'Low';
}

function getPriorityColor(label: string) {
  switch (label) {
    case 'Critical': return { bg: '#dc3545', text: '#fff' };
    case 'High': return { bg: '#fd7e14', text: '#fff' };
    case 'Medium': return { bg: '#ffc107', text: '#333' };
    default: return { bg: '#e9ecef', text: '#555' };
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Clustering
   ═══════════════════════════════════════════════════════════════════ */
function clusterReports(data: Report[]): (Report | ClusterGroup)[] {
  const clustered: (Report | ClusterGroup)[] = [];
  const processed = new Set<string>();

  const sortedData = [...data].sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));

  for (const report of sortedData) {
    if (processed.has(report.id)) continue;
    if (!report.latitude || !report.longitude) {
      clustered.push(report);
      processed.add(report.id);
      continue;
    }

    const category = report.categories?.name || 'Other';
    const nearbyReports = [report];
    processed.add(report.id);

    for (const other of sortedData) {
      if (processed.has(other.id) || !other.latitude || !other.longitude) continue;
      if ((other.categories?.name || 'Other') !== category) continue;
      if (haversineKm(report.latitude, report.longitude, other.latitude, other.longitude) < 0.3) {
        nearbyReports.push(other);
        processed.add(other.id);
      }
    }

    if (nearbyReports.length > 1) {
      const maxScore = Math.max(...nearbyReports.map((r) => r.priority_score ?? 0));
      clustered.push({
        id: `cluster_${report.id}`,
        category,
        address: report.address,
        reports: nearbyReports,
        maxScore,
        expanded: false,
      } as ClusterGroup);
    } else {
      clustered.push(report);
    }
  }

  return clustered;
}

function isClusterGroup(item: unknown): item is ClusterGroup {
  return typeof item === 'object' && item !== null && 'reports' in item && Array.isArray((item as ClusterGroup).reports);
}

/* ═══════════════════════════════════════════════════════════════════
   Status Pipeline
   ═══════════════════════════════════════════════════════════════════ */
const STATUS_PIPELINE = [
  { key: 'submitted', label: 'Submitted', color: '#ffc107', icon: '📋' },
  { key: 'verification_in_progress', label: 'Verifying', color: '#fd7e14', icon: '🔍' },
  { key: 'verified', label: 'Verified', color: '#17a2b8', icon: '✓' },
  { key: 'dispatched', label: 'Dispatched', color: '#6f42c1', icon: '🚗' },
  { key: 'work_order_created', label: 'Work Order', color: '#007bff', icon: '🔧' },
  { key: 'resolved', label: 'Resolved', color: '#28a745', icon: '✅' },
];

const REJECTED_STATUS = { key: 'rejected', label: 'Rejected', color: '#dc3545', icon: '✕' };

/* ═══════════════════════════════════════════════════════════════════
   Column Sorting
   ═══════════════════════════════════════════════════════════════════ */
type SortKey = 'priority' | 'date' | 'category' | 'description' | 'address' | 'source' | 'status';
type SortDir = 'asc' | 'desc';

function sortReports(data: Report[], key: SortKey, dir: SortDir): Report[] {
  const sorted = [...data];
  const m = dir === 'asc' ? 1 : -1;
  sorted.sort((a, b) => {
    switch (key) {
      case 'priority': return m * ((a.priority_score ?? 0) - (b.priority_score ?? 0));
      case 'date': return m * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'category': return m * (a.categories?.name || '').localeCompare(b.categories?.name || '');
      case 'description': return m * (a.description || '').localeCompare(b.description || '');
      case 'address': return m * (a.address || '').localeCompare(b.address || '');
      case 'source': return m * (a.source || '').localeCompare(b.source || '');
      case 'status': return m * (a.status || '').localeCompare(b.status || '');
      default: return 0;
    }
  });
  return sorted;
}

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50] as const;

/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */
const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [userUtilityCompany, setUserUtilityCompany] = useState<string | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    todayCount: 0, yesterdayCount: 0, weeklyCount: 0, totalCount: 0,
    byStatus: {}, categoryBreakdown: [],
  });
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [uploadingReportId, setUploadingReportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchUserProfile();
    fetchReports();
    autoRef.current = setInterval(() => fetchReports(true), AUTO_REFRESH_MS);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, []);

  useEffect(() => { calcAnalytics(reports); }, [reports]);

  /* ── Score all reports ── */
  const scored = useMemo(() =>
    reports.map((r) => {
      const s = computePriorityScore(r, reports);
      return { ...r, priority_score: s, priority_label: getPriorityLabel(s) };
    }), [reports]);

  /* ── Filter ── */
  const filtered = useMemo(() =>
    scored.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (sourceFilter && r.source !== sourceFilter) return false;
      if (categoryFilter && r.categories?.name !== categoryFilter) return false;
      return true;
    }), [scored, statusFilter, sourceFilter, categoryFilter]);

  /* ── Sort ── */
  const sorted = useMemo(() => sortReports(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  /* ── Cluster ── */
  const clustered = useMemo(() => clusterReports(sorted), [sorted]);

  const totalPages = Math.ceil(clustered.length / itemsPerPage);
  const page = clustered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  /* ── Analytics ── */
  const calcAnalytics = (data: Report[]) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1);
    const wStart = new Date(todayStart); wStart.setDate(wStart.getDate() - 7);

    const byStatus: Record<string, number> = {};
    data.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });

    const catCounts: Record<string, number> = {};
    data.forEach((r) => { const n = r.categories?.name || 'Unknown'; catCounts[n] = (catCounts[n] || 0) + 1; });

    setAnalytics({
      todayCount: data.filter((r) => new Date(r.created_at) >= todayStart).length,
      yesterdayCount: data.filter((r) => { const d = new Date(r.created_at); return d >= yStart && d < todayStart; }).length,
      weeklyCount: data.filter((r) => new Date(r.created_at) >= wStart).length,
      totalCount: data.length,
      byStatus,
      categoryBreakdown: Object.entries(catCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    });
  };

  /* ── Data ── */
  const fetchUserProfile = async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s?.session?.user?.id) return;
      const { data: p } = await supabase.from('users').select('*').eq('id', s.session.user.id).single();
      if (p?.utility_company) setUserUtilityCompany(p.utility_company);
    } catch (e) { console.error(e); }
  };

  const fetchReports = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from('reports').select('*, categories(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReports(data as Report[]);
      setLastRefreshed(new Date());
    } catch (e) { console.error(e); }
    finally { if (!silent) setLoading(false); }
  };

  const handleManualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('https://wowyavzbcmegwqnmulff.supabase.co/functions/v1/ingest-311-nyc', { method: 'POST' });
      await fetchReports(true);
    } catch (e) { console.error(e); }
    finally { setRefreshing(false); }
  }, []);

  /* ── Actions ── */
  const handleEscalateToVerification = async (reportId: string) => {
    try {
      setDispatchLoading(true);
      setDispatchResult(null);

      await supabase.from('reports').update({ status: 'verification_in_progress' }).eq('id', reportId);

      if (selectedReport) {
        const res = await dispatchJob({
          jobType: 'verify',
          reportId,
          pickupAddress: selectedReport.address || '',
          pickupLat: selectedReport.latitude || 0,
          pickupLng: selectedReport.longitude || 0,
          dropoffAddress: selectedReport.address || '',
          dropoffLat: selectedReport.latitude || 0,
          dropoffLng: selectedReport.longitude || 0,
          taskDescription: `Verify ${selectedReport.categories?.name || 'issue'} at ${selectedReport.address}`,
          payoutAmount: 7,
        });
        setDispatchResult(res.success
          ? `Gig worker dispatched! Delivery ID: ${res.deliveryId}`
          : `Escalated to verification. Dispatch failed: ${res.error}`);
      }

      fetchReports();
    } catch (e) { console.error(e); }
    finally { setDispatchLoading(false); }
  };

  const handleUploadProofAndVerify = async (reportId: string) => {
    setUploadingReportId(reportId);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadingReportId || !e.target.files?.[0]) return;

    try {
      setDispatchLoading(true);
      const file = e.target.files[0];
      const fileName = `${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('reports')
        .upload(`photos/${fileName}`, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('reports')
        .getPublicUrl(`photos/${fileName}`);

      await supabase.from('reports').update({
        status: 'verified',
        photo_url: publicUrl,
      }).eq('id', uploadingReportId);

      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id;
      if (uid) {
        await supabase.from('work_orders').insert({
          report_id: uploadingReportId,
          errand_id: null,
          created_by: uid,
          status: 'open',
          utility_company: userUtilityCompany,
          estimated_resolution_date: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
      }

      setDispatchResult('Photo uploaded and report verified! Work order created.');
      fetchReports();
    } catch (e) {
      console.error(e);
      setDispatchResult('Failed to upload photo and verify.');
    } finally {
      setDispatchLoading(false);
      setUploadingReportId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReject = async (id: string) => {
    try {
      await supabase.from('reports').update({ status: 'rejected' }).eq('id', id);
      fetchReports();
      setShowModal(false);
    } catch (e) { console.error(e); }
  };

  /* ── Helpers ── */
  const exportCSV = () => {
    const h = ['Date', 'Category', 'Description', 'Address', 'Source', 'Status', 'Priority Score', 'Priority'];
    const rows = filtered.map((r) => [
      new Date(r.created_at).toLocaleDateString(), r.categories?.name || '', r.description,
      r.address, r.source || 'canopy_app', r.status, String(r.priority_score ?? ''), r.priority_label || '',
    ]);
    const csv = [h.join(','), ...rows.map((r) => r.map((c) => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const b = new Blob([csv], { type: 'text/csv' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = 'canopy-reports.csv'; a.click();
    URL.revokeObjectURL(u);
  };

  const timeAgo = (d: Date) => {
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
  };

  const trunc = (t: string, n: number) => t && t.length > n ? t.slice(0, n) + '...' : t || '—';

  const handleColumnSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir(key === 'priority' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const toggleClusterExpanded = (clusterId: string) => {
    const newExpanded = new Set(expandedClusters);
    if (newExpanded.has(clusterId)) {
      newExpanded.delete(clusterId);
    } else {
      newExpanded.add(clusterId);
    }
    setExpandedClusters(newExpanded);
  };

  const getPageInfo = () => {
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, clustered.length);
    return { start, end, total: filtered.length };
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPages = 7;
    if (totalPages <= maxPages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      const start = Math.max(2, currentPage - 2);
      const end = Math.min(totalPages - 1, currentPage + 2);
      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={S.container}>

      {/* ── Workflow Pipeline ── */}
      <div style={S.pipelineWrap}>
        <div style={S.pipelineRow}>
          {STATUS_PIPELINE.map((step, i) => {
            const count = analytics.byStatus[step.key] || 0;
            return (
              <React.Fragment key={step.key}>
                {i > 0 && <div style={S.pipelineArrow}>→</div>}
                <div
                  style={{
                    ...S.pipelineStep,
                    borderBottom: `3px solid ${step.color}` as const,
                    backgroundColor: statusFilter === step.key ? step.color + '18' : '#fff',
                    cursor: 'pointer',
                  }}
                  onClick={() => { setStatusFilter(statusFilter === step.key ? '' : step.key); setCurrentPage(1); }}
                >
                  <div style={{ fontSize: '20px' }}>{step.icon}</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: step.color }}>{count}</div>
                  <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {step.label}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {/* Rejected (off the main flow) */}
          <div style={{ marginLeft: '16px', borderLeft: '2px solid #eee', paddingLeft: '16px' }}>
            <div
              style={{
                ...S.pipelineStep,
                borderBottom: `3px solid ${REJECTED_STATUS.color}` as const,
                backgroundColor: statusFilter === 'rejected' ? REJECTED_STATUS.color + '18' : '#fff',
                cursor: 'pointer',
              }}
              onClick={() => { setStatusFilter(statusFilter === 'rejected' ? '' : 'rejected'); setCurrentPage(1); }}
            >
              <div style={{ fontSize: '20px' }}>{REJECTED_STATUS.icon}</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: REJECTED_STATUS.color }}>
                {analytics.byStatus['rejected'] || 0}
              </div>
              <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Rejected
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Analytics Row ── */}
      <div style={S.statsRow}>
        <div style={S.statBox}>
          <span style={S.statNum}>{analytics.todayCount}</span>
          <span style={S.statLbl}>Today</span>
        </div>
        <div style={S.statBox}>
          <span style={S.statNum}>{analytics.yesterdayCount}</span>
          <span style={S.statLbl}>Yesterday</span>
        </div>
        <div style={S.statBox}>
          <span style={S.statNum}>{analytics.weeklyCount}</span>
          <span style={S.statLbl}>This Week</span>
        </div>
        <div style={S.statBox}>
          <span style={{ ...S.statNum, color: '#1a472a' }}>{analytics.totalCount}</span>
          <span style={S.statLbl}>Total</span>
        </div>
      </div>

      {/* ── Category Chips ── */}
      <div style={S.chipRow}>
        <span
          onClick={() => { setCategoryFilter(''); setCurrentPage(1); }}
          style={{ ...S.catChip, ...(categoryFilter === '' ? S.catChipActive : {}) }}
        >All Categories</span>
        {analytics.categoryBreakdown.map((c) => (
          <span key={c.name}
            onClick={() => { setCategoryFilter(categoryFilter === c.name ? '' : c.name); setCurrentPage(1); }}
            style={{ ...S.catChip, ...(categoryFilter === c.name ? S.catChipActive : {}) }}>
            {c.name} ({c.count})
          </span>
        ))}
      </div>

      {/* ── Header ── */}
      <div style={S.header}>
        <h1 style={S.title}>Reports</h1>
        <div style={S.headerActions}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[{ l: 'All', v: '' }, { l: 'Canopy', v: 'canopy_app' }, { l: 'NYC 311', v: '311_nyc' }].map((c) => (
              <button key={c.v} onClick={() => { setSourceFilter(c.v); setCurrentPage(1); }}
                style={{ ...S.srcChip, ...(sourceFilter === c.v ? S.srcChipActive : {}) }}>{c.l}</button>
            ))}
          </div>
          <button onClick={handleManualRefresh} disabled={refreshing}
            style={{ ...S.refreshBtn, opacity: refreshing ? 0.6 : 1 }}>
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <span style={S.updatedTxt}>Updated {timeAgo(lastRefreshed)}</span>
          <button onClick={exportCSV} style={S.exportBtn}>Export CSV</button>
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={S.loading}>Loading reports...</div>
      ) : page.length === 0 ? (
        <div style={S.empty}>No reports found</div>
      ) : (
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr style={S.thr}>
                <Th k="priority" cur={sortKey} dir={sortDir} onClick={handleColumnSort}>Priority</Th>
                <Th k="date" cur={sortKey} dir={sortDir} onClick={handleColumnSort}>Date</Th>
                <Th k="category" cur={sortKey} dir={sortDir} onClick={handleColumnSort}>Category</Th>
                <Th k="description" cur={sortKey} dir={sortDir} onClick={handleColumnSort} wide>Description</Th>
                <Th k="address" cur={sortKey} dir={sortDir} onClick={handleColumnSort}>Address</Th>
                <Th k="source" cur={sortKey} dir={sortDir} onClick={handleColumnSort}>Source</Th>
                <Th k="status" cur={sortKey} dir={sortDir} onClick={handleColumnSort}>Status</Th>
              </tr>
            </thead>
            <tbody>
              {page.map((item) => {
                if (isClusterGroup(item)) {
                  const expanded = expandedClusters.has(item.id);
                  return (
                    <React.Fragment key={item.id}>
                      <tr style={{ ...S.tr, backgroundColor: '#f9f9f9', fontWeight: '600' }}>
                        <td colSpan={7} style={{ ...S.td, cursor: 'pointer', padding: '12px' }}
                          onClick={() => toggleClusterExpanded(item.id)}>
                          <span style={{ marginRight: '8px' }}>{expanded ? '▼' : '▶'}</span>
                          <span>📍 {item.category} cluster — {item.reports.length} reports near {trunc(item.address, 35)}</span>
                        </td>
                      </tr>
                      {expanded && item.reports.map((r) => {
                        const pc = getPriorityColor(r.priority_label || 'Low');
                        return (
                          <tr key={r.id} style={{ ...S.tr, backgroundColor: '#fafafa' }}
                            onClick={() => { setSelectedReport(r); setShowModal(true); setDispatchResult(null); }}>
                            <td style={S.td}>
                              <span style={{
                                display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                                fontWeight: '700', backgroundColor: pc.bg, color: pc.text, minWidth: '56px', textAlign: 'center' as const,
                              }}>
                                {r.priority_score}
                              </span>
                            </td>
                            <td style={S.td}>{new Date(r.created_at).toLocaleDateString()}</td>
                            <td style={{ ...S.td, fontWeight: '600' }}>{r.categories?.name || '—'}</td>
                            <td style={{ ...S.td, color: '#555', fontSize: '12px', maxWidth: '240px' }}>
                              {trunc(r.description, 55)}
                            </td>
                            <td style={S.td}>{trunc(r.address, 30)}</td>
                            <td style={S.td}>
                              <span style={{
                                padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                                ...(r.source === '311_nyc'
                                  ? { backgroundColor: '#e3f2fd', color: '#0d47a1' }
                                  : { backgroundColor: '#e8f5e9', color: '#2e7d32' }),
                              }}>
                                {r.source === '311_nyc' ? 'NYC 311' : 'Canopy'}
                              </span>
                            </td>
                            <td style={S.td}>
                              <span style={{
                                padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                                ...getStatusColor(r.status),
                              }}>{r.status.replace('_', ' ')}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                }

                const r = item as Report;
                const pc = getPriorityColor(r.priority_label || 'Low');
                return (
                  <tr key={r.id} style={S.tr}
                    onClick={() => { setSelectedReport(r); setShowModal(true); setDispatchResult(null); }}>
                    <td style={S.td}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11px',
                        fontWeight: '700', backgroundColor: pc.bg, color: pc.text, minWidth: '56px', textAlign: 'center' as const,
                      }}>
                        {r.priority_score}
                      </span>
                    </td>
                    <td style={S.td}>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td style={{ ...S.td, fontWeight: '600' }}>{r.categories?.name || '—'}</td>
                    <td style={{ ...S.td, color: '#555', fontSize: '12px', maxWidth: '240px' }}>
                      {trunc(r.description, 55)}
                    </td>
                    <td style={S.td}>{trunc(r.address, 30)}</td>
                    <td style={S.td}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                        ...(r.source === '311_nyc'
                          ? { backgroundColor: '#e3f2fd', color: '#0d47a1' }
                          : { backgroundColor: '#e8f5e9', color: '#2e7d32' }),
                      }}>
                        {r.source === '311_nyc' ? 'NYC 311' : 'Canopy'}
                      </span>
                    </td>
                    <td style={S.td}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        ...getStatusColor(r.status),
                      }}>{r.status.replace('_', ' ')}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Pagination Controls ── */}
          <div style={S.paginationControls}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>Items per page:</span>
              {[...ITEMS_PER_PAGE_OPTIONS, 'All'].map((option) => (
                <button key={option}
                  onClick={() => {
                    if (option === 'All') {
                      setItemsPerPage(filtered.length);
                    } else {
                      setItemsPerPage(option as number);
                    }
                    setCurrentPage(1);
                  }}
                  style={{
                    ...S.pagNumBtn,
                    ...(itemsPerPage === (option === 'All' ? filtered.length : option) ? S.pagNumBtnActive : {}),
                  }}>
                  {option}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
                style={{ ...S.pagBtn, opacity: currentPage === 1 ? 0.4 : 1 }}>First</button>

              {getPageNumbers().map((num, idx) => (
                <button key={idx}
                  onClick={() => typeof num === 'number' && setCurrentPage(num)}
                  disabled={num === '...'}
                  style={{
                    ...S.pagBtn,
                    ...(currentPage === num ? S.pagBtnActive : {}),
                    opacity: num === '...' ? 0 : currentPage === num ? 1 : 0.6,
                    cursor: num === '...' ? 'default' : 'pointer',
                  }}>
                  {num}
                </button>
              ))}

              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
                style={{ ...S.pagBtn, opacity: currentPage === totalPages ? 0.4 : 1 }}>Last</button>
            </div>
          </div>

          <div style={S.pag}>
            <span style={S.pagInfo}>
              Showing {getPageInfo().start}-{getPageInfo().end} of {getPageInfo().total} reports
            </span>
          </div>
        </div>
      )}

      {/* ═══ Detail Modal ═══ */}
      {showModal && selectedReport && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <button style={S.closeBtn} onClick={() => setShowModal(false)}>×</button>

            {/* Priority Banner */}
            {selectedReport.status === 'submitted' && selectedReport.priority_label && (() => {
              const pc = getPriorityColor(selectedReport.priority_label);
              return (
                <div style={{
                  padding: '10px 14px', borderRadius: '6px', marginBottom: '16px',
                  backgroundColor: pc.bg + '20', borderLeft: `4px solid ${pc.bg}`, color: pc.bg === '#e9ecef' ? '#555' : pc.bg,
                }}>
                  <strong>{selectedReport.priority_label} Priority</strong>
                  <span style={{ marginLeft: '8px', fontWeight: 'normal', color: '#555' }}>
                    Score: {selectedReport.priority_score}/100
                    {selectedReport.priority_label === 'Critical' && ' — Recommend immediate verification'}
                    {selectedReport.priority_label === 'High' && ' — Should be verified soon'}
                  </span>
                </div>
              );
            })()}

            {/* Title */}
            <h2 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 'bold', color: '#333' }}>
              {selectedReport.categories?.name || 'Report Details'}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#555', lineHeight: 1.5 }}>
              {selectedReport.description}
            </p>

            {/* Status Pipeline in Modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {STATUS_PIPELINE.map((step, i) => {
                const isActive = step.key === selectedReport.status;
                const isPast = STATUS_PIPELINE.findIndex((s) => s.key === selectedReport.status) > i;
                return (
                  <React.Fragment key={step.key}>
                    {i > 0 && <span style={{ color: '#ccc', fontSize: '14px' }}>→</span>}
                    <span style={{
                      padding: '4px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: '600',
                      backgroundColor: isActive ? step.color : isPast ? step.color + '30' : '#f5f5f5',
                      color: isActive ? '#fff' : isPast ? step.color : '#aaa',
                      border: isActive ? 'none' : '1px solid #e0e0e0',
                    }}>
                      {step.icon} {step.label}
                    </span>
                  </React.Fragment>
                );
              })}
              {selectedReport.status === 'rejected' && (
                <span style={{ padding: '4px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: '600', backgroundColor: '#dc3545', color: '#fff', marginLeft: '8px' }}>
                  ✕ Rejected
                </span>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              {/* Map */}
              {selectedReport.latitude && selectedReport.longitude && (
                <div style={{ marginBottom: '16px' }}>
                  <p style={S.secLabel}>Location</p>
                  <iframe title="Location" width="100%" height="240"
                    style={{ border: 'none', borderRadius: '6px' }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedReport.longitude - 0.005},${selectedReport.latitude - 0.003},${selectedReport.longitude + 0.005},${selectedReport.latitude + 0.003}&layer=mapnik&marker=${selectedReport.latitude},${selectedReport.longitude}`}
                  />
                  <a href={`https://www.openstreetmap.org/?mlat=${selectedReport.latitude}&mlon=${selectedReport.longitude}#map=17/${selectedReport.latitude}/${selectedReport.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '12px', color: '#2196f3', textDecoration: 'none', marginTop: '4px', display: 'inline-block' }}>
                    Open full map
                  </a>
                </div>
              )}

              {/* Photo / Placeholder */}
              {selectedReport.photo_url ? (
                <div style={{ marginBottom: '16px' }}>
                  <p style={S.secLabel}>Photo</p>
                  <img src={selectedReport.photo_url} alt="Report" style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', borderRadius: '6px' }} />
                </div>
              ) : (
                <div style={{ marginBottom: '16px', position: 'relative' }}>
                  <img
                    src={CATEGORY_IMAGES[selectedReport.categories?.name || 'Other']}
                    alt="Stock image"
                    style={{
                      width: '100%',
                      maxHeight: '260px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                  }}>
                    Stock image — {selectedReport.categories?.name || 'Other'}
                  </div>
                </div>
              )}

              {/* Detail Rows */}
              <div style={{ fontSize: '14px' }}>
                {[
                  ['Category', selectedReport.categories?.name || '—'],
                  ['Address', selectedReport.address],
                  ['Source', selectedReport.source === '311_nyc' ? 'NYC 311' : 'Canopy App'],
                  ['Status', selectedReport.status.replace('_', ' ')],
                  ['Priority', `${selectedReport.priority_label} (${selectedReport.priority_score}/100)`],
                  ['Submitted', new Date(selectedReport.created_at).toLocaleString()],
                  ...(selectedReport.latitude && selectedReport.longitude
                    ? [['Coordinates', `${selectedReport.latitude.toFixed(5)}, ${selectedReport.longitude.toFixed(5)}`]]
                    : []),
                  ...(selectedReport.external_id ? [['External ID', selectedReport.external_id]] : []),
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontWeight: '600', color: '#666', minWidth: '100px', flexShrink: 0, fontSize: '13px' }}>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Awaiting Verification Message */}
            {selectedReport.status === 'verification_in_progress' && (
              <div style={{ padding: '12px', backgroundColor: '#fff3cd', borderRadius: '6px', border: '1px solid #ffc107', marginBottom: '14px', color: '#856404' }}>
                ⏳ Awaiting gig worker verification...
              </div>
            )}

            {dispatchResult && (
              <div style={{ padding: '10px 14px', backgroundColor: '#e8f5e9', borderRadius: '4px', border: '1px solid #a5d6a7', fontSize: '13px', color: '#2e7d32', marginBottom: '14px' }}>
                {dispatchResult}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              {selectedReport.status === 'submitted' && (
                <>
                  <button onClick={() => handleEscalateToVerification(selectedReport.id)} disabled={dispatchLoading}
                    style={{ padding: '10px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', backgroundColor: '#388e3c', color: '#fff', opacity: dispatchLoading ? 0.6 : 1 }}>
                    {dispatchLoading ? 'Processing...' : 'Escalate to Verification'}
                  </button>
                  <button onClick={() => handleUploadProofAndVerify(selectedReport.id)} disabled={dispatchLoading}
                    style={{ padding: '10px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', backgroundColor: '#2196f3', color: '#fff', opacity: dispatchLoading ? 0.6 : 1 }}>
                    {dispatchLoading ? 'Processing...' : 'Upload Proof & Verify'}
                  </button>
                  <button onClick={() => handleReject(selectedReport.id)}
                    style={{ padding: '10px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', backgroundColor: '#d32f2f', color: '#fff' }}>
                    Reject
                  </button>
                </>
              )}
              {selectedReport.status === 'verification_in_progress' && (
                <button onClick={() => handleReject(selectedReport.id)}
                  style={{ padding: '10px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', backgroundColor: '#d32f2f', color: '#fff' }}>
                  Reject
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   Sortable Table Header
   ═══════════════════════════════════════════════════════════════════ */
const Th: React.FC<{
  k: SortKey; cur: SortKey; dir: SortDir; wide?: boolean;
  onClick: (k: SortKey) => void; children: React.ReactNode;
}> = ({ k, cur, dir, wide, onClick, children }) => (
  <th
    onClick={() => onClick(k)}
    style={{
      padding: '10px 12px', textAlign: 'left' as const, fontWeight: '600', color: cur === k ? '#1a472a' : '#444',
      fontSize: '12px', cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const,
      ...(wide ? { minWidth: '200px' } : {}),
      backgroundColor: cur === k ? '#eef5ee' : 'transparent',
    }}
  >
    {children}{cur === k ? (dir === 'desc' ? ' ▼' : ' ▲') : ''}
  </th>
);

/* ═══════════════════════════════════════════════════════════════════
   Status Colors
   ═══════════════════════════════════════════════════════════════════ */
function getStatusColor(status: string): { backgroundColor: string; color: string } {
  const m: Record<string, { backgroundColor: string; color: string }> = {
    submitted: { backgroundColor: '#fff3cd', color: '#856404' },
    verification_in_progress: { backgroundColor: '#ffe0cc', color: '#e65100' },
    verified: { backgroundColor: '#d1ecf1', color: '#0c5460' },
    dispatched: { backgroundColor: '#e8daef', color: '#6c3483' },
    work_order_created: { backgroundColor: '#d6eaf8', color: '#1a5276' },
    resolved: { backgroundColor: '#d4edda', color: '#155724' },
    rejected: { backgroundColor: '#f8d7da', color: '#721c24' },
  };
  return m[status] || { backgroundColor: '#e2e3e5', color: '#383d41' };
}

/* ═══════════════════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════════════════ */
const S: Record<string, CSSProperties> = {
  container: { padding: '20px 28px' },
  // Pipeline
  pipelineWrap: { marginBottom: '16px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '16px 20px' },
  pipelineRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  pipelineStep: { textAlign: 'center' as const, padding: '10px 16px', borderRadius: '8px', minWidth: '90px', transition: 'background-color 0.15s' },
  pipelineArrow: { fontSize: '18px', color: '#ccc', fontWeight: 'bold' },
  // Stats
  statsRow: { display: 'flex', gap: '12px', marginBottom: '12px' },
  statBox: { flex: 1, backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '12px 16px', textAlign: 'center' as const },
  statNum: { display: 'block', fontSize: '22px', fontWeight: 'bold', color: '#333' },
  statLbl: { fontSize: '10px', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  // Chips
  chipRow: { display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' },
  catChip: { padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: '500', backgroundColor: '#f5f5f5', color: '#555', cursor: 'pointer', border: '1px solid #e0e0e0' },
  catChipActive: { backgroundColor: '#1a472a', color: '#fff', borderColor: '#1a472a' },
  // Header
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' },
  headerActions: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  title: { margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#333' },
  srcChip: { padding: '4px 12px', border: '1px solid #ddd', borderRadius: '14px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '500', color: '#666' },
  srcChipActive: { backgroundColor: '#1a472a', color: '#fff', borderColor: '#1a472a' },
  refreshBtn: { padding: '6px 14px', backgroundColor: '#2196f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
  updatedTxt: { fontSize: '11px', color: '#999', whiteSpace: 'nowrap' as const },
  exportBtn: { padding: '6px 14px', backgroundColor: '#1a472a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' },
  // Table
  tableWrap: { backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  thr: { backgroundColor: '#f8f8f8', borderBottom: '2px solid #e0e0e0' },
  tr: { borderBottom: '1px solid #f0f0f0', cursor: 'pointer' },
  td: { padding: '9px 12px', fontSize: '13px', color: '#333' },
  // Pagination
  paginationControls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderTop: '1px solid #f0f0f0', flexWrap: 'wrap', gap: '12px' },
  pag: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '8px 12px' },
  pagBtn: { padding: '6px 10px', backgroundColor: '#1a472a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', minWidth: '32px' },
  pagBtnActive: { backgroundColor: '#0d2418', color: '#fff' },
  pagNumBtn: { padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '500', color: '#666' },
  pagNumBtnActive: { backgroundColor: '#1a472a', color: '#fff', borderColor: '#1a472a' },
  pagInfo: { fontSize: '13px', color: '#666' },
  // Modal
  overlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modal: { backgroundColor: '#fff', borderRadius: '8px', padding: '28px', maxWidth: '720px', width: '92%', maxHeight: '88vh', overflowY: 'auto' as const, position: 'relative' as const },
  closeBtn: { position: 'absolute' as const, top: '10px', right: '14px', backgroundColor: 'transparent', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#666' },
  secLabel: { margin: '0 0 6px', fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  // Loading / empty
  loading: { textAlign: 'center' as const, fontSize: '16px', color: '#666', padding: '40px' },
  empty: { textAlign: 'center' as const, padding: '40px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', color: '#666' },
};

export default ReportsPage;
