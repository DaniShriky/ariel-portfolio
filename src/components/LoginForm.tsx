import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Header from './Header';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Wrong email or password.');
      setSubmitting(false);
    }
    // On success, AdminModeContext's onAuthStateChange fires and isAdmin becomes true
  }

  return (
    <>
      <Header subtitle="Admin" />
      <div className="admin-login-page">
        <form onSubmit={handleSubmit} className="admin-login-card">
          <p className="admin-login-title">Admin Login</p>

          <div className="admin-login-field">
            <label htmlFor="admin-email" className="admin-login-label">Email</label>
            <input
              id="admin-email"
              type="email"
              className="admin-login-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="admin-login-field">
            <label htmlFor="admin-password" className="admin-login-label">Password</label>
            <input
              id="admin-password"
              type="password"
              className="admin-login-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="admin-login-error">{error}</p>}

          <button type="submit" className="admin-login-submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log In'}
          </button>
        </form>
      </div>
    </>
  );
}

export default LoginForm;
