import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { meetingsAPI, aiAPI, tasksAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Brain, RefreshCw, Download, CheckSquare,
    Send, Sparkles, AlertTriangle, Target, MessageSquare,
    BarChart3, ChevronDown, ChevronUp, User, Bot, Clock,
    FileText, Github
} from 'lucide-react';
import toast from 'react-hot-toast';
import './MeetingDetail.css';

const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
};

export default function MeetingDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [meeting, setMeeting] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [activeTab, setActiveTab] = useState('summary');
    const [showTranscript, setShowTranscript] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => {
        loadMeeting();
    }, [id]);

    const loadMeeting = async () => {
        try {
            const res = await meetingsAPI.get(id);
            setMeeting(res.data);
            if (res.data.status === 'analyzed') {
                try {
                    const aRes = await aiAPI.getResults(id);
                    setAnalysis(aRes.data);
                } catch { }
            }
        } catch {
            toast.error('Failed to load meeting');
            navigate('/meetings');
        } finally {
            setLoading(false);
        }
    };

    const handleAnalyze = async () => {
        setAnalyzing(true);
        try {
            await aiAPI.analyze(id);
            toast.success('Analysis complete!');
            loadMeeting();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Analysis failed');
        } finally {
            setAnalyzing(false);
        }
    };

    const handleGenerateTasks = async () => {
        try {
            await tasksAPI.generate(id);
            toast.success('Tasks generated!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Task generation failed');
        }
    };

    const handleChat = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const question = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: question }]);
        setChatLoading(true);
        try {
            const res = await aiAPI.ragQuery(id, question);
            setChatMessages(prev => [...prev, { role: 'ai', content: res.data.answer || res.data.response || 'No response' }]);
        } catch {
            setChatMessages(prev => [...prev, { role: 'ai', content: 'Sorry, I couldn\'t process that question.' }]);
        } finally {
            setChatLoading(false);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    };

    const handleSuggestion = (q) => {
        setChatInput(q);
    };

    if (loading) {
        return (
            <div className="page-container">
                <div className="loading-screen">
                    <div className="spinner spinner-lg" />
                    <span>Loading meeting…</span>
                </div>
            </div>
        );
    }

    if (!meeting) return null;

    const tabs = [
        { id: 'summary', label: 'Summary', icon: FileText },
        { id: 'actions', label: 'Actions', icon: Target },
        { id: 'risks', label: 'Risks', icon: AlertTriangle },
        { id: 'sentiment', label: 'Sentiment', icon: BarChart3 },
        { id: 'chat', label: 'AI Chat', icon: MessageSquare },
    ];

    const a = analysis || {};

    const suggestions = [
        'What were the key decisions?',
        'Who has action items?',
        'Any unresolved issues?',
        'Summarize in 3 bullets',
    ];

    return (
        <div className="page-container">
            {/* ── Header ── */}
            <motion.div className="detail-header" {...fadeUp}>
                <div>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/meetings')} style={{ marginBottom: 8 }}>
                        <ArrowLeft size={16} /> Back to meetings
                    </button>
                    <h1 className="page-title">{meeting.title}</h1>
                    <div className="page-subtitle" style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={14} />
                            {new Date(meeting.created_at).toLocaleString()}
                        </span>
                        <span className={`badge ${meeting.status === 'analyzed' ? 'badge-success' : 'badge-warning'}`}>
                            {meeting.status || 'pending'}
                        </span>
                    </div>
                </div>
                <div className="detail-actions">
                    {meeting.status !== 'analyzed' ? (
                        <motion.button
                            className="btn btn-primary"
                            onClick={handleAnalyze}
                            disabled={analyzing}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {analyzing ? <div className="spinner" /> : <><Brain size={16} /> Analyze with AI</>}
                        </motion.button>
                    ) : (
                        <>
                            <button className="btn btn-secondary" onClick={handleAnalyze} disabled={analyzing}>
                                <RefreshCw size={14} className={analyzing ? 'spin' : ''} /> Re-analyze
                            </button>
                            <button className="btn btn-secondary" onClick={handleGenerateTasks}>
                                <CheckSquare size={14} /> Generate Tasks
                            </button>
                        </>
                    )}
                </div>
            </motion.div>

            {/* ── Transcript ── */}
            <motion.div className="card transcript-section" {...fadeUp} transition={{ delay: 0.05 }}>
                <button className="transcript-toggle" onClick={() => setShowTranscript(!showTranscript)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                        <FileText size={18} /> Transcript
                    </span>
                    {showTranscript ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence>
                    {showTranscript && (
                        <motion.div
                            className="transcript-content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <pre>{meeting.transcript || 'No transcript available'}</pre>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* ── Analysis or CTA ── */}
            {meeting.status !== 'analyzed' ? (
                <motion.div className="card" {...fadeUp} transition={{ delay: 0.1 }}>
                    <div className="empty-state analyze-cta">
                        <div className="analyze-cta-icon">
                            <Brain size={36} />
                        </div>
                        <h3 className="empty-title">Ready for AI Analysis</h3>
                        <p className="empty-text">
                            Click "Analyze with AI" to extract summaries, action items, risks, and sentiment from this meeting.
                        </p>
                        <motion.button
                            className="btn btn-primary btn-lg"
                            onClick={handleAnalyze}
                            disabled={analyzing}
                            whileHover={{ scale: 1.03 }}
                        >
                            {analyzing ? <div className="spinner" /> : <><Sparkles size={18} /> Start Analysis</>}
                        </motion.button>
                    </div>
                </motion.div>
            ) : (
                <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
                    {/* Tabs */}
                    <div className="analysis-tabs">
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                className={`analysis-tab ${activeTab === t.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(t.id)}
                            >
                                <t.icon size={16} /> {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="analysis-content">
                        <AnimatePresence mode="wait">
                            {activeTab === 'summary' && (
                                <motion.div key="summary" {...fadeUp} transition={{ duration: 0.2 }}>
                                    <div className="analysis-grid">
                                        <div className="card analysis-card">
                                            <div className="ac-title"><Sparkles size={16} style={{ color: 'var(--accent-primary)' }} /> Summary</div>
                                            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                                                {a.summary || 'No summary available'}
                                            </p>
                                        </div>
                                        <div className="card analysis-card">
                                            <div className="ac-title"><Target size={16} style={{ color: '#10b981' }} /> Key Decisions</div>
                                            <ul className="ac-list">
                                                {(a.decisions || a.key_decisions || []).length > 0 ?
                                                    (a.decisions || a.key_decisions || []).map((d, i) => <li key={i}>{d}</li>) :
                                                    <li className="ac-empty">No decisions extracted</li>
                                                }
                                            </ul>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'actions' && (
                                <motion.div key="actions" {...fadeUp} transition={{ duration: 0.2 }}>
                                    <div className="card analysis-card">
                                        <div className="ac-title"><Target size={16} style={{ color: '#6366f1' }} /> Action Items</div>
                                        <ul className="ac-list">
                                            {(a.action_items || []).length > 0 ?
                                                (a.action_items || []).map((item, i) => (
                                                    <li key={i}>
                                                        {typeof item === 'string' ? item : (
                                                            <><strong>{item.assignee || 'Unassigned'}:</strong> {item.task || item.description || JSON.stringify(item)}</>
                                                        )}
                                                    </li>
                                                )) :
                                                <li className="ac-empty">No action items found</li>
                                            }
                                        </ul>
                                    </div>
                                </motion.div>
                            )}

                            {activeTab === 'risks' && (
                                <motion.div key="risks" {...fadeUp} transition={{ duration: 0.2 }}>
                                    {(a.risks || []).length > 0 ? (
                                        <div className="risks-grid">
                                            {(a.risks || []).map((r, i) => {
                                                const severity = (r.severity || r.level || 'medium').toLowerCase();
                                                return (
                                                    <motion.div
                                                        key={i}
                                                        className={`card risk-card risk-${severity}`}
                                                        initial={{ opacity: 0, y: 12 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                    >
                                                        <div className="risk-header">
                                                            <AlertTriangle size={16} />
                                                            <span className={`badge badge-${severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'info'}`}>
                                                                {severity}
                                                            </span>
                                                        </div>
                                                        {r.type && <div className="risk-type">{r.type}</div>}
                                                        <div className="risk-desc">
                                                            {typeof r === 'string' ? r : (r.description || r.risk || JSON.stringify(r))}
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="card">
                                            <div className="empty-state" style={{ padding: '40px' }}>
                                                <AlertTriangle size={32} className="empty-icon" />
                                                <p className="empty-text">No risks detected in this meeting.</p>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {activeTab === 'sentiment' && (
                                <motion.div key="sentiment" {...fadeUp} transition={{ duration: 0.2 }}>
                                    {(a.sentiment || a.sentiments || []).length > 0 ? (
                                        <div className="sentiment-grid">
                                            {(a.sentiment || a.sentiments || []).map((s, i) => {
                                                const score = s.score || s.confidence || 0.5;
                                                const sentimentColor = score > 0.6 ? '#10b981' : score > 0.4 ? '#f59e0b' : '#ef4444';
                                                return (
                                                    <motion.div
                                                        key={i}
                                                        className="card sentiment-card"
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ delay: i * 0.05 }}
                                                    >
                                                        <div className="sent-header">
                                                            <div className="sent-avatar">
                                                                {(s.speaker || s.participant || 'U')[0].toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div className="sent-name">{s.speaker || s.participant || 'Unknown'}</div>
                                                                <div className="sent-confidence">
                                                                    {s.sentiment || s.label || 'Neutral'} • {Math.round(score * 100)}%
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="sent-bar">
                                                            <div
                                                                className="sent-bar-fill"
                                                                style={{
                                                                    width: `${score * 100}%`,
                                                                    background: sentimentColor,
                                                                    color: sentimentColor,
                                                                }}
                                                            />
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="card">
                                            <div className="empty-state" style={{ padding: '40px' }}>
                                                <BarChart3 size={32} className="empty-icon" />
                                                <p className="empty-text">No sentiment data available.</p>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {activeTab === 'chat' && (
                                <motion.div key="chat" {...fadeUp} transition={{ duration: 0.2 }}>
                                    <div className="chat-container">
                                        <div className="chat-messages">
                                            {chatMessages.length === 0 ? (
                                                <div className="chat-empty">
                                                    <Brain size={40} style={{ color: 'var(--accent-primary)', opacity: 0.5 }} />
                                                    <h3 className="empty-title">Ask AI about this meeting</h3>
                                                    <p>Ask questions and get AI-powered answers based on the meeting transcript and analysis.</p>
                                                    <div className="chat-suggestions">
                                                        {suggestions.map(s => (
                                                            <button
                                                                key={s}
                                                                className="chat-suggestion"
                                                                onClick={() => handleSuggestion(s)}
                                                            >
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                chatMessages.map((msg, i) => (
                                                    <div key={i} className={`chat-msg ${msg.role}`}>
                                                        <div className="chat-msg-avatar">
                                                            {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                                        </div>
                                                        <div className="chat-msg-content">
                                                            <div className="chat-msg-text">{msg.content}</div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                            {chatLoading && (
                                                <div className="chat-msg ai">
                                                    <div className="chat-msg-avatar"><Bot size={16} /></div>
                                                    <div className="chat-msg-content">
                                                        <div className="chat-msg-text" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <div className="spinner" /> Thinking…
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            <div ref={chatEndRef} />
                                        </div>
                                        <form className="chat-input-form" onSubmit={handleChat}>
                                            <input
                                                className="input"
                                                placeholder="Ask a question about this meeting…"
                                                value={chatInput}
                                                onChange={e => setChatInput(e.target.value)}
                                                disabled={chatLoading}
                                            />
                                            <motion.button
                                                className="btn btn-primary"
                                                type="submit"
                                                disabled={chatLoading || !chatInput.trim()}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                <Send size={16} />
                                            </motion.button>
                                        </form>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
