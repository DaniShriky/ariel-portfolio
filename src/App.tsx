import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AdminModeProvider } from './context/AdminModeContext';
import './App.css'
import NodePage from './pages/NodePage';
import AdminPage from './pages/AdminPage';
import AdminToolbar from './components/AdminToolbar';

function App() {
  return (
    <AdminModeProvider>
      <AdminToolbar />
      <div className="page-content">
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NodePage />} />
        </Routes>
      </div>
      <Toaster position="bottom-right" />
    </AdminModeProvider>
  );
}

export default App;
