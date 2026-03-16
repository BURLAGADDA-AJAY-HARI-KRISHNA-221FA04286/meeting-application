import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { meetingsAPI, aiAPI, tasksAPI, githubAPI, jiraAPI, linearAPI } from '../api';
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
    const [transcriptSearch, setTranscriptSearch] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const chatEndRef = useRef(null);

    const [meetingStats, setMeetingStats] = useState(null);

    useEffect(() => {
        loadMeeting();
    }, [id]);

    const loadMeeting = async () => {
        try {
            const res = await meetingsAPI.get(id);
            setMeeting(res.data);
            
            // Fetch stats in parallel
            meetingsAPI.getStats(id).then(r => setMeetingStats(r)).catch(() => {});

            // If analysis exists, load it
            if (res.data.has_analysis) {
                try {
                    const aRes = await aiAPI.getResults(id);
                    if (aRes.data.status === 'complete' || aRes.data.status === 'cached') {
                        setAnalysis(aRes.data);
                    }
                } catch {
                    // Skip silently; meeting detail still renders without cached analysis payload.
                }
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
        const toastId = toast.loading('Running AI analysis in background... Please wait.');
        try {
            const res = await aiAPI.analyze(id, force);

            if (res.data.status === 'processing' && res.data.job_id) {
                let attempts = 0;
                const pollInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const statusRes = await aiAPI.jobStatus(res.data.job_id);
                        const job = statusRes.data;
                        
                        if (job.status === 'completed') {
                            clearInterval(pollInterval);
                            const finalRes = await aiAPI.getResults(id);
                            setAnalysis(finalRes.data);
                            toast.success('AI analysis complete! Check tabs for results.', { id: toastId });
                            const mRes = await meetingsAPI.get(id);
                            setMeeting(mRes.data);
                            setAnalyzing(false);
                        } else if (job.status === 'failed') {
                            clearInterval(pollInterval);
                            toast.error(`Analysis failed: ${job.error || 'Unknown error'}`, { id: toastId });
                            setAnalyzing(false);
                        } else if (attempts > 60) {
                            clearInterval(pollInterval);
                            toast.error('Analysis is taking too long. Check back later.', { id: toastId });
                            setAnalyzing(false);
                        }
                        // If 'pending' or 'processing', do nothing, just wait.
                    } catch (err) {
                        console.error('Job polling error', err);
                    }
                }, 2000);
            } else {
                setAnalysis(res.data);
                toast.success('AI analysis complete! Check each tab for results.', { id: toastId });
                const mRes = await meetingsAPI.get(id);
                setMeeting(mRes.data);
                setAnalyzing(false);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Analysis failed.', { id: toastId });
            setAnalyzing(false);
        }
    };

    const handleGenerateTasks = async () => {
        const toastId = toast.loading('Generating tasks from action items...');
        try {
            await tasksAPI.generate(id);
            toast.success(`Tasks generated! Go to Tasks page to view.`, { id: toastId });
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Task generation failed', { id: toastId });
        }
    };

    const handleExportGithub = async () => {
        const token = sessionStorage.getItem('github_token') || localStorage.getItem('github_token');
        const repo = sessionStorage.getItem('github_repo') || localStorage.getItem('github_repo');

        if (!token) {
            toast.error('Please configure GitHub Token in Settings first');
            return;
        }

        const targetRepo = prompt("Enter repository name (owner/repo):", repo || "owner/repo");
        if (!targetRepo) return;
        if (targetRepo !== repo) sessionStorage.setItem('github_repo', targetRepo);

        const toastId = toast.loading('Exporting to GitHub...');
        try {
            await tasksAPI.generate(id); // ensure tasks exist
            await githubAPI.exportTasks(id, targetRepo, null, token);
            toast.success(`Exported to ${targetRepo}`, { id: toastId });
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Export failed', { id: toastId });
        }
    };

    const handleExportJira = async () => {
        const savedBaseUrl = sessionStorage.getItem('jira_base_url') || localStorage.getItem('jira_base_url') || '';
        const savedProjectKey = sessionStorage.getItem('jira_project_key') || localStorage.getItem('jira_project_key') || '';
        const savedEmail = sessionStorage.getItem('jira_email') || localStorage.getItem('jira_email') || '';
        const savedToken = sessionStorage.getItem('jira_api_token') || localStorage.getItem('jira_api_token') || '';

        const baseUrl = prompt('Jira Base URL (https://your-company.atlassian.net)', savedBaseUrl);
        if (!baseUrl) return;
        const projectKey = prompt('Jira Project Key (example: ENG)', savedProjectKey || 'ENG');
        if (!projectKey) return;
        const email = prompt('Jira account email', savedEmail);
        if (!email) return;
        const token = prompt('Jira API token', savedToken);
        if (!token) return;

        sessionStorage.setItem('jira_base_url', baseUrl);
        sessionStorage.setItem('jira_project_key', projectKey);
        sessionStorage.setItem('jira_email', email);
        sessionStorage.setItem('jira_api_token', token);

        const toastId = toast.loading('Exporting to Jira...');
        try {
            await tasksAPI.generate(id);
            const res = await jiraAPI.exportTasks(id, {
                base_url: baseUrl,
                project_key: projectKey,
                email,
                token,
            });
            toast.success(`Exported ${res.data.exported}/${res.data.total} issues to Jira`, { id: toastId });
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Jira export failed', { id: toastId });
        }
    };

    const handleExportLinear = async () => {
        const toastId = toast.loading('Exporting to Linear...');
        try {
            await tasksAPI.generate(id); // ensure tasks exist
            const res = await linearAPI.exportTasks(id);
            toast.success(`Exported ${res.data.exported}/${res.data.total} issues to Linear`, { id: toastId });
        } catch (err) {
            const detail = err.response?.data?.detail || 'Linear export failed';
            if (detail.includes('not connected')) {
                toast.error('Linear not connected. Redirecting to connect...', { id: toastId });
                try {
                    const urlRes = await linearAPI.getAuthUrl();
                    window.location.href = urlRes.data.auth_url;
                } catch {
                    toast.error('Could not get Linear auth URL. Check server config.');
                }
            } else {
                toast.error(detail, { id: toastId });
            }
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
            const { API_BASE, getAccessToken } = await import('../api.js');
            const res = await fetch(`${API_BASE}/ai/${id}/rag-query-stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getAccessToken()}`,
                },
                body: JSON.stringify({ question })
            });

            if (!res.ok) throw new Error('Failed to stream');

            setChatMessages(prev => [...prev, { role: 'ai', content: '', chunks: 0 }]);
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let text = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                text += decoder.decode(value, { stream: true });
                setChatMessages(prev => {
                    const next = [...prev];
                    next[next.length - 1] = { ...next[next.length - 1], content: text };
                    return next;
                });
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        } catch {
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
                            <button className="btn btn-secondary" onClick={handleExportGithub} title="Export tasks to GitHub issues">
                                <Github size={14} /> GitHub Export
                            </button>
                            <button className="btn btn-secondary" onClick={handleExportJira} title="Export tasks to Jira issues">
                                <Target size={14} /> Jira Export
                            </button>
                            <button className="btn btn-secondary" onClick={handleExportLinear} title="Export tasks to Linear issues" style={{ background: 'linear-gradient(135deg, #5E6AD2, #8B5CF6)', color: '#fff', border: 'none' }}>
                                <Sparkles size={14} /> Linear Export
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
                        {meeting.transcript && (
                            <>
                                <span className="badge badge-info" style={{ fontWeight: 500, fontSize: '0.7rem' }}>
                                    {meeting.transcript.length.toLocaleString()} chars
                                </span>
                                <span className="badge badge-warning" style={{ fontWeight: 500, fontSize: '0.7rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                                    ~{Math.max(1, Math.ceil(meeting.transcript.split(/\s+/).length / 200))} min read
                                </span>
                            </>
                        )}
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        {showTranscript && (
                            <input 
                                type="text" 
                                placeholder="Search transcript..." 
                                className="input" 
                                style={{ padding: '4px 8px', fontSize: '0.85rem', height: '28px' }}
                                value={transcriptSearch}
                                onChange={(e) => setTranscriptSearch(e.target.value.toLowerCase())}
                                id="transcriptSearchParams"
                            />
                        )}
                        {meeting.transcript && (
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={(e) => { e.stopPropagation(); copyTranscript(); }}
                                style={{ padding: '4px 8px' }}
                                title="Copy full transcript"
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowTranscript(!showTranscript)}>
                            {showTranscript ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
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
                            <div className="transcript-wrapper" style={{ maxHeight: '500px', overflowY: 'auto', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                {(meeting.transcript || 'No transcript available. Upload a transcript or have a video call with captions enabled.').split('\n').map((line, idx) => {
                                    // Search filtering logic
                                    if (transcriptSearch && !line.toLowerCase().includes(transcriptSearch)) {
                                        return null;
                                    }

                                    // Rule-based task highlighting
                                    const taskRegex = /(we should|let's do|need to|assign this|deadline)/i;
                                    const riskRegex = /(problem|delay|risk|issue|blocked|dependency)/i;
                                    
                                    let isTask = taskRegex.test(line);
                                    let isRisk = riskRegex.test(line);
                                    
                                    let bg = 'transparent';
                                    let borderL = 'none';
                                    
                                    if(isRisk) {
                                        bg = '#fee2e2'; // Light red
                                        borderL = '4px solid #ef4444';
                                    } else if (isTask) {
                                        bg = '#dbeafe'; // Light blue
                                        borderL = '4px solid #3b82f6';
                                    }

                                    // Highlight search term
                                    let content = line;
                                    if (transcriptSearch) {
                                        const regex = new RegExp(`(${transcriptSearch})`, 'gi');
                                        const parts = line.split(regex);
                                        content = parts.map((part, i) => 
                                            regex.test(part) ? <mark key={i} style={{ backgroundColor: '#fef08a', color: '#854d0e', borderRadius: '2px', padding: '0 2px' }}>{part}</mark> : part
                                        );
                                    }

                                    return (
                                        <div key={idx} style={{ padding: '4px 8px', backgroundColor: bg, borderLeft: borderL, marginBottom: 4, borderRadius: 2 }}>
                                            {content}
                                        </div>
                                    );
                                })}
                            </div>
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
                                            {meetingStats?.data?.speaking_time && Object.keys(meetingStats.data.speaking_time).length > 0 && (
                                                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                        <div className="ac-title" style={{ margin: 0, fontSize:'0.9rem' }}><BarChart3 size={14} style={{ color: 'var(--accent-primary)' }} /> Speaking Analytics & Engagement</div>
                                                        {meetingStats?.data?.engagement_score !== undefined && (
                                                            <div className="badge badge-success" style={{ fontSize: '0.8rem' }}>Engagement Score: {meetingStats.data.engagement_score}/100</div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {Object.entries(meetingStats.data.speaking_time).sort((a,b) => b[1] - a[1]).map(([speaker, percentage]) => {
                                                            const insights = meetingStats.data.speaker_insights?.[speaker] || {};
                                                            return(
                                                            <div key={speaker} style={{ display: 'flex', flexDirection:'column', gap: '4px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    <div style={{ width: '120px', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{speaker}</div>
                                                                    <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', height: '8px', borderRadius: '4px', overflow:'hidden' }}>
                                                                        <div style={{ width: `${percentage}%`, backgroundColor: 'var(--accent-primary)', height: '100%', borderRadius: '4px' }} />
                                                                    </div>
                                                                    <div style={{ width: '40px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>{percentage}%</div>
                                                                </div>
                                                                <div style={{ paddingLeft: '132px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                    {insights.messages} msgs • {insights.questions_asked} questions • {insights.interruptions} interruptions
                                                                </div>
                                                            </div>
                                                        )})}
                                                    </div>
                                                    {meetingStats?.data?.heatmap?.length > 0 && (
                                                        <div style={{ marginTop: '16px' }}>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Conversation Activity Heatmap (per minute)</div>
                                                            <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '30px' }}>
                                                                {meetingStats.data.heatmap.map((count, i) => {
                                                                    const maxCount = Math.max(...meetingStats.data.heatmap, 1);
                                                                    const heightObj = count === 0 ? '10%' : `${(count / maxCount) * 100}%`;
                                                                    return (
                                                                        <div key={i} title={`Minute ${i}: ${count} interactions`} style={{ flex: 1, backgroundColor: 'var(--accent-primary)', opacity: count===0 ? 0.05 : 0.4 + (count/maxCount)*0.6, height: heightObj, borderRadius: '2px 2px 0 0' }} />
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
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
                                            {meetingStats?.data?.rule_based_decisions && meetingStats.data.rule_based_decisions.length > 0 && (
                                                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                                                    <div className="ac-title" style={{ fontSize:'0.9rem', marginBottom: '8px' }}><Check size={14} style={{ color: '#10b981' }} /> Rules-Engine: Detected Decisions</div>
                                                    <ul className="ac-list">
                                                        {meetingStats.data.rule_based_decisions.map((d, i) => (
                                                            <li key={i} style={{ fontSize: '0.85rem' }}>{d}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ═══ ANALYTICS TAB (Computed, no LLM) ═══ */}
                            {activeTab === 'summary' && meetingStats?.data && (
                                <motion.div key="analytics-inline" {...fadeUp} transition={{ duration: 0.2, delay: 0.15 }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '16px' }}>

                                        {/* Efficiency Report */}
                                        <div className="card analysis-card" style={{ padding: '20px' }}>
                                            <div className="ac-title" style={{ marginBottom: '12px' }}><Clock size={14} style={{ color: '#f59e0b' }} /> Efficiency Report</div>
                                            <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', width: '80px', height: '80px', margin: '0 auto 12px' }}>
                                                <svg viewBox="0 0 80 80" style={{ width: '80px', height: '80px' }}>
                                                    <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(99,102,241,0.1)" strokeWidth="8" />
                                                    <circle cx="40" cy="40" r="34" fill="none" stroke="#6366f1" strokeWidth="8" strokeLinecap="round"
                                                        strokeDasharray={`${(meetingStats.data.efficiency_score || 0) * 2.136} 213.6`}
                                                        transform="rotate(-90 40 40)" />
                                                </svg>
                                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: '1rem', fontWeight: 700, color: '#6366f1' }}>{meetingStats.data.efficiency_score}%</div>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                                Active: {Math.round((meetingStats.data.active_speaking_seconds || 0) / 60)}m
                                                &nbsp;•&nbsp; Silent: {Math.round((meetingStats.data.silent_seconds || 0) / 60)}m
                                            </div>
                                        </div>

                                        {/* Keyword Cloud */}
                                        {(meetingStats.data.keyword_cloud || []).length > 0 && (
                                            <div className="card analysis-card" style={{ padding: '20px' }}>
                                                <div className="ac-title" style={{ marginBottom: '12px' }}><Sparkles size={14} style={{ color: '#8b5cf6' }} /> Keyword Cloud</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '120px', overflow: 'hidden' }}>
                                                    {meetingStats.data.keyword_cloud.slice(0, 25).map((kw, i) => {
                                                        const max = meetingStats.data.keyword_cloud[0]?.count || 1;
                                                        const s = Math.max(0.65, Math.min(1.15, 0.65 + (kw.count / max) * 0.5));
                                                        return <span key={i} style={{ fontSize: `${s}rem`, padding: '2px 6px', borderRadius: '6px', background: 'rgba(99,102,241,0.08)', color: '#6366f1', fontWeight: kw.count > max * 0.5 ? 600 : 400 }}>{kw.word}</span>;
                                                    })}
                                                </div>
                                                {meetingStats.data.suggested_title && (
                                                    <div style={{ marginTop: '10px', padding: '8px', borderRadius: '6px', background: 'rgba(16,185,129,0.06)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        💡 Suggested title: <strong style={{ color: 'var(--text-primary)' }}>{meetingStats.data.suggested_title}</strong>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Speaker Turns */}
                                        <div className="card analysis-card" style={{ padding: '20px' }}>
                                            <div className="ac-title" style={{ marginBottom: '12px' }}><RefreshCw size={14} style={{ color: '#ec4899' }} /> Speaker Turns</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(99,102,241,0.05)' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Turns</span>
                                                    <span style={{ fontWeight: 700, color: '#6366f1' }}>{meetingStats.data.total_speaker_turns}</span>
                                                </div>
                                                {meetingStats.data.longest_monologue_speaker && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.05)' }}>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Longest Monologue</span>
                                                        <span style={{ fontWeight: 600, color: '#ef4444', fontSize: '0.8rem' }}>{meetingStats.data.longest_monologue_speaker} ({Math.round(meetingStats.data.longest_monologue_seconds)}s)</span>
                                                    </div>
                                                )}
                                                {/* Conversation Speed */}
                                                {Object.entries(meetingStats.data.conversation_speed || {}).map(([spk, wpm]) => (
                                                    <div key={spk} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', fontSize: '0.78rem' }}>
                                                        <span style={{ color: 'var(--text-muted)' }}>{spk}</span>
                                                        <span style={{ color: 'var(--text-secondary)' }}>{wpm} wpm</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Questions & Highlights Row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                                        {/* Questions */}
                                        {(meetingStats.data.questions || []).length > 0 && (
                                            <div className="card analysis-card" style={{ padding: '20px' }}>
                                                <div className="ac-title" style={{ marginBottom: '10px' }}><MessageSquare size={14} style={{ color: '#6366f1' }} /> Questions Asked ({meetingStats.data.questions.length})</div>
                                                <ul className="ac-list" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                                    {meetingStats.data.questions.map((q, i) => (
                                                        <li key={i} style={{ fontSize: '0.82rem' }}>{q}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Smart Highlights */}
                                        {(meetingStats.data.highlights || []).length > 0 && (
                                            <div className="card analysis-card" style={{ padding: '20px' }}>
                                                <div className="ac-title" style={{ marginBottom: '10px' }}><AlertCircle size={14} style={{ color: '#ef4444' }} /> Smart Highlights</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                                                    {meetingStats.data.highlights.map((h, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: h.type === 'budget' ? 'rgba(16,185,129,0.06)' : h.type === 'deadline' ? 'rgba(239,68,68,0.06)' : h.type === 'date' ? 'rgba(99,102,241,0.06)' : 'rgba(245,158,11,0.06)' }}>
                                                            <span className="badge" style={{ fontSize: '0.6rem', padding: '2px 6px', background: h.type === 'budget' ? '#10b981' : h.type === 'deadline' ? '#ef4444' : h.type === 'date' ? '#6366f1' : '#f59e0b', color: '#fff' }}>{h.type}</span>
                                                            <span style={{ fontSize: '0.82rem' }}>{h.text}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Silent Gaps */}
                                    {(meetingStats.data.silent_gaps || []).length > 0 && (
                                        <div className="card analysis-card" style={{ padding: '20px', marginTop: '16px' }}>
                                            <div className="ac-title" style={{ marginBottom: '10px' }}><Clock size={14} style={{ color: '#f59e0b' }} /> Silent Gaps Detected ({meetingStats.data.silent_gaps.length})</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {meetingStats.data.silent_gaps.map((g, i) => (
                                                    <span key={i} className="badge" style={{ padding: '4px 10px', background: 'rgba(245,158,11,0.08)', color: '#f59e0b', fontSize: '0.78rem' }}>
                                                        {Math.floor(g.timestamp / 60)}:{String(Math.floor(g.timestamp % 60)).padStart(2, '0')} — {g.duration}s
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
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
