import { useEffect, useState, useCallback, useMemo } from 'react';
import { tasksAPI, meetingsAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    SquareCheck, Circle, Loader, CheckCircle, ArrowRight,
    ArrowLeft, User, Filter, TriangleAlert, Clock, Plus,
    Trash2, Edit2, BarChart2, X, Save
} from 'lucide-react';
import toast from 'react-hot-toast';
import './TaskBoard.css';

const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
};

export default function TaskBoardPage() {
    const [tasks, setTasks] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('kanban'); // kanban | time-graph
    const [priorityFilter, setPriorityFilter] = useState('all');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        priority: 'medium',
        meeting_id: '',
        estimated_minutes: 30,
        time_spent: 0,
        status: 'todo',
        owner: '',
        due_date: '',
    });

    const fetchTasks = useCallback(async () => {
        const res = await tasksAPI.list({ limit: 200 });
        return res.data || [];
    }, []);

    const fetchMeetings = useCallback(async () => {
        const res = await meetingsAPI.list({ limit: 20 });
        return res.data || [];
    }, []);

    useEffect(() => {
        let active = true;

        const loadBoard = async () => {
            setLoading(true);
            let lastError = null;

            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const [taskRows, meetingRows] = await Promise.all([fetchTasks(), fetchMeetings()]);
                    if (!active) return;
                    setTasks(taskRows);
                    setMeetings(meetingRows);
                    return;
                } catch (err) {
                    lastError = err;
                    if (attempt < 2) {
                        await new Promise(resolve => setTimeout(resolve, 150));
                    }
                }
            }

            if (!active) return;
            const detail = lastError?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Failed to load tasks');
        };

        loadBoard().finally(() => {
            if (active) setLoading(false);
        });

        return () => {
            active = false;
        };
    }, [fetchTasks, fetchMeetings]);

    const handleSaveTask = async (e) => {
        e.preventDefault();
        if (!formData.title || !formData.meeting_id) {
            toast.error('Title and Meeting are required');
            return;
        }

        try {
            const payload = {
                ...formData,
                due_date: formData.due_date ? `${formData.due_date}T00:00:00` : null,
            };
            if (editingTask) {
                await tasksAPI.update(editingTask.id, payload);
                toast.success('Task updated');
            } else {
                await tasksAPI.create(payload);
                toast.success('Task created');
            }
            setIsModalOpen(false);
            setEditingTask(null);
            const refreshed = await fetchTasks();
            setTasks(refreshed);
        } catch (err) {
            toast.error(editingTask ? 'Failed to update task' : 'Failed to create task');
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            await tasksAPI.delete(taskId);
            toast.success('Task deleted');
            setTasks(prev => prev.filter(t => t.id !== taskId));
        } catch {
            toast.error('Failed to delete task');
        }
    };

    const openModal = (task = null) => {
        if (task) {
            setEditingTask(task);
            setFormData({
                title: task.title,
                priority: task.priority,
                meeting_id: task.meeting_id,
                estimated_minutes: task.estimated_minutes || 0,
                time_spent: task.time_spent || 0,
                status: task.status === 'in_progress' ? 'in-progress' : task.status,
                owner: task.owner || '',
                due_date: task.due_date ? String(task.due_date).slice(0, 10) : '',
            });
        } else {
            setEditingTask(null);
            setFormData({
                title: '',
                priority: 'medium',
                meeting_id: meetings[0]?.id || '',
                estimated_minutes: 30,
                time_spent: 0,
                status: 'todo',
                owner: '',
                due_date: '',
            });
        }
        setIsModalOpen(true);
    };

    const updateStatus = async (taskId, newStatus) => {
        try {
            await tasksAPI.update(taskId, { status: newStatus });
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
            toast.success('Status updated');
        } catch {
            toast.error('Failed to update status');
        }
    };

    const filtered = useMemo(() => priorityFilter === 'all'
        ? tasks
        : tasks.filter(t => (t.priority || '').toLowerCase() === priorityFilter),
        [tasks, priorityFilter]);

    const normalizeStatus = (status) => status === 'in_progress' ? 'in-progress' : (status || 'todo');

    const columns = [
        { id: 'todo', label: 'To Do', emoji: '📋', color: '#6366f1' },
        { id: 'in-progress', label: 'In Progress', emoji: '🔄', color: '#f59e0b' },
        { id: 'done', label: 'Done', emoji: '✅', color: '#10b981' },
    ];

    const getColumnTasks = (colId) => filtered.filter(t => normalizeStatus(t.status) === colId);

    // Stats
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const progress = total ? Math.round(done / total * 100) : 0;

    const priorityColor = (p) => {
        const pl = (p || '').toLowerCase();
        if (pl === 'high' || pl === 'critical') return '#ef4444';
        if (pl === 'medium') return '#f59e0b';
        return '#6366f1';
    };

    if (loading) return <div className="page-container"><div className="loading-screen"><div className="spinner" /></div></div>;

    return (
        <div className="page-container task-board-page">
            <motion.div className="page-header" {...fadeUp}>
                <div>
                    <h1 className="page-title">Task Board</h1>
                    <p className="page-subtitle">{total} tasks • {done} completed</p>
                </div>
                <div className="task-header-actions">
                    <div className="view-toggle">
                        <button className={`view-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')}><SquareCheck size={16} /> Board</button>
                        <button className={`view-btn ${viewMode === 'graph' ? 'active' : ''}`} onClick={() => setViewMode('graph')}><BarChart2 size={16} /> Time Graph</button>
                    </div>
                    <button className="btn btn-primary" onClick={() => openModal()}><Plus size={16} /> Add Task</button>
                </div>
            </motion.div>

            {/* ── Filters & Stats ── */}
            <motion.div className="task-controls-bar" {...fadeUp} transition={{ delay: 0.05 }}>
                <div className="priority-filter">
                    <Filter size={14} />
                    {['all', 'high', 'medium', 'low'].map(p => (
                        <button key={p} className={`filter-btn ${priorityFilter === p ? 'active' : ''}`} onClick={() => setPriorityFilter(p)}>
                            {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="task-stat-progress">
                    <div className="task-stat-bar">
                        <motion.div className="task-stat-fill" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
                    </div>
                    <span>{progress}% Done</span>
                </div>
            </motion.div>

            {/* ── Time Graph View ── */}
            {viewMode === 'graph' && (
                <motion.div className="time-graph-container" {...fadeUp}>
                    <h3>Task Time Analysis (Estimated vs Actual)</h3>
                    {filtered.map((task, i) => {
                        const est = task.estimated_minutes || 0;
                        const actual = task.time_spent || 0;
                        const maxVal = Math.max(est, actual, 60); // Min scale 60m
                        return (
                            <div key={task.id} className="graph-row">
                                <div className="graph-label">
                                    <span className="graph-task-title">{task.title}</span>
                                    <span className="graph-task-meta">{task.status} • {task.priority}</span>
                                </div>
                                <div className="graph-bars">
                                    {/* Establish scale */}
                                    <div className="graph-bar-track">
                                        <motion.div
                                            className="graph-bar-est"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(est / maxVal) * 100}%` }}
                                            title={`Estimated: ${est}m`}
                                        >
                                            <span className="bar-val">{est}m</span>
                                        </motion.div>
                                        <motion.div
                                            className="graph-bar-actual"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(actual / maxVal) * 100}%` }}
                                            title={`Actual: ${actual}m`}
                                            style={{ background: actual > est ? '#ef4444' : '#10b981' }}
                                        >
                                            <span className="bar-val">{actual}m</span>
                                        </motion.div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && <div className="empty-graph">No tasks to display</div>}
                </motion.div>
            )}

            {/* ── Kanban View ── */}
            {viewMode === 'kanban' && (
                <div className="kanban-board">
                    {columns.map((col, ci) => {
                        const colTasks = getColumnTasks(col.id);
                        return (
                            <motion.div key={col.id} className="kanban-column" {...fadeUp} transition={{ delay: 0.03 + ci * 0.03 }}>
                                <div className="kanban-column-header">
                                    <span className="kc-emoji">{col.emoji}</span>
                                    <span className="kc-title">{col.label}</span>
                                    <span className="kc-count">{colTasks.length}</span>
                                </div>
                                <div className="kanban-cards">
                                    <AnimatePresence>
                                        {colTasks.length === 0 ? (
                                            <div className="kanban-empty"><span>No tasks</span></div>
                                        ) : (
                                            colTasks.map((task, ti) => (
                                                <motion.div
                                                    key={task.id}
                                                    className="kanban-card"

                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    whileHover={{ y: -2 }}
                                                >
                                                    <div className="kcard-priority-line" style={{ background: priorityColor(task.priority) }} />
                                                    <div className="kcard-header">
                                                        <span className="kcard-title">{task.title}</span>
                                                        <div className="kcard-actions-mini">
                                                            <button onClick={() => openModal(task)} title="Edit"><Edit2 size={12} /></button>
                                                            <button onClick={() => handleDeleteTask(task.id)} className="danger" title="Delete"><Trash2 size={12} /></button>
                                                        </div>
                                                    </div>
                                                    <div className="kcard-meta">
                                                        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
                                                        <span className="kcard-time" title="Est. vs Actual">
                                                            <Clock size={12} /> {task.estimated_minutes || 0}m / {task.time_spent || 0}m
                                                        </span>
                                                        {task.due_date && (
                                                            <span className="kcard-time" title="Due date">
                                                                Due {new Date(task.due_date).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="kcard-actions">
                                                        {col.id === 'in-progress' && <button className="btn-icon" onClick={() => updateStatus(task.id, 'todo')} title="Move to To Do"><ArrowLeft size={12} /></button>}
                                                        {col.id === 'done' && <button className="btn-icon" onClick={() => updateStatus(task.id, 'in-progress')} title="Move to In Progress"><ArrowLeft size={12} /></button>}
                                                        {col.id === 'todo' && <button className="btn-icon" onClick={() => updateStatus(task.id, 'in-progress')} title="Move to In Progress"><ArrowRight size={12} /></button>}
                                                        {col.id === 'in-progress' && <button className="btn-icon" onClick={() => updateStatus(task.id, 'done')} title="Move to Done"><ArrowRight size={12} /></button>}
                                                    </div>
                                                </motion.div>
                                            ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* ── Modal ── */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                        <motion.div className="modal-content" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingTask ? 'Edit Task' : 'New Task'}</h2>
                                <button className="btn-close" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                            </div>
                            <form onSubmit={handleSaveTask} className="modal-form">
                                <div className="form-group">
                                    <label>Task Title</label>
                                    <input className="input" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Meeting (Project)</label>
                                        <select className="input" value={formData.meeting_id} onChange={e => setFormData({ ...formData, meeting_id: e.target.value })} required>
                                            <option value="">Select Meeting...</option>
                                            {meetings.map(m => (
                                                <option key={m.id} value={m.id}>{m.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Priority</label>
                                        <select className="input" value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })}>
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Estimated (min)</label>
                                        <input type="number" className="input" value={formData.estimated_minutes} onChange={e => setFormData({ ...formData, estimated_minutes: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label>Time Spent (min)</label>
                                        <input type="number" className="input" value={formData.time_spent} onChange={e => setFormData({ ...formData, time_spent: Number(e.target.value) })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Assignee</label>
                                    <input className="input" value={formData.owner} onChange={e => setFormData({ ...formData, owner: e.target.value })} placeholder="e.g. John Doe" />
                                </div>
                                <div className="form-group">
                                    <label>Due Date</label>
                                    <input type="date" className="input" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary"><Save size={16} /> Save Task</button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
