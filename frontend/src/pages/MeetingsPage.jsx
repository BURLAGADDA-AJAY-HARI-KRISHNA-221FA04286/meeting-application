import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingsAPI, aiAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Search, Video, Calendar, Trash2, Grid3X3,
    List, ChevronRight, Brain, Clock, Sparkles, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import './Meetings.css';

const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
};

export default function MeetingsPage() {
    const navigate = useNavigate();
    // All meetings loaded once — filtering/search/sort is pure client-side
    const [allMeetings, setAllMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sort, setSort] = useState('newest');
    const [viewMode, setViewMode] = useState('grid');
    const [analyzingIds, setAnalyzingIds] = useState(new Set());
    const hasLoaded = useRef(false);

    // ── Load all meetings ONCE ──
    useEffect(() => {
        if (hasLoaded.current) return;
        hasLoaded.current = true;
        meetingsAPI.list()
            .then(res => setAllMeetings(res.data))
            .catch(() => toast.error('Failed to load meetings'))
            .finally(() => setLoading(false));
    }, []);

    // ── Client-side filter + search + sort (instant, zero network) ──
    const filtered = useMemo(() => {
        let result = allMeetings;

        // Status filter
        if (statusFilter === 'analyzed') {
            result = result.filter(m => m.has_analysis);
        } else if (statusFilter === 'pending') {
            result = result.filter(m => !m.has_analysis);
        }

        // Search filter (case-insensitive title match)
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(m => m.title.toLowerCase().includes(q));
        }

        // Sort - Lexicographical ISO string comparison is much faster than new Date() in O(N log N)
        if (sort === 'newest') {
            result = [...result].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        } else if (sort === 'oldest') {
            result = [...result].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
        } else {
            result = [...result].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        }

        return result;
    }, [allMeetings, statusFilter, search, sort]);

    // Stats from full dataset (not filtered)
    const analyzed = useMemo(() => allMeetings.filter(m => m.has_analysis).length, [allMeetings]);
    const pending = allMeetings.length - analyzed;

    // ── Delete with optimistic UI ──
    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!confirm('Delete this meeting?')) return;
        // Optimistic: remove from UI immediately
        setAllMeetings(prev => prev.filter(m => m.id !== id));
        try {
            await meetingsAPI.delete(id);
            toast.success('Meeting deleted');
        } catch {
            toast.error('Failed to delete');
            // Revert on error — re-fetch all
            meetingsAPI.list()
                .then(res => setAllMeetings(res.data))
                .catch(() => { });
        }
    };

    // ── Analyze meeting ──
    const handleAnalyze = async (e, id) => {
        e.stopPropagation();
        setAnalyzingIds(prev => new Set(prev).add(id));
        try {
            await aiAPI.analyze(id);
            toast.success('Analysis complete!');
            // Update local state to reflect analyzed status
            setAllMeetings(prev => prev.map(m =>
                m.id === id ? { ...m, has_analysis: true } : m
            ));
        } catch (err) {
            const msg = err.response?.data?.detail || 'Analysis failed';
            toast.error(msg);
        } finally {
            setAnalyzingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="page-header" style={{ marginBottom: 20 }}>
                    <div>
                        <div style={{ width: 160, height: 28, background: 'rgba(99,102,241,0.08)', borderRadius: 8 }} />
                        <div style={{ width: 220, height: 14, background: 'rgba(99,102,241,0.05)', borderRadius: 6, marginTop: 8 }} />
                    </div>
                </div>
                <div className="meetings-grid">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="card" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                <div style={{ width: 32, height: 32, background: 'rgba(99,102,241,0.08)', borderRadius: 8 }} />
                            </div>
                            <div style={{ width: '80%', height: 18, background: 'rgba(99,102,241,0.08)', borderRadius: 6, marginBottom: 8 }} />
                            <div style={{ width: '60%', height: 12, background: 'rgba(99,102,241,0.05)', borderRadius: 4, marginBottom: 16 }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <div style={{ width: 80, height: 12, background: 'rgba(99,102,241,0.05)', borderRadius: 4 }} />
                                <div style={{ width: 64, height: 20, background: 'rgba(99,102,241,0.06)', borderRadius: 10 }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* ── Header ── */}
            <motion.div className="page-header" {...fadeUp}>
                <div>
                    <h1 className="page-title">Meetings</h1>
                    <p className="page-subtitle">
                        {allMeetings.length} total  •  {analyzed} analyzed  •  {pending} pending
                    </p>
                </div>
                <motion.button
                    className="btn btn-primary"
                    onClick={() => navigate('/meetings/new')}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                >
                    <Plus size={18} /> New Meeting
                </motion.button>
            </motion.div>

            {/* ── Toolbar ── */}
            <motion.div className="meetings-toolbar" {...fadeUp} transition={{ delay: 0.05 }}>
                <div className="meetings-toolbar-left">
                    <div className="search-bar">
                        <Search size={16} className="search-icon" />
                        <input
                            id="meetings-search"
                            className="input"
                            placeholder="Search meetings…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="tabs">
                        {[
                            { label: 'All', value: '' },
                            { label: 'Analyzed', value: 'analyzed' },
                            { label: 'Pending', value: 'pending' },
                        ].map(f => (
                            <button
                                key={f.value}
                                className={`tab ${statusFilter === f.value ? 'active' : ''}`}
                                onClick={() => setStatusFilter(f.value)}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="meetings-toolbar-right">
                    <select
                        className="meetings-sort-select"
                        value={sort}
                        onChange={e => setSort(e.target.value)}
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="alpha">A → Z</option>
                    </select>
                    <div className="view-toggle">
                        <button
                            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')}
                        >
                            <Grid3X3 size={16} />
                        </button>
                        <button
                            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setViewMode('list')}
                        >
                            <List size={16} />
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* ── Content ── */}
            {filtered.length === 0 ? (
                <motion.div className="card" {...fadeUp} transition={{ delay: 0.1 }}>
                    <div className="empty-state">
                        <Video size={48} className="empty-icon" />
                        <h3 className="empty-title">No meetings found</h3>
                        <p className="empty-text">
                            {search || statusFilter
                                ? 'Try adjusting your search or filter.'
                                : 'Create your first meeting to get started with AI analysis.'}
                        </p>
                        {!search && !statusFilter && (
                            <button className="btn btn-primary" onClick={() => navigate('/meetings/new')}>
                                <Plus size={16} /> Create Meeting
                            </button>
                        )}
                    </div>
                </motion.div>
            ) : viewMode === 'grid' ? (
                <div className="meetings-grid">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((m, i) => (
                            <motion.div
                                key={m.id}
                                className="card meeting-card"
                                onClick={() => navigate(`/meetings/${m.id}`)}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.2) }}
                                whileHover={{ y: -4 }}
                            >
                                <div className="mc-header">
                                    <div className="mc-icon"><Video size={18} /></div>
                                    <div className="mc-actions">
                                        {!m.has_analysis && (
                                            <button
                                                className="btn btn-ghost btn-sm mc-analyze"
                                                onClick={(e) => handleAnalyze(e, m.id)}
                                                disabled={analyzingIds.has(m.id)}
                                                title="Analyze with AI"
                                            >
                                                {analyzingIds.has(m.id) ? (
                                                    <Loader2 size={14} className="spin" />
                                                ) : (
                                                    <Sparkles size={14} />
                                                )}
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-sm mc-delete"
                                            onClick={(e) => handleDelete(e, m.id)}
                                            title="Delete meeting"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <div className="mc-title">{m.title}</div>
                                    <div className="mc-excerpt">
                                        {m.subtitle_count > 0
                                            ? `${m.subtitle_count} transcript lines`
                                            : 'No transcript'}
                                    </div>
                                </div>
                                <div className="mc-footer">
                                    <span className="mc-date">
                                        <Calendar size={12} />
                                        {new Date(m.created_at).toLocaleDateString()}
                                    </span>
                                    {analyzingIds.has(m.id) ? (
                                        <span className="badge badge-info">⏳ Analyzing…</span>
                                    ) : (
                                        <span className={`badge ${m.has_analysis ? 'badge-success' : 'badge-warning'}`}>
                                            {m.has_analysis ? '✓ Analyzed' : '⏳ Pending'}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <div className="meetings-list-view">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((m, i) => (
                            <motion.div
                                key={m.id}
                                className="meeting-list-item"
                                onClick={() => navigate(`/meetings/${m.id}`)}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 6 }}
                                transition={{ duration: 0.12, delay: Math.min(i * 0.015, 0.15) }}
                                whileHover={{ x: 3 }}
                            >
                                <div className="mli-icon">
                                    {m.has_analysis ? <Brain size={16} /> : <Video size={16} />}
                                </div>
                                <div className="mli-info">
                                    <div className="mli-title">{m.title}</div>
                                    <div className="mli-date">
                                        <Clock size={12} />
                                        {new Date(m.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                {!m.has_analysis && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={(e) => handleAnalyze(e, m.id)}
                                        disabled={analyzingIds.has(m.id)}
                                        title="Analyze with AI"
                                        style={{ marginRight: 8 }}
                                    >
                                        {analyzingIds.has(m.id) ? (
                                            <Loader2 size={14} className="spin" />
                                        ) : (
                                            <Sparkles size={14} />
                                        )}
                                    </button>
                                )}
                                <span className={`badge mli-status ${m.has_analysis ? 'badge-success' : 'badge-warning'}`}>
                                    {m.has_analysis ? 'analyzed' : 'pending'}
                                </span>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={(e) => handleDelete(e, m.id)}
                                    title="Delete meeting"
                                >
                                    <Trash2 size={14} />
                                </button>
                                <ChevronRight size={16} className="mli-arrow" />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
