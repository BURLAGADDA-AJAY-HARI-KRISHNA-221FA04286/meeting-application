import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingsAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, Search, Video, Calendar, Trash2, Grid3X3,
    List, ChevronRight, Filter, Brain, Clock
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
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sort, setSort] = useState('newest');
    const [viewMode, setViewMode] = useState('grid');

    const fetchMeetings = useCallback(() => {
        const params = {};
        if (search) params.search = search;
        if (statusFilter) params.status = statusFilter;
        meetingsAPI.list(params)
            .then(res => setMeetings(res.data))
            .catch(() => toast.error('Failed to load meetings'))
            .finally(() => setLoading(false));
    }, [search, statusFilter]);

    useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!confirm('Delete this meeting?')) return;
        try {
            await meetingsAPI.delete(id);
            toast.success('Meeting deleted');
            fetchMeetings();
        } catch {
            toast.error('Failed to delete');
        }
    };

    const sorted = [...meetings].sort((a, b) => {
        if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
        if (sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
        return (a.title || '').localeCompare(b.title || '');
    });

    const analyzed = meetings.filter(m => m.status === 'analyzed').length;
    const pending = meetings.length - analyzed;

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
                        {meetings.length} total  •  {analyzed} analyzed  •  {pending} pending
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
            {sorted.length === 0 ? (
                <motion.div className="card" {...fadeUp} transition={{ delay: 0.1 }}>
                    <div className="empty-state">
                        <Video size={48} className="empty-icon" />
                        <h3 className="empty-title">No meetings found</h3>
                        <p className="empty-text">Create your first meeting to get started with AI analysis.</p>
                        <button className="btn btn-primary" onClick={() => navigate('/meetings/new')}>
                            <Plus size={16} /> Create Meeting
                        </button>
                    </div>
                </motion.div>
            ) : viewMode === 'grid' ? (
                <div className="meetings-grid">
                    <AnimatePresence>
                        {sorted.map((m, i) => (
                            <motion.div
                                key={m.id}
                                className="card meeting-card"
                                onClick={() => navigate(`/meetings/${m.id}`)}
                                {...fadeUp}
                                transition={{ delay: 0.05 + i * 0.03 }}
                                layout
                                whileHover={{ y: -4 }}
                            >
                                <div className="mc-header">
                                    <div className="mc-icon"><Video size={18} /></div>
                                    <button
                                        className="btn btn-ghost btn-sm mc-delete"
                                        onClick={(e) => handleDelete(e, m.id)}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div>
                                    <div className="mc-title">{m.title}</div>
                                    <div className="mc-excerpt">
                                        {m.transcript ? m.transcript.substring(0, 120) + '…' : 'No transcript'}
                                    </div>
                                </div>
                                <div className="mc-footer">
                                    <span className="mc-date">
                                        <Calendar size={12} />
                                        {new Date(m.created_at).toLocaleDateString()}
                                    </span>
                                    <span className={`badge ${m.status === 'analyzed' ? 'badge-success' : 'badge-warning'}`}>
                                        {m.status === 'analyzed' ? '✓ Analyzed' : '⏳ Pending'}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <div className="meetings-list-view">
                    <AnimatePresence>
                        {sorted.map((m, i) => (
                            <motion.div
                                key={m.id}
                                className="meeting-list-item"
                                onClick={() => navigate(`/meetings/${m.id}`)}
                                {...fadeUp}
                                transition={{ delay: 0.02 + i * 0.02 }}
                                layout
                                whileHover={{ x: 3 }}
                            >
                                <div className="mli-icon">
                                    {m.status === 'analyzed' ? <Brain size={16} /> : <Video size={16} />}
                                </div>
                                <div className="mli-info">
                                    <div className="mli-title">{m.title}</div>
                                    <div className="mli-date">
                                        <Clock size={12} />
                                        {new Date(m.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <span className={`badge mli-status ${m.status === 'analyzed' ? 'badge-success' : 'badge-warning'}`}>
                                    {m.status || 'pending'}
                                </span>
                                <ChevronRight size={16} className="mli-arrow" />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
