import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { meetingsAPI } from '../api';
import { motion } from 'framer-motion';
import { Upload, Mic, ArrowRight, FileText, Info, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import './NewMeeting.css';

const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
};

export default function NewMeetingPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('upload'); // 'upload' | 'live'
    const [title, setTitle] = useState('');
    const [transcript, setTranscript] = useState('');
    const [loading, setLoading] = useState(false);

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!title.trim()) {
            toast.error('Please enter a meeting title');
            return;
        }
        if (!transcript.trim()) {
            toast.error('Please paste your transcript');
            return;
        }
        setLoading(true);
        try {
            const res = await meetingsAPI.create({ title: title.trim(), transcript: transcript.trim() });
            toast.success('Meeting created!');
            navigate(`/meetings/${res.data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create meeting');
        } finally {
            setLoading(false);
        }
    };

    const handleLive = (e) => {
        e.preventDefault();
        if (!title.trim()) {
            toast.error('Please enter a meeting title');
            return;
        }
        navigate('/meetings/live', { state: { title: title.trim() } });
    };

    return (
        <div className="page-container">
            <motion.div className="page-header" {...fadeUp}>
                <div>
                    <h1 className="page-title">New Meeting</h1>
                    <p className="page-subtitle">Upload a transcript or start a live recording session</p>
                </div>
            </motion.div>

            <div className="new-meeting-form">
                <motion.div className="card new-meeting-card" {...fadeUp} transition={{ delay: 0.05 }}>
                    {/* Mode Selector */}
                    <div className="nm-mode-selector">
                        <motion.button
                            className={`nm-mode-btn ${mode === 'upload' ? 'active' : ''}`}
                            onClick={() => setMode('upload')}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <Upload size={22} />
                            <span>Upload Transcript</span>
                        </motion.button>
                        <motion.button
                            className={`nm-mode-btn ${mode === 'live' ? 'active' : ''}`}
                            onClick={() => setMode('live')}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <Radio size={22} />
                            <span>Live Session</span>
                        </motion.button>
                    </div>

                    <form onSubmit={mode === 'upload' ? handleUpload : handleLive}>
                        {/* Title */}
                        <div className="input-group">
                            <label className="input-label" htmlFor="meeting-title">Meeting Title</label>
                            <input
                                id="meeting-title"
                                className="input"
                                type="text"
                                placeholder="e.g., Q4 Sprint Planning"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        {mode === 'upload' ? (
                            <>
                                <div className="input-group">
                                    <label className="input-label" htmlFor="meeting-transcript">
                                        Transcript
                                    </label>
                                    <textarea
                                        id="meeting-transcript"
                                        className="input textarea"
                                        placeholder="Paste your meeting transcript here…"
                                        rows={10}
                                        value={transcript}
                                        onChange={e => setTranscript(e.target.value)}
                                        required
                                    />
                                    <div className="char-count">
                                        {transcript.length.toLocaleString()} characters
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="live-meeting-info">
                                <div className="info-icon">
                                    <Mic size={22} />
                                </div>
                                <div>
                                    <h4>Live Recording Session</h4>
                                    <p>
                                        You'll be redirected to the live meeting room where you can record audio,
                                        see live transcription, and invite participants. Make sure your microphone
                                        is ready and you have a stable connection.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="nm-actions">
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => navigate('/meetings')}
                            >
                                Cancel
                            </button>
                            <motion.button
                                type="submit"
                                className="btn btn-primary btn-lg"
                                disabled={loading}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {loading ? (
                                    <div className="spinner" />
                                ) : mode === 'upload' ? (
                                    <><FileText size={18} /> Create Meeting</>
                                ) : (
                                    <><Mic size={18} /> Start Session</>
                                )}
                            </motion.button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}
