import React, { useEffect, useState } from 'react';
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
}

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
  const itemsPerPage = 10;

  useEffect(() => {
    fetchUserProfile();
    fetchReports();
  }, []);

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

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data as Report[]);
    } catch (err) {
      console.error('Error fetching reports:', err);
    } finally {
      setLoading(false);
    }
  };

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
          pickupLat: 0, // Will use address-based lookup in production
          pickupLng: 0,
          dropoffAddress: selectedReport.address || '',
          dropoffLat: 0,
          dropoffLng: 0,
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
    if (sourceFilter && (r as any).source !== sourceFilter) return false;
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
      (r as any).source || 'canopy_app',
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

  return (
    <div style={styles.container}>
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
          <button onClick={exportToCSV} style={styles.exportButton}>
            Export to CSV
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
                  }}
                >
                  <td style={styles.td}>{new Date(report.created_at).toLocaleDateString()}</td>
                  <td style={styles.td}>{report.category}</td>
                  <td style={styles.td}>{report.address}</td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.sourceBadge,
                      ...((report as any).source === '311_nyc'
                        ? { backgroundColor: '#e3f2fd', color: '#0d47a1' }
                        : { backgroundColor: '#e8f5e9', color: '#2e7d32' }),
                    }}>
                      {(report as any).source === '311_nyc' ? 'NYC 311' : 'Canopy'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...getStatusBadgeColor(report.status) }}>
                      {report.status}
                    </span>
                  </td>
                  <td style={styles.td}>${report.bounty_amount}</td>
                  <td style={styles.td}>
                    <button onClick={() => {}} style={styles.actionButton}>
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
              style={styles.paginationButton}
            >
              Previous
            </button>
            <span style={styles.pageInfo}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              style={styles.paginationButton}
            >
              Next
            </button>
          </div>
        </div>
        </>
      )}

      {showModal && selectedReport && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.closeButton} onClick={() => setShowModal(false)}>
              ×
            </button>
            <h2 style={styles.modalTitle}>Report Details</h2>

            <div style={styles.modalContent}>
              <div style={styles.photoSection}>
                {selectedReport.reporter_photo_url && (
                  <div style={styles.photoBox}>
                    <p style={styles.photoLabel}>Reporter</p>
                    <img
                      src={selectedReport.reporter_photo_url}
                      alt="Reporter"
                      style={styles.photo}
                    />
                  </div>
                )}
                {selectedReport.verifier_photo_url && selectedReport.status === 'verified' && (
                  <div style={styles.photoBox}>
                    <p style={styles.photoLabel}>Verifier</p>
                    <img
                      src={selectedReport.verifier_photo_url}
                      alt="Verifier"
                      style={styles.photo}
                    />
                  </div>
                )}
              </div>

              <div style={styles.details}>
                <p>
                  <strong>Category:</strong> {selectedReport.category}
                </p>
                <p>
                  <strong>Address:</strong> {selectedReport.address}
                </p>
                <p>
                  <strong>Status:</strong> {selectedReport.status}
                </p>
                <p>
                  <strong>Bounty:</strong> ${selectedReport.bounty_amount}
                </p>
                <p>
                  <strong>Submitted:</strong> {new Date(selectedReport.created_at).toLocaleString()}
                </p>
                {selectedReport.verified_at && (
                  <p>
                    <strong>Verified:</strong> {new Date(selectedReport.verified_at).toLocaleString()}
                  </p>
                )}
                <p>
                  <strong>Notes:</strong> {selectedReport.notes}
                </p>
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
                  style={{...styles.actionBtn, ...styles.primaryBtn, ...(dispatchLoading ? {opacity: 0.6} : {})}}
                >
                  {dispatchLoading ? 'Dispatching...' : dispatchEnabled ? 'Create & Dispatch' : 'Create Work Order'}
                </button>
              )}
              {selectedReport.status !== 'rejected' && (
                <button
                  onClick={() => handleRejectReport(selectedReport.id)}
                  style={{...styles.actionBtn, ...styles.dangerBtn}}
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
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
    padding: '10px 12px',
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
  exportButton: {
    padding: '10px 16px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  tableWrapper: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    overflow: 'x',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  headerRow: {
    backgroundColor: '#f5f5f5',
    borderBottom: '2px solid #ddd',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#333',
    fontSize: '14px',
  },
  row: {
    borderBottom: '1px solid #ddd',
    cursor: 'pointer',
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
  modalOverlay: {
    position: 'fixed',
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
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
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
  photoSection: {
    display: 'flex',
    gap: '20px',
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
    objectFit: 'cover',
    borderRadius: '4px',
  },
  details: {
    fontSize: '14px',
    lineHeight: '1.6',
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
  loading: {
    textAlign: 'center',
    fontSize: '16px',
    color: '#666',
  },
  emptyState: {
    textAlign: 'center',
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
    marginTop: '20px',
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
    textAlign: 'center',
  },
};

export default ReportsPage;
