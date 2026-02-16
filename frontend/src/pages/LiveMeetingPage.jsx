import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { meetingsAPI, createMeetingWebSocket } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mic, MicOff, PhoneOff, Users, Clock, Radio,
    MessageSquare, Volume2, Wifi, WifiOff, ArrowLeft,
    Video, Info, Circle, Download, Clipboard, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import './LiveMeeting.css';

const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
};

export default function LiveMeetingPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [meetingId, setMeetingId] = useState(id || null);
    const [meetingTitle, setMeetingTitle] = useState(location.state?.title || 'Live Meeting');
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [subtitles, setSubtitles] = useState([]);
    const [fullTranscript, setFullTranscript] = useState('');
    const [participants, setParticipants] = useState([]);
    const [duration, setDuration] = useState(0);
    const [audioLevels, setAudioLevels] = useState(new Array(24).fill(3));
    const [connectionQuality, setConnectionQuality] = useState('good');
    const [interimText, setInterimText] = useState('');
    const [copied, setCopied] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);

    const wsRef = useRef(null);
    const mediaRef = useRef(null);
    const analyserRef = useRef(null);
    const animFrameRef = useRef(null);
    const timerRef = useRef(null);
    const subtitlesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const transcriptRef = useRef('');

    // Create meeting if no ID
    useEffect(() => {
        if (!meetingId) {
            meetingsAPI.create({ title: meetingTitle, transcript: '' })
                .then(res => setMeetingId(res.data.id))
                .catch(() => toast.error('Failed to create meeting'));
        }
    }, []);

    // Connect WebSocket
    useEffect(() => {
        if (!meetingId) return;

        const ws = createMeetingWebSocket(meetingId);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            toast.success('Connected to meeting');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'SUBTITLE' || data.type === 'subtitle' || data.type === 'transcription') {
                    setSubtitles(prev => [...prev, {
                        speaker: data.speaker || 'You',
                        text: data.text || data.content,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        confidence: data.confidence,
                    }]);
                    setTimeout(() => subtitlesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                }
                if (data.type === 'participants') {
                    setParticipants(data.participants || []);
                }
            } catch { }
        };

        ws.onclose = () => {
            setIsConnected(false);
        };

        ws.onerror = () => {
            setConnectionQuality('poor');
        };

        return () => ws.close();
    }, [meetingId]);

    // Timer
    useEffect(() => {
        if (isRecording) {
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isRecording]);

    const formatTime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    // ── Speech Recognition (Browser-based) ──
    const initSpeechRecognition = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setSpeechSupported(false);
            toast.error('Speech Recognition not supported in this browser. Use Chrome for best results.');
            return null;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const text = result[0].transcript;
                if (result.isFinal) {
                    // Add to subtitles
                    const subtitle = {
                        speaker: 'You',
                        text: text.trim(),
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        confidence: result[0].confidence,
                    };
                    setSubtitles(prev => [...prev, subtitle]);
                    setInterimText('');

                    // Append to full transcript
                    transcriptRef.current += (transcriptRef.current ? '\n' : '') + text.trim();
                    setFullTranscript(transcriptRef.current);

                    // Send to WebSocket for backend processing/storage
                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({
                            type: 'TRANSCRIPTION',
                            text: text.trim(),
                            speaker: 'You',
                            confidence: result[0].confidence,
                            timestamp: new Date().toISOString(),
                        }));
                    }

                    setTimeout(() => subtitlesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                } else {
                    interim += text;
                }
            }
            setInterimText(interim);
        };

        recognition.onerror = (event) => {
            if (event.error === 'no-speech') return; // Ignore no-speech
            if (event.error === 'aborted') return;   // Ignore aborted
            console.warn('Speech recognition error:', event.error);
            // Auto-restart on error (except fatal ones)
            if (event.error !== 'not-allowed') {
                setTimeout(() => {
                    if (recognitionRef.current && isRecording) {
                        try { recognitionRef.current.start(); } catch { }
                    }
                }, 500);
            }
        };

        recognition.onend = () => {
            // Auto-restart if still recording
            if (isRecording && recognitionRef.current) {
                try { recognitionRef.current.start(); } catch { }
            }
        };

        return recognition;
    }, [isRecording]);

    // Also send audio chunks to backend via MediaRecorder
    const setupMediaRecorder = useCallback((stream) => {
        try {
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/ogg';

            const recorder = new MediaRecorder(stream, { mimeType });
            recorder.ondataavailable = async (event) => {
                if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                    // Convert to base64 and send to backend
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64data = reader.result.split(',')[1];
                        wsRef.current.send(JSON.stringify({
                            type: 'AUDIO_CHUNK',
                            data: base64data,
                        }));
                    };
                    reader.readAsDataURL(event.data);
                }
            };
            // Record in 3-second chunks
            recorder.start(3000);
            mediaRecorderRef.current = recorder;
        } catch (err) {
            console.warn('MediaRecorder setup failed:', err);
        }
    }, []);

    // ── Microphone & Start ──
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRef.current = stream;
            setIsRecording(true);
            setIsMuted(false);

            // Audio visualizer
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            analyserRef.current = analyser;

            const animate = () => {
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                const levels = Array.from(dataArray).slice(0, 24).map(v => Math.max(3, v / 8));
                setAudioLevels(levels);
                animFrameRef.current = requestAnimationFrame(animate);
            };
            animate();

            // Start Speech Recognition
            const recognition = initSpeechRecognition();
            if (recognition) {
                recognitionRef.current = recognition;
                try { recognition.start(); } catch { }
            }

            // Start sending audio chunks to backend
            setupMediaRecorder(stream);

            toast.success('Recording & transcription started');
        } catch (err) {
            toast.error('Microphone access denied');
        }
    };

    const stopRecording = () => {
        // Stop media stream
        if (mediaRef.current) {
            mediaRef.current.getTracks().forEach(t => t.stop());
            mediaRef.current = null;
        }

        // Stop visualizer
        cancelAnimationFrame(animFrameRef.current);
        setAudioLevels(new Array(24).fill(3));

        // Stop speech recognition
        if (recognitionRef.current) {
            recognitionRef.current.abort();
            recognitionRef.current = null;
        }
        setInterimText('');

        // Stop media recorder
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }

        setIsRecording(false);

        // Save the full transcript to the meeting
        if (transcriptRef.current && meetingId) {
            meetingsAPI.update(meetingId, { transcript: transcriptRef.current })
                .then(() => toast.success('Transcript saved to meeting'))
                .catch(() => toast.error('Failed to save transcript'));
        }

        toast.success('Recording stopped');
    };

    const toggleMute = () => {
        if (mediaRef.current) {
            mediaRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
            setIsMuted(!isMuted);

            // Pause/resume recognition
            if (!isMuted && recognitionRef.current) {
                recognitionRef.current.abort();
            } else if (isMuted && recognitionRef.current) {
                try { recognitionRef.current.start(); } catch { }
            }
        }
    };

    const leaveMeeting = () => {
        stopRecording();
        if (wsRef.current) wsRef.current.close();
        if (meetingId) {
            navigate(`/meetings/${meetingId}`);
        } else {
            navigate('/meetings');
        }
    };

    const copyTranscript = () => {
        const text = subtitles.map(s => `[${s.time}] ${s.speaker}: ${s.text}`).join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success('Transcript copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadTranscript = () => {
        const text = subtitles.map(s => `[${s.time}] ${s.speaker}: ${s.text}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `transcript-meeting-${meetingId}-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success('Transcript downloaded');
    };

    return (
        <div className="page-container live-meeting-page">
            {/* ── Header ── */}
            <motion.div className="live-header" {...fadeUp}>
                <div className="live-header-left">
                    <div>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/meetings')} style={{ marginBottom: 6 }}>
                            <ArrowLeft size={14} /> Meetings
                        </button>
                        <h1 className="page-title">{meetingTitle}</h1>
                        <div className="live-meta">
                            {isRecording && (
                                <span className="live-indicator">
                                    <Radio size={14} className="pulse-icon" /> LIVE
                                </span>
                            )}
                            <span className="live-timer">
                                <Clock size={14} /> {formatTime(duration)}
                            </span>
                            <span className="live-participants">
                                <Users size={14} /> {participants.length || 1} participant{(participants.length || 1) !== 1 ? 's' : ''}
                            </span>
                            <span className={`connection-quality quality-${connectionQuality}`}>
                                {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                                {connectionQuality}
                            </span>
                            {!speechSupported && (
                                <span style={{ color: '#eab308', fontSize: '0.7rem' }}>
                                    ⚠ Use Chrome for voice transcription
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="live-header-actions">
                    {!isRecording ? (
                        <motion.button
                            className="btn btn-primary live-join-btn"
                            onClick={startRecording}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            <Mic size={18} /> Start Recording
                        </motion.button>
                    ) : (
                        <>
                            <button
                                className={`btn ${isMuted ? 'btn-danger' : 'btn-secondary'} mic-btn`}
                                onClick={toggleMute}
                            >
                                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                                {isMuted ? 'Unmute' : 'Mute'}
                            </button>
                            <button className="btn btn-ghost" onClick={stopRecording}>
                                <Circle size={14} style={{ fill: '#ef4444', color: '#ef4444' }} /> Stop
                            </button>
                        </>
                    )}
                    <button className="btn btn-secondary btn-leave" onClick={leaveMeeting}>
                        <PhoneOff size={16} /> Leave
                    </button>
                </div>
            </motion.div>

            {/* ── Audio Visualizer ── */}
            <AnimatePresence>
                {isRecording && (
                    <motion.div
                        className="audio-visualizer-bar"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <div className="visualizer-container">
                            <Volume2 size={18} className="visualizer-icon" />
                            <div className="visualizer-bars">
                                {audioLevels.map((level, i) => (
                                    <div
                                        key={i}
                                        className="visualizer-bar"
                                        style={{ height: `${level}px`, transition: 'height 0.05s ease' }}
                                    />
                                ))}
                            </div>
                            <span className="visualizer-label">Recording</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Main Content ── */}
            <div className="live-content">
                {/* Subtitles */}
                <motion.div className="card subtitles-panel" {...fadeUp} transition={{ delay: 0.05 }}>
                    <div className="subtitles-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <MessageSquare size={18} />
                            <h3>Live Transcription</h3>
                            {subtitles.length > 0 && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                                    ({subtitles.length} entries)
                                </span>
                            )}
                        </div>
                        {subtitles.length > 0 && (
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-ghost btn-xs" onClick={copyTranscript} title="Copy transcript">
                                    {copied ? <Check size={14} /> : <Clipboard size={14} />}
                                </button>
                                <button className="btn btn-ghost btn-xs" onClick={downloadTranscript} title="Download transcript">
                                    <Download size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="subtitles-list">
                        {subtitles.length === 0 && !interimText ? (
                            <div className="subtitles-empty">
                                <MessageSquare size={36} style={{ opacity: 0.3 }} />
                                <p>Start recording to see live transcription here.</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Subtitles will appear in real-time as speech is detected.
                                    {speechSupported ? ' Using browser speech recognition.' : ' Speech Recognition not available.'}
                                </p>
                            </div>
                        ) : (
                            <>
                                {subtitles.map((sub, i) => (
                                    <motion.div
                                        key={i}
                                        className="subtitle-item"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                    >
                                        <div className="subtitle-speaker">
                                            <div className="subtitle-avatar">{sub.speaker[0]}</div>
                                            <span className="subtitle-name">{sub.speaker}</span>
                                            <span className="subtitle-time">{sub.time}</span>
                                            {sub.confidence != null && (
                                                <span className="subtitle-confidence" title="Confidence">
                                                    {Math.round((sub.confidence || 0) * 100)}%
                                                </span>
                                            )}
                                        </div>
                                        <div className="subtitle-text">{sub.text}</div>
                                    </motion.div>
                                ))}
                                {/* Interim (currently-speaking) text */}
                                {interimText && (
                                    <motion.div
                                        className="subtitle-item interim"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <div className="subtitle-speaker">
                                            <div className="subtitle-avatar" style={{ opacity: 0.5 }}>Y</div>
                                            <span className="subtitle-name" style={{ opacity: 0.5 }}>You</span>
                                            <span className="subtitle-time" style={{ opacity: 0.3 }}>typing...</span>
                                        </div>
                                        <div className="subtitle-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>{interimText}</div>
                                    </motion.div>
                                )}
                            </>
                        )}
                        <div ref={subtitlesEndRef} />
                    </div>
                </motion.div>

                {/* Sidebar */}
                <div className="live-sidebar">
                    <motion.div className="card participants-card" {...fadeUp} transition={{ delay: 0.1 }}>
                        <h4><Users size={16} /> Participants</h4>
                        <ul className="participant-list">
                            <li className="participant-item">
                                <div className="participant-avatar">Y</div>
                                <span>You (Host)</span>
                                <div className="online-dot" />
                            </li>
                            {participants.map((p, i) => (
                                <li key={i} className="participant-item">
                                    <div className="participant-avatar">{(p.name || 'G')[0]}</div>
                                    <span>{p.name || `Guest ${i + 1}`}</span>
                                    <div className="online-dot" />
                                </li>
                            ))}
                        </ul>
                    </motion.div>

                    <motion.div className="card meeting-info-card" {...fadeUp} transition={{ delay: 0.15 }}>
                        <h4><Info size={16} /> Meeting Info</h4>
                        <div className="meeting-info-row">
                            <span className="info-label">Status</span>
                            <span className="info-value">{isRecording ? '🔴 Recording' : '⏸ Paused'}</span>
                        </div>
                        <div className="meeting-info-row">
                            <span className="info-label">Duration</span>
                            <span className="info-value">{formatTime(duration)}</span>
                        </div>
                        <div className="meeting-info-row">
                            <span className="info-label">Subtitles</span>
                            <span className="info-value">{subtitles.length}</span>
                        </div>
                        <div className="meeting-info-row">
                            <span className="info-label">Connection</span>
                            <span className="info-value" style={{ textTransform: 'capitalize' }}>{connectionQuality}</span>
                        </div>
                        <div className="meeting-info-row">
                            <span className="info-label">Transcription</span>
                            <span className="info-value">{speechSupported ? '🟢 Browser AI' : '🔴 Unavailable'}</span>
                        </div>
                    </motion.div>

                    <motion.div className="card end-meeting-card" {...fadeUp} transition={{ delay: 0.2 }}>
                        <button
                            className="btn btn-danger"
                            style={{ width: '100%' }}
                            onClick={leaveMeeting}
                        >
                            <PhoneOff size={16} /> End & Leave Meeting
                        </button>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
