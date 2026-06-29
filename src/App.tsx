import { Routes, Route } from 'react-router-dom'
import './App.css'
import NodePage from './pages/NodePage'
import AdminPage from './pages/AdminPage'

function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<NodePage />} />
    </Routes>
  )
}

export default App
