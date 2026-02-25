import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import './pages/Mobile.css';

// ── Eager imports: core pages load with the main bundle (zero chunk delay) ──
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import MeetingsPage from './pages/MeetingsPage';
import TaskBoardPage from './pages/TaskBoardPage';
import SettingsPage from './pages/SettingsPage';

// ── Lazy imports: heavy/infrequent pages load on demand ──
function lazyWithPreload(loader) {
  const Component = lazy(loader);
  Component.preload = loader;
  return Component;
}

const LoginPage = lazyWithPreload(() => import('./pages/LoginPage'));
const RegisterPage = lazyWithPreload(() => import('./pages/RegisterPage'));
const NewMeetingPage = lazyWithPreload(() => import('./pages/NewMeetingPage'));
const MeetingDetailPage = lazyWithPreload(() => import('./pages/MeetingDetailPage'));
const VideoMeetingPage = lazyWithPreload(() => import('./pages/VideoMeetingPage'));
const LiveMeetingPage = lazyWithPreload(() => import('./pages/LiveMeetingPage'));
const JoinMeetingPage = lazyWithPreload(() => import('./pages/JoinMeetingPage'));

function RouteWarmup() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;

    // Preload secondary pages after initial render
    const preloadSecondary = () => {
      NewMeetingPage.preload?.();
      MeetingDetailPage.preload?.();
    };

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preloadSecondary, { timeout: 1000 });
      return () => window.cancelIdleCallback(id);
    }

    const t = window.setTimeout(preloadSecondary, 200);
    return () => window.clearTimeout(t);
  }, [user]);

  // Preload detail page when browsing meetings
  useEffect(() => {
    if (!user) return;
    if (location.pathname.startsWith('/meetings')) {
      MeetingDetailPage.preload?.();
      VideoMeetingPage.preload?.();
      LiveMeetingPage.preload?.();
    }
  }, [location.pathname, user]);

  return null;
}

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
        <RouteWarmup />

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
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

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
              <Route path="/meetings/:id/live" element={<LiveMeetingPage />} />
              <Route path="/join" element={<JoinMeetingPage />} />

              <Route path="/video-meeting" element={<Navigate to="/meetings/new" replace />} />
              <Route path="/video-meeting/:roomId" element={<Navigate to="/meetings/new" replace />} />
              <Route path="/meetings/live" element={<Navigate to="/meetings/new" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
