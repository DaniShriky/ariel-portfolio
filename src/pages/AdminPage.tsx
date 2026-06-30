import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import Header from '../components/Header';

function AdminPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Wrong email or password.');
      setSubmitting(false);
    }
    // On success, onAuthStateChange fires automatically and updates session
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    // onAuthStateChange fires automatically and sets session to null
  }

  if (session === undefined) return (
    <>
      <Header />
      <div className="spinner" />
    </>
  );

  if (session === null) return (
    <>
      <Header subtitle="Admin" />
      <form onSubmit={handleLogin} className="admin-login-form">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        {error && <p>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </>
  );

  return (
    <>
      <Header subtitle="Admin" />
      <p>Logged in as {session.user.email}</p>
      <button onClick={handleLogout}>Log out</button>
    </>
  );
}

export default AdminPage;
