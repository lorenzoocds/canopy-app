import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Report {
  id: string;
  category: string;
  address: string;
  status: string;
  bounty_amount: number;
  utility_company: string;
  created_at: string;
}

interface Errand {
  id: string;
  title: string;
  status: string;
  payout_amount: number;
  utility_company: string;
  created_at: string;
}

interface User {
  id: string;
  email: string;
  role: string;
  utility_company: string;
}

interface Category {
  id: string;
  name: string;
  enabled: boolean;
}

const AdminPage: React.FC = () => {
  const [tab, setTab] = useState<'reports' | 'errands' | 'users' | 'categories'>('reports');
  const [reports, setReports] = useState<Report[]>([]);
  const [errands, setErrands] = useState<Errand[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      const [
        { data: reportsData },
        { data: errandsData },
        { data: usersData },
        { data: categoriesData },
      ] = await Promise.all([
        supabase.from('reports').select('*').order('created_at', { ascending: false }),
        supabase.from('errands').select('*').order('created_at', { ascending: false }),
        supabase.auth.admin.listUsers(),
        supabase.from('categories').select('*'),
      ]);

      setReports((reportsData || []) as Report[]);
      setErrands((errandsData || []) as Errand[]);
      setUsers(
        usersData?.users?.map((u: any) => ({
          id: u.id,
          email: u.email,
          role: u.user_metadata?.role || 'unknown',
          utility_company: u.user_metadata?.utility_company || 'N/A',
        })) || []
      );
      setCategories((categoriesData || []) as Category[]);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('reports')
        .update({ status: 'verified' })
        .eq('id', reportId);

      if (error) throw error;
      fetchAllData();
    } catch (err) {
      console.error('Error approving report:', err);
    }
  };

  const handleRejectReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('reports')
        .update({ status: 'rejected' })
        .eq('id', reportId);

      if (error) throw error;
      fetchAllData();
    } catch (err) {
      console.error('Error rejecting report:', err);
    }
  };

  const handleMarkPayoutPending = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('reports')
        .update({ payout_status: 'pending' })
        .eq('id', reportId);

      if (error) throw error;
      fetchAllData();
    } catch (err) {
      console.error('Error marking payout pending:', err);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;

    try {
      const { error } = await supabase.from('categories').insert({
        name: newCategory,
        enabled: true,
      });

      if (error) throw error;
      setNewCategory('');
      fetchAllData();
    } catch (err) {
      console.error('Error adding category:', err);
    }
  };

  const handleToggleCategory = async (categoryId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('categories')
        .update({ enabled: !enabled })
        .eq('id', categoryId);

      if (error) throw error;
      fetchAllData();
    } catch (err) {
      console.error('Error toggling category:', err);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Admin Panel</h1>

      <div style={styles.tabs}>
        <button
          onClick={() => setTab('reports')}
          style={{
            ...styles.tabButton,
            ...(tab === 'reports' ? styles.activeTab : {}),
          }}
        >
          All Reports
        </button>
        <button
          onClick={() => setTab('errands')}
          style={{
            ...styles.tabButton,
            ...(tab === 'errands' ? styles.activeTab : {}),
          }}
        >
          All Errands
        </button>
        <button
          onClick={() => setTab('users')}
          style={{
            ...styles.tabButton,
            ...(tab === 'users' ? styles.activeTab : {}),
          }}
        >
          Users
        </button>
        <button
          onClick={() => setTab('categories')}
          style={{
            ...styles.tabButton,
            ...(tab === 'categories' ? styles.activeTab : {}),
          }}
        >
          Categories
        </button>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <>
          {tab === 'reports' && (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.headerRow}>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Address</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Bounty</th>
                    <th style={styles.th}>Utility</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} style={styles.row}>
                      <td style={styles.td}>{r.category}</td>
                      <td style={styles.td}>{r.address}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, ...getStatusBadgeColor(r.status) }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={styles.td}>${r.bounty_amount}</td>
                      <td style={styles.td}>{r.utility_company}</td>
                      <td style={styles.td}>
                        {r.status === 'submitted' && (
                          <>
                            <button
                              onClick={() => handleApproveReport(r.id)}
                              style={{ ...styles.actionButton, marginRight: '5px' }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectReport(r.id)}
                              style={styles.dangerButton}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {r.status === 'verified' && (
                          <button
                            onClick={() => handleMarkPayoutPending(r.id)}
                            style={styles.actionButton}
                          >
                            Mark Payout Pending
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'errands' && (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.headerRow}>
                    <th style={styles.th}>Title</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Payout</th>
                    <th style={styles.th}>Utility</th>
                    <th style={styles.th}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {errands.map((e) => (
                    <tr key={e.id} style={styles.row}>
                      <td style={styles.td}>{e.title}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.badge, ...getStatusBadgeColor(e.status) }}>
                          {e.status}
                        </span>
                      </td>
                      <td style={styles.td}>${e.payout_amount.toFixed(2)}</td>
                      <td style={styles.td}>{e.utility_company}</td>
                      <td style={styles.td}>{new Date(e.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'users' && (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.headerRow}>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Utility Company</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} style={styles.row}>
                      <td style={styles.td}>{u.email}</td>
                      <td style={styles.td}>{u.role}</td>
                      <td style={styles.td}>{u.utility_company}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'categories' && (
            <div>
              <div style={styles.categoryForm}>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name"
                  style={styles.categoryInput}
                />
                <button onClick={handleAddCategory} style={styles.addCategoryButton}>
                  Add Category
                </button>
              </div>

              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.headerRow}>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Enabled</th>
                      <th style={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id} style={styles.row}>
                        <td style={styles.td}>{c.name}</td>
                        <td style={styles.td}>{c.enabled ? 'Yes' : 'No'}</td>
                        <td style={styles.td}>
                          <button
                            onClick={() => handleToggleCategory(c.id, c.enabled)}
                            style={c.enabled ? styles.disableButton : styles.enableButton}
                          >
                            {c.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const getStatusBadgeColor = (status: string): React.CSSProperties => {
  const colors: Record<string, { backgroundColor: string; color: string }> = {
    submitted: { backgroundColor: '#fff3cd', color: '#856404' },
    verified: { backgroundColor: '#d4edda', color: '#155724' },
    rejected: { backgroundColor: '#f8d7da', color: '#721c24' },
    posted: { backgroundColor: '#e3f2fd', color: '#0d47a1' },
    in_progress: { backgroundColor: '#fff3cd', color: '#856404' },
    completed: { backgroundColor: '#d4edda', color: '#155724' },
  };
  return colors[status] || { backgroundColor: '#e2e3e5', color: '#383d41' };
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '30px',
  },
  title: {
    margin: '0 0 30px 0',
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
  },
  tabs: {
    display: 'flex',
    gap: '10px',
    marginBottom: '30px',
    borderBottom: '2px solid #ddd',
  },
  tabButton: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
    borderBottom: '3px solid transparent',
    marginBottom: '-2px',
  },
  activeTab: {
    color: '#1a472a',
    borderBottom: '3px solid #1a472a',
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
    backgroundColor: '#388e3c',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  dangerButton: {
    padding: '6px 12px',
    backgroundColor: '#d32f2f',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  enableButton: {
    padding: '6px 12px',
    backgroundColor: '#388e3c',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  disableButton: {
    padding: '6px 12px',
    backgroundColor: '#d32f2f',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  categoryForm: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  categoryInput: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  },
  addCategoryButton: {
    padding: '10px 16px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  loading: {
    textAlign: 'center',
    fontSize: '16px',
    color: '#666',
  },
};

export default AdminPage;
