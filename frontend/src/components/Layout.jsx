import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    Brain, LayoutDashboard, Video, CheckSquare, Settings,
    LogOut, Search, ChevronLeft, ChevronRight, Plus, Menu,
    X, Command, Clock, Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './Layout.css';

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [showPalette, setShowPalette] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [time, setTime] = useState('');

    useEffect(() => {
        const tick = () => setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        tick();
        const interval = setInterval(tick, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => { setMobileOpen(false); }, [location]);

    const handleKeyDown = useCallback((e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowPalette(true); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); navigate('/meetings/new'); }
        if (e.altKey && e.key === '1') { e.preventDefault(); navigate('/dashboard'); }
        if (e.altKey && e.key === '2') { e.preventDefault(); navigate('/meetings'); }
        if (e.altKey && e.key === '3') { e.preventDefault(); navigate('/tasks'); }
        if (e.altKey && e.key === '4') { e.preventDefault(); navigate('/settings'); }
        if (e.altKey && e.key === '5') { e.preventDefault(); navigate('/video-meeting'); }
        if (e.key === 'Escape') setShowPalette(false);
    }, [navigate]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const navItems = [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortcut: '1' },
        { to: '/meetings', icon: Video, label: 'Meetings', shortcut: '2' },
        { to: '/tasks', icon: CheckSquare, label: 'Tasks', shortcut: '3' },
        { to: '/settings', icon: Settings, label: 'Settings', shortcut: '4' },
    ];

    const commands = [
        { label: 'Go to Dashboard', action: () => navigate('/dashboard') },
        { label: 'Go to Meetings', action: () => navigate('/meetings') },
        { label: 'Go to Tasks', action: () => navigate('/tasks') },
        { label: 'Go to Settings', action: () => navigate('/settings') },
        { label: 'New Meeting', action: () => navigate('/meetings/new') },
        { label: 'Start Video Meeting', action: () => navigate('/video-meeting') },
    ];

    const filteredCommands = searchQuery
        ? commands.filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
        : commands;

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return '☀️';
        if (h < 18) return '🌤️';
        return '🌙';
    };

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/dashboard')) return 'Dashboard';
        if (path.includes('/meetings/new')) return 'New Meeting';
        if (path.includes('/meetings/live')) return 'Live Meeting';
        if (path.includes('/meetings/')) return 'Meeting Details';
        if (path.includes('/meetings')) return 'Meetings';
        if (path.includes('/tasks')) return 'Tasks';
        if (path.includes('/settings')) return 'Settings';
        return 'MeetingAI';
    };

    return (
        <div className="layout">
            {/* Mobile menu button */}
            <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>
                <Menu size={20} />
            </button>

            {/* Mobile overlay */}
            {mobileOpen && (
                <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
            )}

            {/* ── Sidebar ── */}
            <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
                {/* Header */}
                <div className="sidebar-header">
                    <div className="logo-container">
                        <div className="logo-icon">
                            <Brain size={22} />
                        </div>
                        {!collapsed && (
                            <div className="logo-text">
                                <span className="logo-title">MeetingAI</span>
                                <span className="logo-subtitle">Intelligence Platform</span>
                            </div>
                        )}
                    </div>
                    <button
                        className="btn btn-ghost btn-icon collapse-btn"
                        onClick={() => setCollapsed(!collapsed)}
                        title={collapsed ? 'Expand' : 'Collapse'}
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                {/* Quick action */}
                {collapsed ? (
                    <button
                        className="sidebar-quick-action-mini"
                        onClick={() => navigate('/meetings/new')}
                        title="New Meeting"
                    >
                        <Plus size={18} />
                    </button>
                ) : (
                    <button className="sidebar-quick-action" onClick={() => navigate('/meetings/new')}>
                        <Plus size={18} />
                        <span>New Meeting</span>
                        <span className="shortcut-key">⌘N</span>
                    </button>
                )}

                {/* Nav */}
                <nav className="sidebar-nav">
                    {!collapsed && <div className="nav-section-label">Navigation</div>}
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            title={collapsed ? item.label : undefined}
                        >
                            <item.icon size={18} />
                            {!collapsed && (
                                <>
                                    <span>{item.label}</span>
                                    <span className="nav-shortcut">{item.shortcut}</span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Video Meeting Quick Launch */}
                {collapsed ? (
                    <button
                        className="sidebar-quick-action-mini video-meeting-btn"
                        onClick={() => navigate('/video-meeting')}
                        title="Video Meeting"
                    >
                        <Camera size={18} />
                    </button>
                ) : (
                    <button className="sidebar-video-meeting" onClick={() => navigate('/video-meeting')}>
                        <Camera size={18} />
                        <span>Video Meeting</span>
                    </button>
                )}

                {/* Status */}
                {!collapsed && (
                    <div className="sidebar-status">
                        <div className="status-indicator">
                            <div className="status-dot online" />
                            <span>AI Online</span>
                        </div>
                        <span className="status-version">v2.0</span>
                    </div>
                )}

                {/* Footer */}
                <div className="sidebar-footer">
                    <div className="user-info" onClick={() => navigate('/settings')}>
                        <div className="user-avatar">
                            {(user?.full_name || 'U')[0].toUpperCase()}
                        </div>
                        {!collapsed && (
                            <div className="user-details">
                                <span className="user-name">{user?.full_name || 'User'}</span>
                                <span className="user-email">{user?.email}</span>
                            </div>
                        )}
                    </div>
                    <button
                        className="btn btn-ghost btn-icon logout-btn"
                        onClick={logout}
                        title="Logout"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </aside>

            {/* ── Main ── */}
            <main className="main-content">
                {/* Top bar */}
                <div className="topbar">
                    <div className="topbar-left">
                        <div className="topbar-breadcrumb">
                            <span className="topbar-greeting">{greeting()}</span>
                            <span className="topbar-page">{getPageTitle()}</span>
                        </div>
                    </div>
                    <div className="topbar-right">
                        <button className="topbar-search-btn" onClick={() => setShowPalette(true)}>
                            <Search size={14} />
                            <span>Search…</span>
                            <span className="shortcut-key">⌘K</span>
                        </button>
                        <div className="topbar-time">{time}</div>
                    </div>
                </div>

                <Outlet />
            </main>

            {/* ── Command Palette ── */}
            <AnimatePresence>
                {showPalette && (
                    <motion.div
                        className="modal-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowPalette(false)}
                    >
                        <motion.div
                            className="command-palette"
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="command-input-wrapper">
                                <Command size={18} />
                                <input
                                    className="command-input"
                                    placeholder="Type a command or search…"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="command-list">
                                <div className="command-section-label">Quick Actions</div>
                                {filteredCommands.map((cmd, i) => (
                                    <button
                                        key={i}
                                        className="command-item"
                                        onClick={() => { cmd.action(); setShowPalette(false); setSearchQuery(''); }}
                                    >
                                        {cmd.label}
                                    </button>
                                ))}
                                {filteredCommands.length === 0 && (
                                    <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center' }}>
                                        No results found
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
