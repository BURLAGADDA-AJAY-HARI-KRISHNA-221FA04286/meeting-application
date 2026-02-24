import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { meetingsAPI, videoMeetingAPI } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Video, Users, Copy, Check, ArrowRight, Sparkles,
    Upload, FileVideo, X, Loader2, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import './NewMeeting.css';

export default function NewMeetingPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [mode, setMode] = useState('start');
    const [loading, setLoading] = useState(false);

    // Start Meeting
    const [newTitle, setNewTitle] = useState('');
    const [createdRoom, setCreatedRoom] = useState(null);
    const [copied, setCopied] = useState('');

    // Join Meeting
    const [meetingCode, setMeetingCode] = useState('');
    const [password, setPassword] = useState('');

    // Video Upload
    const [mediaFile, setMediaFile] = useState(null);
    const [mediaTitle, setMediaTitle] = useState('');
    const [uploadProgress, setUploadProgress] = useState('');
    const fileInputRef = useRef(null);

    /* ═══ Start Meeting ═══ */
    const handleCreate = async () => {
        setLoading(true);
        try {
            const title = newTitle.trim() || `${user?.full_name || 'User'}'s Meeting`;
            const res = await videoMeetingAPI.createRoom(title);
            setCreatedRoom(res.data);
            toast.success('Meeting room created!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create meeting');
        } finally {
            setLoading(false);
        }
    };

    /* ═══ Join Meeting ═══ */
    const handleJoin = async (e) => {
        e.preventDefault();
        if (!meetingCode.trim() || !password.trim()) {
            toast.error('Please enter meeting code and password');
            return;
        }
        setLoading(true);
        try {
            const res = await videoMeetingAPI.joinRoom(meetingCode.trim(), password.trim());
            toast.success(`Joining "${res.data.title}"...`);
            navigate(`/meetings/room/${res.data.room_id}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Invalid code or password');
        } finally {
            setLoading(false);
        }
    };

    /* ═══ Video/Audio Upload → Summary ═══ */
    const handleFileDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files[0] || e.target?.files?.[0];
        if (file) {
            const allowed = ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a'];
            if (!allowed.some(t => file.type.startsWith(t.split('/')[0]))) {
                toast.error('Please upload a video or audio file (mp4, webm, mp3, wav, m4a, ogg)');
                return;
            }
            if (file.size > 100 * 1024 * 1024) {
                toast.error('File too large. Max 100 MB.');
                return;
            }
            setMediaFile(file);
            if (!mediaTitle) setMediaTitle(file.name.replace(/\.[^.]+$/, ''));
        }
    };

    const handleUploadMedia = async () => {
        if (!mediaFile) {
            toast.error('Please select a video or audio file');
            return;
        }
        setLoading(true);
        setUploadProgress('Uploading file to server...');
        const toastId = toast.loading('Processing video/audio... This may take 1-2 minutes');
        try {
            setUploadProgress('Transcribing with AI...');
            const res = await meetingsAPI.uploadMedia(mediaFile, mediaTitle.trim());
            const meeting = res.data;
            toast.success(
                `Transcript extracted! ${meeting.subtitle_count} lines. ${meeting.has_analysis ? 'AI analysis complete!' : 'Analyzing...'}`,
                { id: toastId }
            );
            navigate(`/meetings/${meeting.id}`);
        } catch (err) {
            toast.error(
                err.response?.data?.detail || 'Failed to process file. Check format and try again.',
                { id: toastId }
            );
        } finally {
            setLoading(false);
            setUploadProgress('');
        }
    };

    /* ═══ Helpers ═══ */
    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        toast.success(`${label} copied!`);
        setTimeout(() => setCopied(''), 2000);
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <h1 className="page-title">New Meeting</h1>
                <p className="page-subtitle">Start a video call, join an existing one, or upload a recording for AI analysis</p>
            </div>

            <div className="new-meeting-form">
                <div className="card new-meeting-card">
                    {/* ── Mode Selector (2 tabs) ── */}
                    <div className="nm-mode-selector">
                        <button
                            className={`nm-mode-btn ${mode === 'start' ? 'active' : ''}`}
                            onClick={() => { setMode('start'); setCreatedRoom(null); }}
                        >
                            <Video size={22} />
                            Start Meeting
                        </button>
                        <button
                            className={`nm-mode-btn ${mode === 'join' ? 'active' : ''}`}
                            onClick={() => setMode('join')}
                        >
                            <Users size={22} />
                            Join Meeting
                        </button>
                    </div>

                    <AnimatePresence mode="wait">
                        {/* ═══ START MEETING ═══ */}
                        {mode === 'start' && (
                            <motion.div
                                key="start"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.15 }}
                            >
                                {!createdRoom ? (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">Meeting Title (optional)</label>
                                            <input
                                                className="input"
                                                placeholder="e.g., Sprint Planning"
                                                value={newTitle}
                                                onChange={e => setNewTitle(e.target.value)}
                                            />
                                        </div>
                                        <div className="nm-info-card">
                                            <Info size={18} className="nm-info-icon" />
                                            <div>
                                                <strong>One-click meeting</strong>
                                                <p>Creates a secure room with meeting code & password. When you leave, your transcript is automatically saved and AI-analyzed.</p>
                                            </div>
                                        </div>
                                        <div className="nm-actions">
                                            <button className="btn btn-ghost" onClick={() => navigate('/meetings')}>Cancel</button>
                                            <button className="btn btn-primary btn-lg" onClick={handleCreate} disabled={loading}>
                                                {loading ? <div className="spinner" /> : <><Video size={16} /> Create Meeting</>}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="nm-created-section">
                                        <div className="nm-created-badge">
                                            <Check size={16} /> Room Ready
                                        </div>
                                        <div className="nm-credential-rows">
                                            <div className="nm-credential-row">
                                                <span className="nm-credential-label">Meeting Code</span>
                                                <span className="nm-credential-value">
                                                    <code>{createdRoom.meeting_code}</code>
                                                    <button className="nm-copy-btn" onClick={() => copyToClipboard(createdRoom.meeting_code, 'Code')}>
                                                        {copied === 'Code' ? <Check size={14} /> : <Copy size={14} />}
                                                    </button>
                                                </span>
                                            </div>
                                            <div className="nm-credential-row">
                                                <span className="nm-credential-label">Password</span>
                                                <span className="nm-credential-value">
                                                    <code>{createdRoom.password}</code>
                                                    <button className="nm-copy-btn" onClick={() => copyToClipboard(createdRoom.password, 'Password')}>
                                                        {copied === 'Password' ? <Check size={14} /> : <Copy size={14} />}
                                                    </button>
                                                </span>
                                            </div>
                                            <div className="nm-credential-row">
                                                <span className="nm-credential-label">Meeting Link</span>
                                                <span className="nm-credential-value">
                                                    <code style={{ fontSize: '0.75rem' }}>{`${window.location.origin}/join/${createdRoom.room_id}`}</code>
                                                    <button className="nm-copy-btn" onClick={() => copyToClipboard(`${window.location.origin}/join/${createdRoom.room_id}`, 'Link')}>
                                                        {copied === 'Link' ? <Check size={14} /> : <Copy size={14} />}
                                                    </button>
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            className="nm-copy-all"
                                            onClick={() => copyToClipboard(
                                                `Meeting: ${createdRoom.title}\nCode: ${createdRoom.meeting_code}\nPassword: ${createdRoom.password}\nJoin Link: ${window.location.origin}/join/${createdRoom.room_id}`,
                                                'All'
                                            )}
                                        >
                                            {copied === 'All' ? <Check size={14} /> : <Copy size={14} />}
                                            Copy All Details
                                        </button>
                                        <div className="nm-actions">
                                            <button className="btn btn-ghost" onClick={() => setCreatedRoom(null)}>Back</button>
                                            <button
                                                className="btn btn-primary btn-lg"
                                                onClick={() => navigate(`/meetings/room/${createdRoom.room_id}`)}
                                            >
                                                <ArrowRight size={16} /> Enter Meeting
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ═══ JOIN MEETING ═══ */}
                        {mode === 'join' && (
                            <motion.div
                                key="join"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.15 }}
                            >
                                <form onSubmit={handleJoin}>
                                    <div className="form-group">
                                        <label className="form-label">Meeting Code</label>
                                        <input
                                            className="input"
                                            placeholder="Enter 8-character code"
                                            value={meetingCode}
                                            onChange={e => setMeetingCode(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Password</label>
                                        <input
                                            className="input"
                                            type="password"
                                            placeholder="Enter meeting password"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="nm-actions">
                                        <button type="button" className="btn btn-ghost" onClick={() => navigate('/meetings')}>Cancel</button>
                                        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                                            {loading ? <div className="spinner" /> : <><Users size={16} /> Join Meeting</>}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ═══ VIDEO/AUDIO → SUMMARY (separate card below) ═══ */}
                <motion.div
                    className="card nm-upload-card"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="nm-upload-header">
                        <div className="nm-upload-icon"><FileVideo size={22} /></div>
                        <div>
                            <h3>Video / Audio → AI Summary</h3>
                            <p>Upload a recorded meeting and get instant AI analysis — transcript, summary, action items, and more</p>
                        </div>
                    </div>

                    <div
                        className={`nm-drop-zone ${mediaFile ? 'has-file' : ''}`}
                        onClick={() => !mediaFile && fileInputRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleFileDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*,audio/*"
                            onChange={handleFileDrop}
                            style={{ display: 'none' }}
                        />
                        {mediaFile ? (
                            <div className="nm-file-preview">
                                <div className="nm-file-info">
                                    <FileVideo size={20} />
                                    <div>
                                        <div className="nm-file-name">{mediaFile.name}</div>
                                        <div className="nm-file-size">{formatFileSize(mediaFile.size)}</div>
                                    </div>
                                </div>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={(e) => { e.stopPropagation(); setMediaFile(null); setMediaTitle(''); }}
                                >
                                    <X size={16} /> Remove
                                </button>
                            </div>
                        ) : (
                            <div className="nm-drop-content">
                                <Upload size={28} />
                                <span>Drag & drop a video or audio file here</span>
                                <span className="nm-drop-hint">or click to browse · MP4, WebM, MP3, WAV, M4A · Max 100 MB</span>
                            </div>
                        )}
                    </div>

                    {mediaFile && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="nm-upload-actions"
                        >
                            <div className="form-group" style={{ marginBottom: 12 }}>
                                <label className="form-label">Meeting Title (optional)</label>
                                <input
                                    className="input"
                                    placeholder={mediaFile.name.replace(/\.[^.]+$/, '')}
                                    value={mediaTitle}
                                    onChange={e => setMediaTitle(e.target.value)}
                                />
                            </div>
                            {uploadProgress && (
                                <div className="nm-progress">
                                    <Loader2 size={14} className="spin" />
                                    <span>{uploadProgress}</span>
                                </div>
                            )}
                            <button
                                className="btn btn-primary btn-lg nm-upload-btn"
                                onClick={handleUploadMedia}
                                disabled={loading}
                            >
                                {loading ? (
                                    <><div className="spinner" /> Processing...</>
                                ) : (
                                    <><Sparkles size={16} /> Transcribe & Analyze</>
                                )}
                            </button>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
