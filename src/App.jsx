import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Lobby from './pages/Lobby';

function AppRoutes() {
  const location = useLocation();
  const isAuthenticated = Boolean(localStorage.getItem('token'));

  return (
    <Routes location={location}>
      <Route path="/" element={<Navigate to={isAuthenticated ? '/lobby' : '/login'} replace />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to="/lobby" replace /> : <Login />} />
      <Route path="/lobby" element={isAuthenticated ? <Lobby /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
