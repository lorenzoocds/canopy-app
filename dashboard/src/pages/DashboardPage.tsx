import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Counts {
  reportsSubmitted: number;
  pendingVerification: number;
  verifiedUnactioned: number;
  errandsActive: number;
  workOrdersOpen: number;
}

const DashboardPage: React.FC = () => {
  const [counts, setCounts] = useState<Counts>({
    reportsSubmitted: 0,
    pendingVerification: 0,
    verifiedUnactioned: 0,
    errandsActive: 0,
    workOrdersOpen: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const utilityCompany = session?.session?.user?.user_metadata?.utility_company;

        let newCounts: Counts = {
          reportsSubmitted: 0,
          pendingVerification: 0,
          verifiedUnactioned: 0,
          errandsActive: 0,
          workOrdersOpen: 0,
        };

        if (utilityCompany) {
          // Reports Submitted
          const { count: reportsCount } = await supabase
            .from('reports')
            .select('*', { count: 'exact', head: true })
            .eq('utility_company', utilityCompany);

          newCounts.reportsSubmitted = reportsCount || 0;

          // Pending Verification
          const { count: pendingCount } = await supabase
            .from('reports')
            .select('*', { count: 'exact', head: true })
            .eq('utility_company', utilityCompany)
            .eq('status', 'submitted');

          newCounts.pendingVerification = pendingCount || 0;

          // Verified Unactioned
          const { count: verifiedCount } = await supabase
            .from('reports')
            .select('*', { count: 'exact', head: true })
            .eq('utility_company', utilityCompany)
            .eq('status', 'verified')
            .eq('work_order_created', false);

          newCounts.verifiedUnactioned = verifiedCount || 0;

          // Errands Active
          const { count: errandsCount } = await supabase
            .from('errands')
            .select('*', { count: 'exact', head: true })
            .eq('utility_company', utilityCompany)
            .in('status', ['posted', 'in_progress']);

          newCounts.errandsActive = errandsCount || 0;

          // Work Orders Open
          const { count: workOrdersCount } = await supabase
            .from('work_orders')
            .select('*', { count: 'exact', head: true })
            .eq('utility_company', utilityCompany)
            .in('status', ['open', 'in_progress']);

          newCounts.workOrdersOpen = workOrdersCount || 0;
        }

        setCounts(newCounts);
      } catch (err) {
        console.error('Error fetching counts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
  }, []);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Dashboard</h1>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <div style={styles.cardsGrid}>
          <SummaryCard label="Reports Submitted" value={counts.reportsSubmitted} color="#1a472a" />
          <SummaryCard label="Pending Verification" value={counts.pendingVerification} color="#f57c00" />
          <SummaryCard label="Verified (Unactioned)" value={counts.verifiedUnactioned} color="#d32f2f" />
          <SummaryCard label="Errands Active" value={counts.errandsActive} color="#388e3c" />
          <SummaryCard label="Work Orders Open" value={counts.workOrdersOpen} color="#0288d1" />
        </div>
      )}
    </div>
  );
};

interface SummaryCardProps {
  label: string;
  value: number;
  color: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, color }) => (
  <div style={{ ...styles.card, borderLeft: `4px solid ${color}` }}>
    <p style={styles.cardLabel}>{label}</p>
    <p style={{ ...styles.cardValue, color }}>{value}</p>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '30px',
    maxWidth: '1200px',
  },
  title: {
    margin: '0 0 30px 0',
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  },
  cardLabel: {
    margin: '0 0 10px 0',
    color: '#666',
    fontSize: '14px',
    fontWeight: '500',
  },
  cardValue: {
    margin: '0',
    fontSize: '32px',
    fontWeight: 'bold',
  },
  loading: {
    textAlign: 'center',
    fontSize: '16px',
    color: '#666',
  },
};

export default DashboardPage;
