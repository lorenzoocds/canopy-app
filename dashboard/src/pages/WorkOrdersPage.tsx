import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface WorkOrder {
  id: string;
  report_id: string | null;
  errand_id: string | null;
  status: string;
  estimated_resolution_date: string;
  utility_company: string;
  created_at: string;
  completed_at: string | null;
}

const WorkOrdersPage: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  const fetchWorkOrders = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const utilityCompany = session?.session?.user?.user_metadata?.utility_company;

      if (!utilityCompany) return;

      const { data, error } = await supabase
        .from('work_orders')
        .select('*')
        .eq('utility_company', utilityCompany)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWorkOrders(data as WorkOrder[]);
    } catch (err) {
      console.error('Error fetching work orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async (workOrderId: string) => {
    try {
      const { error } = await supabase
        .from('work_orders')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', workOrderId);

      if (error) throw error;

      fetchWorkOrders();
    } catch (err) {
      console.error('Error completing work order:', err);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Work Orders</h1>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.headerRow}>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Est. Resolution</th>
                <th style={styles.th}>Utility Company</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.id} style={styles.row}>
                  <td style={styles.td}>{wo.id.substring(0, 8)}</td>
                  <td style={styles.td}>{wo.report_id ? 'Report' : wo.errand_id ? 'Errand' : 'Unknown'}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...getStatusBadgeColor(wo.status) }}>
                      {wo.status}
                    </span>
                  </td>
                  <td style={styles.td}>{new Date(wo.estimated_resolution_date).toLocaleDateString()}</td>
                  <td style={styles.td}>{wo.utility_company}</td>
                  <td style={styles.td}>
                    {wo.status !== 'completed' && (
                      <button
                        onClick={() => handleMarkComplete(wo.id)}
                        style={styles.actionButton}
                      >
                        Mark Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const getStatusBadgeColor = (status: string): React.CSSProperties => {
  const colors: Record<string, { backgroundColor: string; color: string }> = {
    open: { backgroundColor: '#e3f2fd', color: '#0d47a1' },
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
  loading: {
    textAlign: 'center',
    fontSize: '16px',
    color: '#666',
  },
};

export default WorkOrdersPage;
