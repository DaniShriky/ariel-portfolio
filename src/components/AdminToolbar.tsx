import { supabase } from '../lib/supabaseClient';
import { useAdminMode } from '../context/AdminModeContext';

function AdminToolbar() {
  const { isAdmin } = useAdminMode();

  if (!isAdmin) return null;

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="admin-toolbar">
      <span className="admin-toolbar__label">Edit Mode</span>
      <button className="admin-toolbar__btn" onClick={handleLogout}>
        Exit Edit Mode
      </button>
    </div>
  );
}

export default AdminToolbar;
