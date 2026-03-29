import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  userRole?: string | null;
}

const Sidebar: React.FC<SidebarProps> = ({ userRole }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div style={styles.sidebar}>
      <div style={styles.branding}>
        <h2 style={styles.brandTitle}>Canopy</h2>
        <p style={styles.brandSubtitle}>Civic Logistics</p>
      </div>

      <nav style={styles.nav}>
        <NavLink icon="▪" label="Dashboard" onClick={() => navigate('/dashboard')} isActive={location.pathname === '/dashboard'} />
        <NavLink icon="▪" label="Reports" onClick={() => navigate('/reports')} isActive={location.pathname === '/reports'} />
        <NavLink icon="▪" label="Errands" onClick={() => navigate('/errands')} isActive={location.pathname === '/errands'} />
        <NavLink icon="▪" label="Work Orders" onClick={() => navigate('/work-orders')} isActive={location.pathname === '/work-orders'} />
        {userRole === 'super_admin' && (
          <NavLink icon="▪" label="Admin" onClick={() => navigate('/admin')} isActive={location.pathname === '/admin'} />
        )}
      </nav>

      <div style={styles.footer}>
        <p style={styles.versionText}>v0.1.0</p>
        <p style={styles.roleText}>Role: {userRole}</p>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Logout
        </button>
      </div>
    </div>
  );
};

interface NavLinkProps {
  icon: string;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

const NavLink: React.FC<NavLinkProps> = ({ icon, label, onClick, isActive }) => (
  <button
    onClick={onClick}
    style={{
      ...styles.navLink,
      ...(isActive ? styles.navLinkActive : {}),
    }}
  >
    <span style={styles.navIcon}>{icon}</span>
    <span>{label}</span>
  </button>
);

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '260px',
    backgroundColor: '#1a472a',
    color: 'white',
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflowY: 'auto',
  },
  branding: {
    padding: '0 20px 30px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    marginBottom: '20px',
  },
  brandTitle: {
    margin: '0 0 5px 0',
    fontSize: '24px',
    fontWeight: 'bold',
  },
  brandSubtitle: {
    margin: '0',
    fontSize: '12px',
    opacity: 0.7,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  navLink: {
    padding: '12px 20px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'white',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    transition: 'backgroundColor 0.2s',
    width: '100%',
  },
  navLinkActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderLeft: '3px solid white',
    paddingLeft: '17px',
  },
  navIcon: {
    fontSize: '10px',
  },
  footer: {
    padding: '20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    marginTop: 'auto',
  },
  roleText: {
    margin: '0 0 10px 0',
    fontSize: '12px',
    opacity: 0.7,
  },
  versionText: {
    margin: '0 0 10px 0',
    fontSize: '11px',
    opacity: 0.6,
    textAlign: 'center',
  },
  logoutButton: {
    width: '100%',
    padding: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
};

export default Sidebar;
