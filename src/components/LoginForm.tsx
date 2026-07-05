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
      <form onSubmit={handleSubmit} className="admin-login-form">
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="admin-login-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </>
  );
}

export default LoginForm;
