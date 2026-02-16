import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MeetingsPage from './pages/MeetingsPage';
import NewMeetingPage from './pages/NewMeetingPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import LiveMeetingPage from './pages/LiveMeetingPage';
import TaskBoardPage from './pages/TaskBoardPage';
import SettingsPage from './pages/SettingsPage';
import VideoMeetingPage from './pages/VideoMeetingPage';

function PrivateRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }
  return user ? <Outlet /> : <Navigate to="/login" />;
}

function PublicRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }
  return user ? <Navigate to="/dashboard" /> : <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#111827',
              color: '#f1f5f9',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />

        <Routes>
          {/* Public routes */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Private routes */}
          <Route element={<PrivateRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/meetings/new" element={<NewMeetingPage />} />
              <Route path="/meetings/:id" element={<MeetingDetailPage />} />
              <Route path="/meetings/live" element={<LiveMeetingPage />} />
              <Route path="/meetings/:id/live" element={<LiveMeetingPage />} />
              <Route path="/tasks" element={<TaskBoardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            {/* Video meeting — fullscreen, outside Layout */}
            <Route path="/video-meeting" element={<VideoMeetingPage />} />
            <Route path="/video-meeting/:roomId" element={<VideoMeetingPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
