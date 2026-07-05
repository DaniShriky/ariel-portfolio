import { Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AdminModeProvider } from './context/AdminModeContext';
import './App.css'
import NodePage from './pages/NodePage';
import AdminPage from './pages/AdminPage';
import AdminToolbar from './components/AdminToolbar';
import Footer from './components/Footer';
import FloatingWhatsappButton from './components/FloatingWhatsappButton';

function App() {
  const location = useLocation();
  const isAdminRoute = location.pathname === '/admin';

  return (
    <AdminModeProvider>
      <AdminToolbar />
      <div className="page-content">
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NodePage />} />
        </Routes>
      </div>
      {!isAdminRoute && <Footer />}
      {!isAdminRoute && <FloatingWhatsappButton />}
      <Toaster position="bottom-right" />
    </AdminModeProvider>
  );
}

export default App;
