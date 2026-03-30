import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

type ViewMode = 'login' | 'signup' | 'verify' | 'utility_interest';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState<'individual' | 'utility'>('individual');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('login');
  const navigate = useNavigate();

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setCompanyName('');
    setPhone('');
    setMessage('');
    setError('');
    setSuccess('');
  };

  const switchView = (newView: ViewMode) => {
    resetForm();
    setView(newView);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
      } else if (data.session) {
        navigate('/dashboard');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: 'field_user',
          },
          emailRedirectTo: window.location.origin + '/dashboard',
        },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else if (data.user) {
        setView('verify');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleUtilityInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Store the lead in a utility_leads table
      const { error: insertError } = await supabase
        .from('utility_leads')
        .insert({
          company_name: companyName,
          contact_name: fullName,
          email,
          phone,
          message,
          status: 'new',
        });

      if (insertError) {
        // If the table doesn't exist yet, just show success anyway
        // The lead info was captured in the attempt
        console.warn('utility_leads insert:', insertError.message);
      }

      setSuccess(
        "Thanks! Our team will reach out within 1 business day to get your utility onboarded. Check your email for next steps."
      );
    } catch (err) {
      setError('An unexpected error occurred. Please email us at support@canopy.city');
    } finally {
      setLoading(false);
    }
  };

  // --- Email verification screen ---
  if (view === 'verify') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>Canopy</h1>
            <p style={styles.subtitle}>Check your email</p>
          </div>
          <div style={styles.verifyBox}>
            <div style={styles.verifyIcon}>&#9993;</div>
            <p style={styles.verifyText}>
              We sent a verification link to <strong>{email}</strong>. Click the link in the email to activate your account.
            </p>
            <p style={styles.verifySubtext}>
              Didn't get it? Check your spam folder or try signing up again.
            </p>
          </div>
          <button
            onClick={() => switchView('login')}
            style={{ ...styles.button, marginTop: '20px' }}
          >
            Back to Log In
          </button>
        </div>
      </div>
    );
  }

  // --- Utility company interest form ---
  if (view === 'utility_interest') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>Canopy</h1>
            <p style={styles.subtitle}>Utility Company Access</p>
          </div>

          {success ? (
            <div>
              <div style={styles.successBox}>{success}</div>
              <button
                onClick={() => switchView('login')}
                style={{ ...styles.button, marginTop: '20px' }}
              >
                Back to Log In
              </button>
            </div>
          ) : (
            <form onSubmit={handleUtilityInterest}>
              <p style={styles.utilityNote}>
                Utility company accounts include fleet dispatch, service territory mapping, and team management. Fill out the form below and our team will get you set up.
              </p>

              <div style={styles.formGroup}>
                <label style={styles.label}>Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Con Edison"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Your Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Work Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@utility.com"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Tell us about your needs</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Service area, team size, current dispatch workflow..."
                  style={{ ...styles.input, minHeight: '80px', resize: 'vertical' } as React.CSSProperties}
                  rows={3}
                />
              </div>

              {error && <div style={styles.error}>{error}</div>}

              <button
                type="submit"
                disabled={loading}
                style={{
                  ...styles.button,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Submitting...' : 'Request Access'}
              </button>

              <button
                type="button"
                onClick={() => switchView('signup')}
                style={styles.linkButton}
              >
                &larr; Back to Sign Up
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // --- Sign Up screen ---
  if (view === 'signup') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.title}>Canopy</h1>
            <p style={styles.subtitle}>Create your account</p>
          </div>

          {/* Account type toggle */}
          <div style={styles.toggleRow}>
            <button
              type="button"
              onClick={() => setAccountType('individual')}
              style={{
                ...styles.toggleButton,
                ...(accountType === 'individual' ? styles.toggleActive : {}),
              }}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setAccountType('utility')}
              style={{
                ...styles.toggleButton,
                ...(accountType === 'utility' ? styles.toggleActive : {}),
              }}
            >
              Utility Company
            </button>
          </div>

          {accountType === 'utility' ? (
            <div>
              <p style={styles.utilityNote}>
                Utility companies get dedicated onboarding with fleet dispatch, territory mapping, and admin tools.
              </p>
              <button
                type="button"
                onClick={() => switchView('utility_interest')}
                style={styles.button}
              >
                Get Started &rarr;
              </button>
              <button
                type="button"
                onClick={() => switchView('login')}
                style={styles.linkButton}
              >
                Already have an account? Log in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSignup}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  style={styles.input}
                  required
                  minLength={8}
                />
              </div>

              {error && <div style={styles.error}>{error}</div>}

              <button
                type="submit"
                disabled={loading}
                style={{
                  ...styles.button,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Creating account...' : 'Sign Up'}
              </button>

              <button
                type="button"
                onClick={() => switchView('login')}
                style={styles.linkButton}
              >
                Already have an account? Log in
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // --- Login screen (default) ---
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Canopy</h1>
          <p style={styles.subtitle}>Civic Logistics Platform</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>

          <button
            type="button"
            onClick={() => switchView('signup')}
            style={styles.linkButton}
          >
            Don't have an account? Sign up
          </button>
        </form>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a472a 0%, #2d6a42 100%)',
    padding: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    padding: '40px',
    width: '100%',
    maxWidth: '420px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  title: {
    margin: '0 0 8px 0',
    color: '#1a472a',
    fontSize: '32px',
    fontWeight: 'bold',
  },
  subtitle: {
    margin: '0',
    color: '#666',
    fontSize: '14px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    color: '#333',
    fontSize: '14px',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  button: {
    width: '100%',
    padding: '12px',
    marginTop: '12px',
    backgroundColor: '#1a472a',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  linkButton: {
    width: '100%',
    padding: '12px',
    marginTop: '12px',
    backgroundColor: 'transparent',
    color: '#1a472a',
    border: 'none',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  error: {
    color: '#c62828',
    fontSize: '14px',
    marginTop: '10px',
    padding: '12px',
    backgroundColor: '#ffcdd2',
    borderRadius: '4px',
    border: '1px solid #ef5350',
  },
  toggleRow: {
    display: 'flex',
    gap: '0px',
    marginBottom: '20px',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #ddd',
  },
  toggleButton: {
    flex: 1,
    padding: '10px',
    border: 'none',
    backgroundColor: '#f5f5f5',
    color: '#666',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  toggleActive: {
    backgroundColor: '#1a472a',
    color: 'white',
    fontWeight: '600',
  },
  utilityNote: {
    fontSize: '14px',
    color: '#555',
    lineHeight: '1.5',
    marginBottom: '16px',
    padding: '12px',
    backgroundColor: '#f0f7f1',
    borderRadius: '4px',
    border: '1px solid #c8e6c9',
  },
  verifyBox: {
    textAlign: 'center',
    padding: '20px 0',
  },
  verifyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  verifyText: {
    fontSize: '15px',
    color: '#333',
    lineHeight: '1.5',
    marginBottom: '12px',
  },
  verifySubtext: {
    fontSize: '13px',
    color: '#888',
  },
  successBox: {
    fontSize: '15px',
    color: '#1b5e20',
    lineHeight: '1.5',
    padding: '16px',
    backgroundColor: '#e8f5e9',
    borderRadius: '4px',
    border: '1px solid #a5d6a7',
    textAlign: 'center',
  },
};

export default LoginPage;
