import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import './pages/Mobile.css';

/* ── Lazy-loaded pages (code-split at route level) ── */
const Layout = lazy(() => import('./components/Layout'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MeetingsPage = lazy(() => import('./pages/MeetingsPage'));
const NewMeetingPage = lazy(() => import('./pages/NewMeetingPage'));
const MeetingDetailPage = lazy(() => import('./pages/MeetingDetailPage'));
const TaskBoardPage = lazy(() => import('./pages/TaskBoardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const VideoMeetingPage = lazy(() => import('./pages/VideoMeetingPage'));

/* ── Minimal full-screen loading spinner ── */
function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0a0e1a',
    }}>
      <div className="spinner spinner-lg" />
    </div>
  );
}

function PrivateRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  return user ? <Outlet /> : <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} />;
}

function PublicRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo');
  return user ? <Navigate to={returnTo || '/dashboard'} /> : <Outlet />;
}

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

        <Suspense fallback={<PageLoader />}>
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
                <Route path="/tasks" element={<TaskBoardPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>

              <Route path="/join/:roomId" element={<JoinRedirect />} />
              <Route path="/meetings/room/:roomId" element={<VideoMeetingPage />} />

              {/* Legacy redirects */}
              <Route path="/join" element={<Navigate to="/meetings/new" replace />} />
              <Route path="/video-meeting" element={<Navigate to="/meetings/new" replace />} />
              <Route path="/video-meeting/:roomId" element={<Navigate to="/meetings/new" replace />} />
              <Route path="/meetings/live" element={<Navigate to="/meetings/new" replace />} />
              <Route path="/meetings/:id/live" element={<Navigate to="/meetings/new" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
