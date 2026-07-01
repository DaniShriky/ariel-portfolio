import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminMode } from '../context/AdminModeContext';
import LoginForm from '../components/LoginForm';

function AdminPage() {
  const { isAdmin, loading } = useAdminMode();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAdmin) navigate('/');
  }, [isAdmin, loading, navigate]);

  if (loading) return <div className="spinner" />;

  return <LoginForm />;
}

export default AdminPage;
