import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    Brain, LayoutDashboard, Video, SquareCheck, Settings,
    LogOut, Search, ChevronLeft, ChevronRight, Plus, Menu,
    Command
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
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

    const navigateAndClose = useCallback((to) => {
        if (mobileOpen) setMobileOpen(false);
        navigate(to);
    }, [mobileOpen, navigate]);

    const handleKeyDown = useCallback((e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            setShowPalette(true);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            navigate('/meetings/new');
            return;
        }
        if (e.altKey && e.key === '1') {
            e.preventDefault();
            navigate('/dashboard');
            return;
        }
        if (e.altKey && e.key === '2') {
            e.preventDefault();
            navigate('/meetings');
            return;
        }
        if (e.altKey && e.key === '3') {
            e.preventDefault();
            navigate('/tasks');
            return;
        }
        if (e.altKey && e.key === '4') {
            e.preventDefault();
            navigate('/settings');
            return;
        }
        if (e.altKey && e.key === '5') {
            e.preventDefault();
            navigate('/meetings/new');
            return;
        }
        if (e.key === 'Escape') setShowPalette(false);
    }, [navigate]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const navItems = [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortcut: '1' },
        { to: '/meetings', icon: Video, label: 'Meetings', shortcut: '2' },
        { to: '/tasks', icon: SquareCheck, label: 'Tasks', shortcut: '3' },
        { to: '/settings', icon: Settings, label: 'Settings', shortcut: '4' },
    ];

    const prefetchByPath = {
        '/dashboard': () => import('../pages/DashboardPage'),
        '/meetings': () => import('../pages/MeetingsPage'),
        '/tasks': () => import('../pages/TaskBoardPage'),
        '/settings': () => import('../pages/SettingsPage'),
        '/meetings/new': () => import('../pages/NewMeetingPage'),
    };

    const commands = [
        { label: 'Go to Dashboard', action: () => navigateAndClose('/dashboard') },
        { label: 'Go to Meetings', action: () => navigateAndClose('/meetings') },
        { label: 'Go to Tasks', action: () => navigateAndClose('/tasks') },
        { label: 'Go to Settings', action: () => navigateAndClose('/settings') },
        { label: 'New Meeting (Start / Join / Upload)', action: () => navigateAndClose('/meetings/new') },
    ];

    const filteredCommands = searchQuery
        ? commands.filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
        : commands;

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Morning';
        if (h < 18) return 'Afternoon';
        return 'Evening';
    };

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/dashboard')) return 'Dashboard';
        if (path.includes('/meetings/new')) return 'New Meeting';
        if (path.includes('/meetings/')) return 'Meeting Details';
        if (path.includes('/meetings')) return 'Meetings';
        if (path.includes('/tasks')) return 'Tasks';
        if (path.includes('/settings')) return 'Settings';
        return 'MeetingAI';
    };

    return (
        <div className="layout">
            <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>
                <Menu size={20} />
            </button>

            {mobileOpen && (
                <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
            )}

            <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
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

                {collapsed ? (
                    <button
                        className="sidebar-quick-action-mini"
                        onClick={() => navigateAndClose('/meetings/new')}
                        title="New Meeting"
                    >
                        <Plus size={18} />
                    </button>
                ) : (
                    <button className="sidebar-quick-action" onClick={() => navigateAndClose('/meetings/new')}>
                        <Plus size={18} />
                        <span>New Meeting</span>
                        <span className="shortcut-key">Ctrl+N</span>
                    </button>
                )}

                <nav className="sidebar-nav">
                    {!collapsed && <div className="nav-section-label">Navigation</div>}
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            title={collapsed ? item.label : undefined}
                            onMouseEnter={() => prefetchByPath[item.to]?.()}
                            onFocus={() => prefetchByPath[item.to]?.()}
                            onClick={() => mobileOpen && setMobileOpen(false)}
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

                {!collapsed && (
                    <div className="sidebar-status">
                        <div className="status-indicator">
                            <div className="status-dot online" />
                            <span>AI Online</span>
                        </div>
                        <span className="status-version">v2.0</span>
                    </div>
                )}

                <div className="sidebar-footer">
                    <div className="user-info" onClick={() => navigateAndClose('/settings')}>
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

            <main className="main-content">
                <div className="topbar">
                    <div className="topbar-left">
                        <div className="topbar-breadcrumb">
                            <span className="topbar-greeting">Good {greeting()}</span>
                            <span className="topbar-page">{getPageTitle()}</span>
                        </div>
                    </div>
                    <div className="topbar-right">
                        <button className="topbar-search-btn" onClick={() => setShowPalette(true)}>
                            <Search size={14} />
                            <span>Search...</span>
                            <span className="shortcut-key">Ctrl+K</span>
                        </button>
                        <div className="topbar-time">{time}</div>
                    </div>
                </div>

                <Outlet />
            </main>

            <AnimatePresence>
                {showPalette && (
                    <div
                        className="modal-overlay"
                        onClick={() => setShowPalette(false)}
                    >
                        <div
                            className="command-palette"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="command-input-wrapper">
                                <Command size={18} />
                                <input
                                    className="command-input"
                                    placeholder="Type a command or search..."
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
                                        onClick={() => {
                                            cmd.action();
                                            setShowPalette(false);
                                            setSearchQuery('');
                                        }}
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
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
