import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MeetingsPage from './pages/MeetingsPage';
import NewMeetingPage from './pages/NewMeetingPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import TaskBoardPage from './pages/TaskBoardPage';
import SettingsPage from './pages/SettingsPage';
import VideoMeetingPage from './pages/VideoMeetingPage';
import './pages/Mobile.css';

function PrivateRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }
  // Preserve the URL the user was trying to visit so we can redirect after login
  return user ? <Outlet /> : <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} />;
}

function PublicRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }
  // After login, redirect to the returnTo URL if present
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo');
  return user ? <Navigate to={returnTo || '/dashboard'} /> : <Outlet />;
}

// Direct join link component — redirects /join/:roomId → /meetings/room/:roomId
function JoinRedirect() {
  const { roomId } = useParams();
  return <Navigate to={`/meetings/room/${roomId}`} replace />;
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
            {/* Pages inside Layout (with sidebar) */}
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/meetings/new" element={<NewMeetingPage />} />
              <Route path="/meetings/:id" element={<MeetingDetailPage />} />
              <Route path="/tasks" element={<TaskBoardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Direct join links — /join/:roomId goes straight to meeting room */}
            <Route path="/join/:roomId" element={<JoinRedirect />} />

            {/* Video meeting — fullscreen, outside Layout */}
            <Route path="/meetings/room/:roomId" element={<VideoMeetingPage />} />

            {/* Redirects for old routes */}
            <Route path="/join" element={<Navigate to="/meetings/new" replace />} />
            <Route path="/video-meeting" element={<Navigate to="/meetings/new" replace />} />
            <Route path="/video-meeting/:roomId" element={<Navigate to="/meetings/new" replace />} />
            <Route path="/meetings/live" element={<Navigate to="/meetings/new" replace />} />
            <Route path="/meetings/:id/live" element={<Navigate to="/meetings/new" replace />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
