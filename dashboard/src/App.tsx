import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import ErrandsPage from './pages/ErrandsPage';
import WorkOrdersPage from './pages/WorkOrdersPage';
import AdminPage from './pages/AdminPage';

interface Session {
  user: {
    id: string;
    email: string;
  };
}

interface UserMetadata {
  role?: string;
  utility_company?: string;
}

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session as Session | null);
      
      if (data.session?.user) {
        const metadata = data.session.user.user_metadata as UserMetadata;
        setUserRole(metadata?.role || null);
      }
      
      setLoading(false);
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_, session) => {
      setSession(session as Session | null);
      if (session?.user) {
        const metadata = session.user.user_metadata as UserMetadata;
        setUserRole(metadata?.role || null);
      } else {
        setUserRole(null);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '18px' }}>Loading...</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <Router>
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar userRole={userRole} />
        <main style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f5f5f5' }}>
          <Routes>
            <Route path="/login" element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/errands" element={<ErrandsPage />} />
            <Route path="/work-orders" element={<WorkOrdersPage />} />
            {userRole === 'super_admin' && <Route path="/admin" element={<AdminPage />} />}
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
