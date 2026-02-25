import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { meetingsAPI, aiAPI, tasksAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Brain, RefreshCw, Download, SquareCheck,
    Send, Sparkles, TriangleAlert, Target, MessageSquare,
    BarChart3, ChevronDown, ChevronUp, User, Bot, Clock,
    FileText, Github, Calendar, Copy, Check, BookOpen,
    Lightbulb, AlertCircle, FileDown
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
    const [copied, setCopied] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => {
        loadMeeting();
    }, [id]);

    const loadMeeting = async () => {
        try {
            const res = await meetingsAPI.get(id);
            setMeeting(res.data);

            // If analysis exists, load it
            if (res.data.has_analysis) {
                try {
                    const aRes = await aiAPI.getResults(id);
                    if (aRes.data.status === 'complete' || aRes.data.status === 'cached') {
                        setAnalysis(aRes.data);
                    }
                } catch { }
            }
        } catch {
            toast.error('Failed to load meeting');
            navigate('/meetings');
        } finally {
            setLoading(false);
        }
    };

    const handleAnalyze = async (force = false) => {
        setAnalyzing(true);
        const toastId = toast.loading('Running AI analysis... This takes 10-30 seconds');
        try {
            const res = await aiAPI.analyze(id, force);
            setAnalysis(res.data);
            toast.success('AI analysis complete! Check each tab for results.', { id: toastId });
            // Reload meeting to update has_analysis flag
            const mRes = await meetingsAPI.get(id);
            setMeeting(mRes.data);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Analysis failed. Check if Gemini API key is configured.', { id: toastId });
        } finally {
            setAnalyzing(false);
        }
    };

    const handleGenerateTasks = async () => {
        const toastId = toast.loading('Generating tasks from action items...');
        try {
            const res = await tasksAPI.generate(id);
            toast.success(`Tasks generated! Go to Tasks page to view.`, { id: toastId });
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Task generation failed', { id: toastId });
        }
    };

    const handleExportGithub = async () => {
        const token = localStorage.getItem('github_token');
        const repo = localStorage.getItem('github_repo');

        if (!token) {
            toast.error('Please configure GitHub Token in Settings first');
            return;
        }

        const targetRepo = prompt("Enter repository name (owner/repo):", repo || "owner/repo");
        if (!targetRepo) return;
        if (targetRepo !== repo) localStorage.setItem('github_repo', targetRepo);

        const toastId = toast.loading('Exporting to GitHub...');
        try {
            const res = await tasksAPI.generate(id); // ensure tasks exist
            toast.success(`Exported to ${targetRepo}`, { id: toastId });
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Export failed', { id: toastId });
        }
    };

    const handleDownloadICS = () => {
        const title = meeting.title || 'Meeting';
        const description = `Meeting Analysis: ${document.location.href}\n\nSummary:\n${analysis?.summary || 'No summary yet.'}`;
        const date = new Date(meeting.created_at);
        const endDate = new Date(date.getTime() + 60 * 60 * 1000);

        const icsContent = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MeetingAI//EN',
            'BEGIN:VEVENT',
            `UID:${meeting.id}@meeting.ai`,
            `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
            `DTSTART:${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
            `DTEND:${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
            `SUMMARY:${title}`,
            `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
            'END:VEVENT', 'END:VCALENDAR'
        ].join('\r\n');

        meetingsAPI.downloadClientFile(icsContent, `${title.replace(/\s+/g, '_')}.ics`, 'text/calendar');
        toast.success('Calendar file downloaded!');
    };

    const handleDownloadReport = () => {
        meetingsAPI.downloadReport(id);
        toast.success('Downloading report...');
    };

    const handleAddToCalendar = () => {
        const title = encodeURIComponent(meeting.title || 'Meeting');
        const details = encodeURIComponent(`Meeting Analysis: ${document.location.href}`);
        const date = new Date(meeting.created_at);
        const endDate = new Date(date.getTime() + 60 * 60 * 1000);
        const start = date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const end = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${start}/${end}`, '_blank');
    };

    /* ── RAG Chat ── */
    const handleChat = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const question = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: question }]);
        setChatLoading(true);
        try {
            const res = await aiAPI.ragQuery(id, question);
            const answer = res.data.answer || res.data.response || 'No response';
            const evidence = res.data.evidence || [];
            setChatMessages(prev => [...prev, {
                role: 'ai',
                content: answer,
                evidence: evidence,
                chunks: res.data.chunks_searched || 0,
            }]);
        } catch (err) {
            setChatMessages(prev => [...prev, {
                role: 'ai',
                content: 'Sorry, I couldn\'t process that question. Make sure the meeting has been analyzed first.',
            }]);
        } finally {
            setChatLoading(false);
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    };

    const copyTranscript = () => {
        navigator.clipboard.writeText(meeting.transcript || '');
        setCopied(true);
        toast.success('Transcript copied!');
        setTimeout(() => setCopied(false), 2000);
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

    const hasAnalysis = meeting.has_analysis && analysis;

    const tabs = [
        { id: 'summary', label: 'Summary', icon: FileText, desc: 'AI-generated summary & key points' },
        { id: 'chat', label: 'Ask AI', icon: MessageSquare, desc: 'Ask questions about this meeting' },
    ];

    const a = analysis || {};

    const suggestions = [
        'What were the key decisions made?',
        'Who has action items and what are they?',
        'Are there any unresolved issues?',
        'Summarize this meeting in 3 bullet points',
        'What risks were discussed?',
        'What is the overall tone of the meeting?',
    ];

    // Helper to safely get arrays from analysis (handles both dict-wrapped and direct arrays)
    const getAnalysisArray = (key) => {
        const val = a[key];
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
            // Check if it's wrapped like { "items": [...] } or { "action_items": [...] }
            const keys = Object.keys(val);
            for (const k of keys) {
                if (Array.isArray(val[k])) return val[k];
            }
        }
        return [];
    };

    const getSummaryText = () => {
        const s = a.summary;
        if (!s) return null;
        if (typeof s === 'string') return s;
        if (typeof s === 'object') {
            // Try prioritized fields
            const text = s.executive_summary || s.summary || s.text || s.overview;
            if (text && text.trim()) return text;
            // If all fields empty, check key_points
            if (s.key_points && s.key_points.length > 0) {
                return 'Key Points:\n• ' + s.key_points.join('\n• ');
            }
            return null;
        }
        return String(s);
    };

    const getKeyPoints = () => {
        const s = a.summary;
        if (!s || typeof s !== 'object') return [];
        return s.key_points || s.topics_discussed || [];
    };

    const getDecisions = () => {
        if (a.decisions) {
            const d = a.decisions;
            if (Array.isArray(d)) return d;
            if (typeof d === 'object') {
                const keys = Object.keys(d);
                for (const k of keys) {
                    if (Array.isArray(d[k])) return d[k];
                }
            }
        }
        // Also check inside summary object
        if (a.summary && typeof a.summary === 'object') {
            return a.summary.key_decisions || a.summary.decisions || [];
        }
        return [];
    };

    return (
        <div className="page-container">
            {/* ── Header ── */}
            <motion.div className="detail-header" {...fadeUp}>
                <div>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/meetings')} style={{ marginBottom: 8 }}>
                        <ArrowLeft size={16} /> Back to meetings
                    </button>
                    <h1 className="page-title">{meeting.title}</h1>
                    <div className="page-subtitle" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={14} />
                            {new Date(meeting.created_at).toLocaleString()}
                        </span>
                        <span className={`badge ${hasAnalysis ? 'badge-success' : 'badge-warning'}`}>
                            {hasAnalysis ? '✓ Analyzed' : '⏳ Pending Analysis'}
                        </span>
                        {meeting.subtitle_count > 0 && (
                            <span className="badge badge-info">{meeting.subtitle_count} transcript lines</span>
                        )}
                    </div>
                </div>
                <div className="detail-actions">
                    {!hasAnalysis ? (
                        <motion.button
                            className="btn btn-primary btn-lg"
                            onClick={() => handleAnalyze(false)}
                            disabled={analyzing}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {analyzing ? <><div className="spinner" /> Analyzing...</> : <><Brain size={16} /> Analyze with AI</>}
                        </motion.button>
                    ) : (
                        <>
                            <button className="btn btn-secondary" onClick={() => handleAnalyze(true)} disabled={analyzing} title="Re-analyze">
                                <RefreshCw size={14} className={analyzing ? 'spin' : ''} /> Re-analyze
                            </button>
                            <button className="btn btn-primary" onClick={handleDownloadReport} title="Download full analysis as text report">
                                <FileDown size={14} /> Download Report
                            </button>
                            <button className="btn btn-secondary" onClick={handleGenerateTasks} title="Generate tasks from action items → Tasks page">
                                <SquareCheck size={14} /> Generate Tasks
                            </button>
                            <button className="btn btn-secondary" onClick={handleAddToCalendar} title="Add to Google Calendar">
                                <Calendar size={14} /> Calendar
                            </button>
                            <button className="btn btn-secondary" onClick={handleDownloadICS} title="Download .ics file">
                                <Download size={14} /> ICS
                            </button>
                        </>
                    )}
                </div>
            </motion.div>

            {/* ── Transcript (collapsible) ── */}
            <motion.div className="card transcript-section" {...fadeUp} transition={{ delay: 0.05 }}>
                <div className="transcript-toggle" onClick={() => setShowTranscript(!showTranscript)} role="button" tabIndex={0}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                        <FileText size={18} /> Transcript
                        {meeting.transcript && <span className="badge badge-info" style={{ fontWeight: 500, fontSize: '0.7rem' }}>
                            {meeting.transcript.length.toLocaleString()} chars
                        </span>}
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {meeting.transcript && (
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={(e) => { e.stopPropagation(); copyTranscript(); }}
                                style={{ padding: '4px 8px' }}
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        )}
                        {showTranscript ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </div>
                <AnimatePresence>
                    {showTranscript && (
                        <motion.div
                            className="transcript-content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <pre>{meeting.transcript || 'No transcript available. Upload a transcript or have a video call with captions enabled.'}</pre>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* ── Analysis CTA or Results ── */}
            {!hasAnalysis ? (
                <motion.div className="card" {...fadeUp} transition={{ delay: 0.1 }}>
                    <div className="empty-state analyze-cta">
                        <div className="analyze-cta-icon">
                            <Brain size={40} />
                        </div>
                        <h3 className="empty-title">Ready for AI Analysis</h3>
                        <p className="empty-text">
                            Click <strong>"Analyze with AI"</strong> to extract:
                        </p>
                        <div className="analyze-features">
                            <div className="analyze-feature"><Sparkles size={16} /> Executive Summary & Key Points</div>
                            <div className="analyze-feature"><MessageSquare size={16} /> AI Chat — ask questions about this meeting</div>
                        </div>
                        <motion.button
                            className="btn btn-primary btn-lg"
                            onClick={() => handleAnalyze(false)}
                            disabled={analyzing}
                            whileHover={{ scale: 1.03 }}
                            style={{ marginTop: 16 }}
                        >
                            {analyzing ? <><div className="spinner" /> Analyzing...</> : <><Sparkles size={18} /> Analyze Now</>}
                        </motion.button>
                    </div>
                </motion.div>
            ) : (
                <motion.div {...fadeUp} transition={{ delay: 0.1 }}>
                    {/* Analysis Tabs */}
                    <div className="analysis-tabs">
                        {tabs.map(t => (
                            <button
                                key={t.id}
                                className={`analysis-tab ${activeTab === t.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(t.id)}
                                title={t.desc}
                            >
                                <t.icon size={16} /> {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="analysis-content">
                        <AnimatePresence mode="wait">
                            {/* ═══ SUMMARY TAB ═══ */}
                            {activeTab === 'summary' && (
                                <motion.div key="summary" {...fadeUp} transition={{ duration: 0.2 }}>
                                    <div className="analysis-grid">
                                        <div className="card analysis-card">
                                            <div className="ac-title"><Sparkles size={16} style={{ color: 'var(--accent-primary)' }} /> Executive Summary</div>
                                            <p className="ac-summary-text" style={{ whiteSpace: 'pre-wrap' }}>
                                                {getSummaryText() || 'No summary available yet. Click "Re-analyze" to generate one with the latest AI model.'}
                                            </p>
                                        </div>
                                        <div className="card analysis-card">
                                            <div className="ac-title"><Lightbulb size={16} style={{ color: '#f59e0b' }} /> Key Points</div>
                                            <ul className="ac-list">
                                                {getKeyPoints().length > 0 ?
                                                    getKeyPoints().map((p, i) => (
                                                        <li key={i}>{typeof p === 'string' ? p : (p.point || p.text || JSON.stringify(p))}</li>
                                                    )) :
                                                    getDecisions().length > 0 ?
                                                        getDecisions().map((d, i) => (
                                                            <li key={i}>{typeof d === 'string' ? d : (d.decision || d.text || JSON.stringify(d))}</li>
                                                        )) :
                                                        <li className="ac-empty">No key points extracted yet</li>
                                                }
                                            </ul>
                                        </div>
                                    </div>
                                </motion.div>
                            )}



                            {/* ═══ AI CHAT (RAG) TAB ═══ */}
                            {activeTab === 'chat' && (
                                <motion.div key="chat" {...fadeUp} transition={{ duration: 0.2 }}>
                                    <div className="chat-container">
                                        <div className="chat-messages">
                                            {chatMessages.length === 0 ? (
                                                <div className="chat-empty">
                                                    <Brain size={40} style={{ color: 'var(--accent-primary)', opacity: 0.5 }} />
                                                    <h3 className="empty-title">Ask AI About This Meeting</h3>
                                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 400, lineHeight: 1.6 }}>
                                                        This uses <strong>RAG (Retrieval-Augmented Generation)</strong> to search through
                                                        your meeting transcript and provide answers with evidence from the actual conversation.
                                                    </p>
                                                    <div className="chat-suggestions">
                                                        {suggestions.map(s => (
                                                            <button
                                                                key={s}
                                                                className="chat-suggestion"
                                                                onClick={() => setChatInput(s)}
                                                            >
                                                                <Lightbulb size={12} /> {s}
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
                                                            {/* Show evidence citations from RAG */}
                                                            {msg.evidence && msg.evidence.length > 0 && (
                                                                <div className="chat-evidence">
                                                                    <div className="chat-evidence-title">
                                                                        <BookOpen size={12} /> Evidence from transcript ({msg.chunks} chunks searched)
                                                                    </div>
                                                                    {msg.evidence.slice(0, 3).map((ev, j) => (
                                                                        <div key={j} className="chat-evidence-item">
                                                                            {ev.speaker && <span className="chat-evidence-speaker">{ev.speaker}:</span>}
                                                                            <span className="chat-evidence-text">{ev.text || ev.content}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                            {chatLoading && (
                                                <div className="chat-msg ai">
                                                    <div className="chat-msg-avatar"><Bot size={16} /></div>
                                                    <div className="chat-msg-content">
                                                        <div className="chat-msg-text" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <div className="spinner" /> Searching transcript & generating answer…
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            <div ref={chatEndRef} />
                                        </div>
                                        <form className="chat-input-form" onSubmit={handleChat}>
                                            <input
                                                className="input"
                                                placeholder="Ask anything about this meeting…"
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
