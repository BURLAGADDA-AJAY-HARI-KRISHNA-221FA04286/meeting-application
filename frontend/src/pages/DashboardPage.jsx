import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { meetingsAPI } from '../api';
import { motion } from 'framer-motion';
import {
    LayoutDashboard, Video, CheckCircle, Brain, TrendingUp,
    Plus, Upload, Mic, ArrowUpRight, Calendar, Sparkles,
    Target, TriangleAlert, MessageSquare, Clock
} from 'lucide-react';
import './Dashboard.css';

const fadeUp = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState(null);

    useEffect(() => {
        meetingsAPI.dashboard()
            .then(res => setStats(res.data))
            .catch((err) => {
                console.error("Dashboard failed:", err);
                setError(err.message || "Failed to load dashboard");
            })
            .finally(() => setLoading(false));
    }, []);

    const greeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 18) return 'Good afternoon';
        return 'Good evening';
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-screen">
                    <div className="spinner spinner-lg" />
                    <span>Loading dashboard…</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-container">
                <div className="error-screen" style={{ textAlign: 'center', marginTop: 100 }}>
                    <div className="text-danger" style={{ marginBottom: 16 }}>
                        <TriangleAlert size={48} />
                    </div>
                    <h2>Something went wrong</h2>
                    <p className="text-muted">{error}</p>
                    <button className="btn btn-primary" onClick={() => window.location.reload()} style={{ marginTop: 24 }}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const s = stats || {};
    const totalTasks = (s.tasks_todo || 0) + (s.tasks_in_progress || 0) + (s.tasks_done || 0);
    const completionPct = totalTasks ? Math.round((s.tasks_done || 0) / totalTasks * 100) : 0;

    const statCards = [
        { label: 'Total Meetings', value: s.total_meetings || 0, icon: Video, color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
        { label: 'Analyzed', value: s.analyzed_meetings || 0, icon: Brain, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
        { label: 'Tasks Created', value: totalTasks, icon: CheckCircle, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
        { label: 'Completion', value: `${completionPct}%`, icon: TrendingUp, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    ];

    const aiFeatures = [
        { icon: Sparkles, text: 'Meeting Summary Generation' },
        { icon: Target, text: 'Action Items Extraction' },
        { icon: TriangleAlert, text: 'Risk & Blocker Detection' },
        { icon: MessageSquare, text: 'AI Chat (RAG Queries)' },
    ];

    return (
        <div className="page-container">
            {/* ── Hero ── */}
            <motion.div className="dashboard-hero" {...fadeUp} transition={{ duration: 0.4 }}>
                <div className="dashboard-hero-content">
                    <div>
                        <h1 className="hero-title">
                            {greeting()}, <span className="gradient-text">{user?.full_name?.split(' ')[0] || 'there'}</span> 👋
                        </h1>
                        <p className="hero-desc">
                            Your AI-powered meeting workspace is ready. Create new meetings, analyze transcripts, or review your task board.
                        </p>
                    </div>
                    <div className="hero-actions">
                        <motion.button
                            className="btn btn-primary"
                            onClick={() => navigate('/meetings/new')}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            <Plus size={18} /> New Meeting
                        </motion.button>
                        <motion.button
                            className="btn btn-secondary"
                            onClick={() => navigate('/tasks')}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            <CheckCircle size={18} /> Task Board
                        </motion.button>
                    </div>
                </div>
                <div className="hero-decoration">
                    <div className="hero-orb hero-orb-1" />
                    <div className="hero-orb hero-orb-2" />
                    <div className="hero-orb hero-orb-3" />
                </div>
            </motion.div>

            {/* ── Stats ── */}
            <div className="dashboard-stats grid-4">
                {statCards.map((card, i) => (
                    <motion.div
                        key={card.label}
                        className="stat-card"
                        {...fadeUp}
                        transition={{ delay: 0.1 + i * 0.05 }}
                    >
                        <div className="stat-card-top">
                            <div className="stat-icon" style={{ background: card.bg, color: card.color }}>
                                <card.icon size={20} />
                            </div>
                            <div className="stat-trend-icon">
                                <TrendingUp size={16} style={{ color: card.color }} />
                            </div>
                        </div>
                        <div className="stat-value">{card.value}</div>
                        <div className="stat-label">{card.label}</div>
                    </motion.div>
                ))}
            </div>

            {/* ── Main Grid ── */}
            <div className="dashboard-main-grid">
                <div className="dashboard-left">
                    {/* Task Completion */}
                    <motion.div className="card" {...fadeUp} transition={{ delay: 0.3 }}>
                        <div className="card-header">
                            <div>
                                <div className="card-title">Task Progress</div>
                                <div className="card-subtitle">Overall completion</div>
                            </div>
                        </div>
                        <div className="completion-body">
                            <div className="completion-ring-wrapper">
                                <svg className="completion-ring" viewBox="0 0 120 120">
                                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="10" />
                                    <circle
                                        cx="60" cy="60" r="52" fill="none"
                                        stroke="url(#ring-gradient)"
                                        strokeWidth="10" strokeLinecap="round"
                                        strokeDasharray={`${completionPct * 3.267} 326.7`}
                                        transform="rotate(-90 60 60)"
                                        style={{ filter: 'drop-shadow(0 0 6px rgba(99,102,241,0.4))' }}
                                    />
                                    <defs>
                                        <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#6366f1" />
                                            <stop offset="100%" stopColor="#a78bfa" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                <div className="completion-ring-text">
                                    <span className="completion-pct">{completionPct}%</span>
                                    <span className="completion-label">Complete</span>
                                </div>
                            </div>
                            <div className="completion-breakdown">
                                {[
                                    { label: 'To Do', value: s.tasks_todo || 0, total: totalTasks, color: '#6366f1' },
                                    { label: 'In Progress', value: s.tasks_in_progress || 0, total: totalTasks, color: '#f59e0b' },
                                    { label: 'Done', value: s.tasks_done || 0, total: totalTasks, color: '#10b981' },
                                ].map(p => (
                                    <div key={p.label} className="progress-item">
                                        <div className="progress-header">
                                            <span className="progress-label">{p.label}</span>
                                            <span className="progress-value">{p.value}</span>
                                        </div>
                                        <div className="progress-track">
                                            <div
                                                className="progress-fill"
                                                style={{
                                                    width: `${p.total ? (p.value / p.total * 100) : 0}%`,
                                                    background: p.color,
                                                    color: p.color,
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Quick Start */}
                    <motion.div className="card" {...fadeUp} transition={{ delay: 0.35 }}>
                        <div className="card-header">
                            <div>
                                <div className="card-title">Quick Start</div>
                                <div className="card-subtitle">Jump right in</div>
                            </div>
                        </div>
                        <div className="quick-start-grid">
                            {[
                                { icon: Video, title: 'New Meeting', desc: 'Start or join', bg: 'rgba(236,72,153,0.1)', color: '#ec4899', onClick: () => navigate('/meetings/new') },
                                { icon: Upload, title: 'Upload', desc: 'Paste transcript', bg: 'rgba(99,102,241,0.1)', color: '#6366f1', onClick: () => navigate('/meetings/new') },
                                { icon: Brain, title: 'Meetings', desc: 'View all', bg: 'rgba(16,185,129,0.1)', color: '#10b981', onClick: () => navigate('/meetings') },
                            ].map((q, i) => (
                                <motion.div
                                    key={q.title}
                                    className="quick-card"
                                    onClick={q.onClick}
                                    whileHover={{ y: -4 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="quick-card-icon" style={{ background: q.bg, color: q.color }}>
                                        <q.icon size={22} />
                                    </div>
                                    <div className="quick-card-text">
                                        <div className="quick-card-title">{q.title}</div>
                                        <div className="quick-card-desc">{q.desc}</div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                <div className="dashboard-right">
                    {/* Recent Meetings */}
                    <motion.div className="card" {...fadeUp} transition={{ delay: 0.4 }}>
                        <div className="card-header">
                            <div>
                                <div className="card-title">Recent Meetings</div>
                                <div className="card-subtitle">Last {(s.recent_meetings || []).length} meetings</div>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/meetings')}>
                                View All <ArrowUpRight size={14} />
                            </button>
                        </div>
                        <div className="recent-meetings-list">
                            {(s.recent_meetings || []).length === 0 ? (
                                <div className="empty-state" style={{ padding: '32px 16px' }}>
                                    <Video size={32} className="empty-icon" />
                                    <p className="empty-text">No meetings yet. Create your first one!</p>
                                </div>
                            ) :
                                (s.recent_meetings || []).map(m => (
                                    <motion.div
                                        key={m.id}
                                        className="recent-meeting-item"
                                        onClick={() => navigate(`/meetings/${m.id}`)}
                                        whileHover={{ x: 3 }}
                                    >
                                        <div className="rm-icon">
                                            <Video size={16} />
                                        </div>
                                        <div className="rm-info">
                                            <div className="rm-title">{m.title}</div>
                                            <div className="rm-date">
                                                <Calendar size={12} />
                                                {new Date(m.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <span className={`badge ${m.status === 'analyzed' ? 'badge-success' : 'badge-warning'}`}>
                                            {m.status || 'pending'}
                                        </span>
                                    </motion.div>
                                ))
                            }
                        </div>
                    </motion.div>

                    {/* AI Features */}
                    <motion.div className="card ai-features-card" {...fadeUp} transition={{ delay: 0.45 }}>
                        <div className="card-header">
                            <div>
                                <div className="card-title">
                                    <Sparkles size={18} style={{ color: 'var(--accent-primary)', marginRight: 8 }} />
                                    AI Capabilities
                                </div>
                                <div className="card-subtitle">Powered by Gemini</div>
                            </div>
                        </div>
                        <div className="ai-features-list">
                            {aiFeatures.map((f, i) => (
                                <motion.div
                                    key={f.text}
                                    className="ai-feature-item"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.5 + i * 0.07 }}
                                >
                                    <f.icon size={16} style={{ color: 'var(--accent-primary)' }} />
                                    {f.text}
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
