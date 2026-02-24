import { useRef, useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { meetingsAPI, createMeetingWebSocket } from '../api';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Mic, MicOff, PhoneOff, Users, Clock, Radio,
    MessageSquare, Volume2, Wifi, WifiOff, ArrowLeft,
    Video, VideoOff, Info, Circle, Download, Clipboard, Check,
    Monitor, PenTool, Layout, X, Hand,
    Vote, Shield,
    MessageCircleQuestion, Camera, MoreVertical,
    Maximize, Grid, Wind, Keyboard,
    Lock, FileText, Upload, RefreshCcw, Bell,
    Moon, Sun, Type, Eye, FileEdit, Focus, MousePointer2, UserMinus, Settings,
    ListChecks, Calendar, Share, Link, Copy, CircleHelp, TriangleAlert,
    Share2, Image
} from 'lucide-react';
import toast from 'react-hot-toast';
import './LiveMeeting.css';
import SettingsModal from './SettingsModal';
import { useUserSettings } from '../hooks/useUserSettings';
import Whiteboard from '../components/Whiteboard';
import Chat from '../components/Chat';
import Polls from '../components/Polls';
import AdminControls from '../components/AdminControls';
import QAPanel from '../components/QAPanel';

export default function LiveMeetingPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const myUserId = user?.id;

    // Core State
    const [meetingId, setMeetingId] = useState(id || null);
    const [meetingTitle, setMeetingTitle] = useState(location.state?.title || 'Live Meeting');
    const [isConnected, setIsConnected] = useState(false);
    const [participants, setParticipants] = useState([]);

    // Settings & Features
    const [userSettings, updateSettings] = useUserSettings();
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    // Feature Toggles
    const isLowBandwidth = userSettings.low_bandwidth;
    const isReduceMotion = userSettings.reduce_motion;
    const isDarkMode = userSettings.dark_mode;
    const isCompactChat = userSettings.compact_mode;
    const isShowTimestamps = userSettings.show_timestamps;
    const isPushToTalk = userSettings.push_to_talk;
    const isWatermark = userSettings.watermark;

    // Media State
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOn, setIsVideoOn] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [screenStream, setScreenStream] = useState(null);
    const [peers, setPeers] = useState({});
    const peerConnections = useRef({});
    const cameraStreamRef = useRef(null);

    // UI State
    const [viewMode, setViewMode] = useState('video');
    const [sidebarTab, setSidebarTab] = useState('participants');
    const [showToolsMenu, setShowToolsMenu] = useState(false);

    // Fun & Tools
    const [showZenMode, setShowZenMode] = useState(false);
    const [zenTimer, setZenTimer] = useState(60);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [activePoll, setActivePoll] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [subtitles, setSubtitles] = useState([]);
    const [sharedNote, setSharedNote] = useState('Shared Notepad\n---\nCollaborate here...');
    const [handRaiseQueue, setHandRaiseQueue] = useState([]);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [remoteCursors, setRemoteCursors] = useState({});

    // Admin & Logic
    const [myRole, setMyRole] = useState('viewer');
    const [meetingSettings, setMeetingSettings] = useState({ locked: false, waiting_room: false });
    const [waitingScreen, setWaitingScreen] = useState(false);
    const [waitingUsers, setWaitingUsers] = useState([]);
    const [duration, setDuration] = useState(0);
    const [captionsOn, setCaptionsOn] = useState(true);

    // Refs
    const wsRef = useRef(null);
    const stageRef = useRef(null);
    const recognitionRef = useRef(null);
    const captionsOnRef = useRef(true);

    // Keep camera stream ref in sync
    useEffect(() => {
        cameraStreamRef.current = cameraStream;
    }, [cameraStream]);

    // Keep captionsOn ref in sync
    useEffect(() => {
        captionsOnRef.current = captionsOn;
    }, [captionsOn]);

    // ── Real-time Speech Recognition (auto-start) ──
    useEffect(() => {
        if (!isConnected) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript.trim();
                if (!transcript) continue;

                if (event.results[i].isFinal) {
                    // Final result — add to subtitles & send to others
                    const entry = {
                        speaker: user?.full_name || 'You',
                        text: transcript,
                        timestamp: new Date().toISOString(),
                        final: true,
                    };
                    setSubtitles(prev => [...prev.slice(-50), entry]);
                    // Send to other participants via WebSocket
                    try {
                        wsRef.current?.send(JSON.stringify({
                            type: 'SUBTITLE',
                            speaker: entry.speaker,
                            text: entry.text,
                        }));
                    } catch { }
                } else {
                    // Interim result — update live caption
                    setSubtitles(prev => {
                        const finals = prev.filter(s => s.final);
                        return [...finals.slice(-50), {
                            speaker: user?.full_name || 'You',
                            text: transcript,
                            final: false,
                        }];
                    });
                }
            }
        };

        recognition.onerror = (e) => {
            if (e.error !== 'no-speech' && e.error !== 'aborted') {
                console.warn('Speech recognition error:', e.error);
            }
        };

        recognition.onend = () => {
            // Auto-restart if still connected and captions enabled
            if (captionsOnRef.current) {
                try { recognition.start(); } catch { }
            }
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
        } catch { }

        return () => {
            try { recognition.stop(); } catch { }
            recognitionRef.current = null;
        };
    }, [isConnected, user]);

    // ── Apply Settings Effects ──
    useEffect(() => {
        document.body.className = '';
        if (isDarkMode) document.body.classList.add('dark-mode');
        if (isReduceMotion) document.body.classList.add('reduce-motion');
    }, [isDarkMode, isReduceMotion]);

    // ── Duration Timer ──
    useEffect(() => {
        if (!isConnected) return;
        const interval = setInterval(() => {
            setDuration(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [isConnected]);

    const formatDuration = (secs) => {
        const h = Math.floor(secs / 3600).toString().padStart(2, '0');
        const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    // ── Create Meeting if ID is missing ──
    useEffect(() => {
        if (!meetingId && meetingTitle) {
            meetingsAPI.create({ title: meetingTitle, consent_given: true })
                .then(res => {
                    setMeetingId(res.data.id);
                    navigate(`/meetings/${res.data.id}/live`, { replace: true, state: { title: meetingTitle } });
                })
                .catch(err => {
                    toast.error('Failed to start meeting');
                    console.error(err);
                });
        }
    }, [meetingId, meetingTitle, navigate]);

    // ── Helpers ──
    const playDing = () => {
        try {
            const a = new AudioContext();
            const o = a.createOscillator();
            const g = a.createGain();
            o.connect(g); g.connect(a.destination);
            o.frequency.value = 1200; g.gain.value = 0.1; o.type = 'triangle';
            o.start(); g.gain.exponentialRampToValueAtTime(0.00001, a.currentTime + 0.5);
            o.stop(a.currentTime + 0.5);
        } catch { }
    };

    const playBeep = () => {
        try {
            const a = new AudioContext();
            const o = a.createOscillator();
            const g = a.createGain();
            o.connect(g); g.connect(a.destination);
            o.frequency.value = 600; g.gain.value = 0.1;
            o.start(); g.gain.exponentialRampToValueAtTime(0.00001, a.currentTime + 0.3);
            o.stop(a.currentTime + 0.3);
        } catch { }
    };

    // ── WebRTC Helpers ──
    const createPeerConnection = useCallback((targetId) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        peerConnections.current[targetId] = pc;

        // Add local tracks if we have them
        const stream = cameraStreamRef.current;
        if (stream) {
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
        }

        pc.onicecandidate = (e) => {
            if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'signal', target: targetId, payload: { candidate: e.candidate }
                }));
            }
        };

        pc.ontrack = (e) => {
            setPeers(prev => ({ ...prev, [targetId]: { stream: e.streams[0] } }));
        };

        return pc;
    }, []);

    const initiateCall = useCallback(async (targetId) => {
        let pc = peerConnections.current[targetId];
        if (!pc) {
            pc = createPeerConnection(targetId);
        }
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            wsRef.current?.send(JSON.stringify({
                type: 'signal', target: targetId, payload: { type: 'offer', sdp: pc.localDescription }
            }));
        } catch (err) {
            console.error('Failed to create offer:', err);
        }
    }, [createPeerConnection]);

    const handleSignal = useCallback(async (senderId, payload) => {
        let pc = peerConnections.current[senderId];
        if (!pc) {
            pc = createPeerConnection(senderId);
        }

        try {
            if (payload.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                wsRef.current?.send(JSON.stringify({
                    type: 'signal', target: senderId, payload: { type: 'answer', sdp: pc.localDescription }
                }));
            } else if (payload.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } else if (payload.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        } catch (err) {
            console.error('Signal handling error:', err);
        }
    }, [createPeerConnection]);

    // ── WebSocket & Core Logic ──
    useEffect(() => {
        if (!meetingId || !myUserId) return;

        const ws = createMeetingWebSocket(meetingId);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            console.log('WebSocket connected to meeting', meetingId);
        };

        ws.onclose = () => {
            setIsConnected(false);
            console.log('WebSocket disconnected from meeting', meetingId);
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            setIsConnected(false);
        };

        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'JOIN':
                        if (data.role) setMyRole(data.role);
                        if (data.settings) setMeetingSettings(data.settings);
                        setWaitingScreen(false);
                        // Existing users call the new joiner
                        if (data.user_id !== myUserId && cameraStreamRef.current) {
                            setTimeout(() => initiateCall(data.user_id), 500);
                        }
                        break;
                    case 'WAITING':
                        setWaitingScreen(true);
                        break;
                    case 'ADMITTED':
                        setWaitingScreen(false);
                        toast.success('You have been admitted!');
                        break;
                    case 'WAITING_USER':
                        if (myRole === 'host') {
                            toast(`${data.name} is waiting to join`, { icon: '⏳' });
                            setWaitingUsers(prev => [...prev, { id: data.user_id, name: data.name }]);
                        }
                        break;
                    case 'SETTINGS_UPDATE':
                        if (data.settings) setMeetingSettings(data.settings);
                        break;
                    case 'ROLE_UPDATE':
                        if (data.user_id === myUserId && data.role) {
                            setMyRole(data.role);
                            toast.success(`Your role changed to ${data.role}`);
                        }
                        break;
                    case 'KICK_USER':
                        if (data.target_id === myUserId) {
                            toast.error('You have been removed from the meeting');
                            navigate('/meetings');
                        }
                        break;
                    case 'signal':
                        handleSignal(data.sender, data.payload);
                        break;
                    case 'LEAVE':
                        if (peerConnections.current[data.user_id]) {
                            peerConnections.current[data.user_id].close();
                            delete peerConnections.current[data.user_id];
                            setPeers(prev => {
                                const newPeers = { ...prev };
                                delete newPeers[data.user_id];
                                return newPeers;
                            });
                        }
                        break;
                    case 'CHAT':
                        setChatMessages(p => [...p, {
                            ...data,
                            isMe: false, // Messages from WS are always from others
                            timestamp: data.timestamp || new Date().toISOString()
                        }]);
                        if (userSettings.chat_sound) playDing();
                        break;
                    case 'participants':
                        setParticipants(data.participants || []);
                        break;
                    case 'SUBTITLE':
                        setSubtitles(prev => [...prev.slice(-50), data]);
                        break;
                    case 'HAND_RAISE': {
                        const name = data.user_id === myUserId ? 'You' : (participants.find(p => p.id === data.user_id)?.name || 'Someone');
                        if (userSettings.hand_raise_alert) playBeep();
                        toast(`${name} ${data.is_raised ? 'raised' : 'lowered'} hand`, { icon: '✋' });
                        setHandRaiseQueue(prev =>
                            data.is_raised
                                ? [...prev, { id: data.user_id, name }]
                                : prev.filter(h => h.id !== data.user_id)
                        );
                        break;
                    }
                    case 'NOTE_UPDATE':
                        if (data.sender !== myUserId) setSharedNote(data.noteText);
                        break;
                    case 'CURSOR_MOVE':
                        if (data.sender !== myUserId) {
                            setRemoteCursors(prev => ({
                                ...prev,
                                [data.sender]: { x: data.x, y: data.y, color: data.color || '#f00', name: data.sender }
                            }));
                        }
                        break;
                    case 'POLL_CREATE':
                        setActivePoll({ question: data.question, options: data.options, votes: new Array(data.options.length).fill(0) });
                        toast('New Poll Started!', { icon: '📊' });
                        if (sidebarTab !== 'polls') setSidebarTab('polls');
                        break;
                    case 'POLL_VOTE':
                        setActivePoll(prev => {
                            if (!prev) return prev;
                            const newVotes = [...prev.votes];
                            newVotes[data.option_index]++;
                            return { ...prev, votes: newVotes };
                        });
                        break;
                    case 'QA_ASK':
                        setQuestions(prev => [...prev, { ...data, myUpvote: false }]);
                        toast('New Question Asked', { icon: '❓' });
                        break;
                    case 'QA_UPVOTE':
                        setQuestions(prev => prev.map(q =>
                            q.id === data.question_id
                                ? { ...q, upvotes: (q.upvotes || 0) + 1, myUpvote: data.user_id === myUserId ? true : q.myUpvote }
                                : q
                        ));
                        break;
                    case 'QA_DELETE':
                        setQuestions(prev => prev.filter(q => q.id !== data.question_id));
                        break;
                    case 'REACTION':
                        toast(data.emoji, { duration: 2000, style: { fontSize: '2rem' } });
                        break;
                    case 'CONFETTI':
                        try {
                            const confetti = (await import('canvas-confetti')).default;
                            confetti({ particleCount: 100, spread: 70 });
                        } catch { }
                        break;
                    case 'WHITEBOARD':
                        // Handled by Whiteboard component's own listener
                        break;
                    case 'ERROR':
                        toast.error(data.message || 'Meeting error');
                        break;
                    case 'PONG':
                        // Heartbeat response
                        break;
                    default:
                        break;
                }
            } catch (err) {
                console.error('WS message parse error:', err);
            }
        };

        // Heartbeat
        const heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'PING' }));
            }
        }, 30000);

        return () => {
            clearInterval(heartbeat);
            ws.close();
            Object.values(peerConnections.current).forEach(pc => pc.close());
            peerConnections.current = {};
        };
    }, [meetingId, myUserId]);

    // ── Media Actions ──
    const toggleMute = () => {
        if (cameraStream) {
            cameraStream.getAudioTracks().forEach(track => track.enabled = isMuted);
        }
        setIsMuted(!isMuted);
    };

    const toggleVideo = async () => {
        if (isVideoOn) {
            if (cameraStream) {
                cameraStream.getTracks().forEach(t => t.stop());
                setCameraStream(null);
            }
            setIsVideoOn(false);
        } else {
            try {
                const constraints = {
                    video: isLowBandwidth ? { width: 320, height: 240 } : { width: 1280, height: 720 },
                    audio: true
                };
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                setCameraStream(stream);
                setIsVideoOn(true);

                // Add tracks to existing peer connections
                stream.getTracks().forEach(track => {
                    Object.values(peerConnections.current).forEach(pc => {
                        pc.addTrack(track, stream);
                    });
                });
            } catch (err) {
                toast.error("Camera access denied");
                console.error('Camera error:', err);
            }
        }
    };

    const toggleScreenShare = async () => {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            setScreenStream(null);
            // Replace back with camera track
            if (cameraStream && isVideoOn) {
                const videoTrack = cameraStream.getVideoTracks()[0];
                Object.values(peerConnections.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender && videoTrack) sender.replaceTrack(videoTrack);
                });
            }
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' } });
                setScreenStream(stream);
                const screenTrack = stream.getVideoTracks()[0];

                screenTrack.onended = () => {
                    setScreenStream(null);
                    if (cameraStream && isVideoOn) {
                        const videoTrack = cameraStream.getVideoTracks()[0];
                        Object.values(peerConnections.current).forEach(pc => {
                            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                            if (sender && videoTrack) sender.replaceTrack(videoTrack);
                        });
                    }
                };

                Object.values(peerConnections.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                });

                toast.success('Screen sharing started');
            } catch (err) {
                if (err.name !== 'NotAllowedError') {
                    toast.error("Screen share failed");
                }
            }
        }
    };

    const toggleHandRaise = () => {
        const newState = !isHandRaised;
        setIsHandRaised(newState);
        wsRef.current?.send(JSON.stringify({
            type: 'HAND_RAISE',
            is_raised: newState
        }));
    };

    const sendReaction = (emoji) => {
        wsRef.current?.send(JSON.stringify({ type: 'REACTION', emoji, sender: user?.full_name || 'User' }));
        toast(emoji, { duration: 2000, style: { fontSize: '2rem' } });
    };

    const handleEndMeeting = () => {
        // Stop speech recognition first
        setCaptionsOn(false);
        captionsOnRef.current = false;
        try { recognitionRef.current?.stop(); } catch { }
        recognitionRef.current = null;

        // Instantly stop all media tracks (camera + mic off)
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
            setCameraStream(null);
        }
        if (screenStream) {
            screenStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
            setScreenStream(null);
        }
        setIsVideoOn(false);
        setIsMuted(true);

        // Close all peer connections instantly
        Object.values(peerConnections.current).forEach(pc => pc.close());
        peerConnections.current = {};
        setPeers({});

        // Send leave & close WS (non-blocking)
        try { wsRef.current?.send(JSON.stringify({ type: 'LEAVE' })); } catch { }
        try { wsRef.current?.close(); } catch { }
        wsRef.current = null;

        // Navigate immediately
        navigate('/meetings');
    };

    // ── Share Helpers ──
    const shareNotepad = () => {
        navigator.clipboard.writeText(sharedNote);
        toast.success('Notes copied to clipboard!');
    };

    const shareWhiteboard = () => {
        const canvas = document.querySelector('.whiteboard-canvas canvas');
        if (canvas) {
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `whiteboard-${meetingTitle || 'meeting'}-${new Date().toISOString().slice(0, 10)}.png`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Whiteboard saved as image!');
            });
        } else {
            toast.error('No whiteboard content to save');
        }
    };

    const sharePollResults = () => {
        if (!activePoll) {
            toast.error('No active poll to share');
            return;
        }
        const totalVotes = activePoll.votes.reduce((a, b) => a + b, 0);
        let text = `📊 Poll: ${activePoll.question}\n`;
        text += '─'.repeat(30) + '\n';
        activePoll.options.forEach((opt, i) => {
            const pct = totalVotes ? Math.round((activePoll.votes[i] / totalVotes) * 100) : 0;
            text += `${opt}: ${activePoll.votes[i]} votes (${pct}%)\n`;
        });
        text += `\nTotal votes: ${totalVotes}`;
        navigator.clipboard.writeText(text);
        toast.success('Poll results copied!');
    };

    const copyInviteLink = () => {
        navigator.clipboard.writeText(window.location.href);
        toast.success('Meeting link copied! Share it with anyone to join.');
    };

    // ── Keyboard Shortcuts ──
    useEffect(() => {
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.key.toLowerCase()) {
                case 'm': toggleMute(); break;
                case 'v': toggleVideo(); break;
                case 'h': toggleHandRaise(); break;
                case '?': setShowShortcuts(s => !s); break;
                default: break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isMuted, isVideoOn, isHandRaised]);

    // ── Zen Mode Timer ──
    useEffect(() => {
        if (!showZenMode || zenTimer <= 0) return;
        const interval = setInterval(() => {
            setZenTimer(prev => {
                if (prev <= 1) {
                    setShowZenMode(false);
                    toast.success('Focus session complete! 🧘');
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [showZenMode, zenTimer]);

    // ── Render ──
    return (
        <div className={`page-container live-meeting-page ${isDarkMode ? 'dark-mode' : ''}`}>

            {/* Settings Modal */}
            <SettingsModal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
                userSettings={userSettings}
                onUpdateSettings={updateSettings}
            />

            {/* Waiting Screen Overlay */}
            <AnimatePresence>
                {waitingScreen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="zen-mode-overlay"
                        style={{ background: 'var(--meeting-bg, #0f172a)', zIndex: 2000, color: 'var(--meeting-text, #f8fafc)' }}
                    >
                        <div style={{ textAlign: 'center' }}>
                            <Clock size={48} className="pulse-icon" style={{ color: 'var(--meeting-accent, #6366f1)', marginBottom: 20 }} />
                            <h2>Waiting for Host</h2>
                            <p style={{ color: 'var(--text-muted, #94a3b8)' }}>The host will let you in shortly.</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Zen Mode Overlay */}
            <AnimatePresence>
                {showZenMode && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="zen-mode-overlay"
                        style={{
                            background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
                            zIndex: 1500,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 24
                        }}
                    >
                        <Wind size={64} style={{ color: '#818cf8', opacity: 0.6 }} />
                        <h2 style={{ color: '#e2e8f0', fontSize: '2rem' }}>Focus Mode</h2>
                        <div style={{ fontSize: '4rem', fontWeight: '700', color: '#a5b4fc', fontFamily: 'monospace' }}>
                            {Math.floor(zenTimer / 60)}:{(zenTimer % 60).toString().padStart(2, '0')}
                        </div>
                        <p style={{ color: '#94a3b8', maxWidth: 400, textAlign: 'center' }}>
                            Take a moment to breathe and focus. All notifications are paused.
                        </p>
                        <button className="btn btn-secondary" onClick={() => { setShowZenMode(false); setZenTimer(60); }}>
                            <X size={16} /> Exit Focus
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Keyboard Shortcuts Overlay */}
            <AnimatePresence>
                {showShortcuts && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        onClick={() => setShowShortcuts(false)}
                    >
                        <div style={{
                            background: 'var(--bg-primary, #1e293b)', borderRadius: 16, padding: 32,
                            maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                        }}
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Keyboard size={20} /> Keyboard Shortcuts
                            </h3>
                            {[
                                { key: 'M', action: 'Toggle Mute' },
                                { key: 'V', action: 'Toggle Video' },
                                { key: 'H', action: 'Raise/Lower Hand' },
                                { key: '?', action: 'Show Shortcuts' },
                            ].map(s => (
                                <div key={s.key} style={{
                                    display: 'flex', justifyContent: 'space-between', padding: '8px 0',
                                    borderBottom: '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    <span>{s.action}</span>
                                    <kbd style={{
                                        background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4,
                                        fontFamily: 'monospace', fontSize: '0.85rem'
                                    }}>{s.key}</kbd>
                                </div>
                            ))}
                            <button className="btn btn-primary" style={{ width: '100%', marginTop: 20 }}
                                onClick={() => setShowShortcuts(false)}>
                                Got it!
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="live-header">
                <div className="live-header-left">
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/meetings')}><ArrowLeft size={16} /></button>
                    <div>
                        <h1 className="page-title">{meetingTitle} {meetingSettings.locked && <Lock size={12} />}</h1>
                        <div className="live-meta">
                            <span className="live-timer"><Clock size={12} /> {formatDuration(duration)}</span>
                            <span className={`badge ${isConnected ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                                {isConnected ? <><Wifi size={10} /> Connected</> : <><WifiOff size={10} /> Disconnected</>}
                            </span>
                            {isLowBandwidth && <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Low Bandwidth</span>}
                        </div>
                    </div>
                </div>

                <div className="live-header-actions">
                    {/* Quick Reactions */}
                    <div style={{ display: 'flex', gap: 4 }}>
                        {['👍', '🎉', '❤️', '😂'].map(emoji => (
                            <button key={emoji} className="btn btn-ghost btn-sm" onClick={() => sendReaction(emoji)}
                                style={{ fontSize: '1.1rem', padding: '4px 6px' }}>{emoji}</button>
                        ))}
                    </div>

                    {/* Tools Menu */}
                    <div style={{ position: 'relative' }}>
                        <button className={`btn btn-secondary ${showToolsMenu ? 'active' : ''}`}
                            onClick={() => setShowToolsMenu(!showToolsMenu)}>
                            <Grid size={16} /> <span style={{ marginLeft: 4 }}>Tools</span>
                        </button>
                        {showToolsMenu && (
                            <div className="tool-menu">
                                <div className="menu-section-title">ESSENTIALS</div>
                                <button className="menu-item" onClick={() => { setShowSettingsModal(true); setShowToolsMenu(false); }}>
                                    <Settings size={16} /> Settings & Performance
                                </button>
                                <button className="menu-item" onClick={() => { setSidebarTab('notepad'); setShowToolsMenu(false); }}>
                                    <FileEdit size={16} /> Shared Notepad
                                </button>
                                <button className="menu-item" onClick={() => { setSidebarTab('polls'); setShowToolsMenu(false); }}>
                                    <Vote size={16} /> Create Poll
                                </button>
                                <button className="menu-item" onClick={() => { setShowShortcuts(true); setShowToolsMenu(false); }}>
                                    <Keyboard size={16} /> Keyboard Shortcuts
                                </button>
                                <div className="menu-divider"></div>

                                <div className="menu-section-title">ACTIONS</div>
                                <button className="menu-item" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link Copied'); setShowToolsMenu(false); }}>
                                    <Copy size={16} /> Copy Invite Link
                                </button>
                                <button className="menu-item" onClick={() => { setShowZenMode(true); setZenTimer(60); setShowToolsMenu(false); }}>
                                    <Wind size={16} /> Zen Mode (Focus)
                                </button>
                                {myRole === 'host' && (
                                    <button className="menu-item" onClick={() => {
                                        if (confirm('Mute all participants?')) {
                                            toast.success('Muted All');
                                        }
                                        setShowToolsMenu(false);
                                    }} style={{ color: '#ef4444' }}>
                                        <MicOff size={16} /> Mute Everyone
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Control Buttons */}
                    <button className={`btn ${isMuted ? 'btn-danger' : 'btn-secondary'}`} onClick={toggleMute} title="Toggle Mute (M)">
                        {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                    <button className={`btn ${isVideoOn ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleVideo} title="Toggle Video (V)">
                        {isVideoOn ? <Video size={16} /> : <VideoOff size={16} />}
                    </button>
                    <button className={`btn ${screenStream ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleScreenShare} title="Share Screen">
                        <Monitor size={16} />
                    </button>
                    <button className={`btn ${viewMode === 'whiteboard' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode(viewMode === 'whiteboard' ? 'video' : 'whiteboard')} title="Whiteboard">
                        <PenTool size={16} />
                    </button>
                    <button className={`btn ${isHandRaised ? 'btn-warning' : 'btn-secondary'}`} onClick={toggleHandRaise} title="Raise Hand (H)">
                        <Hand size={16} />
                    </button>
                    <button className={`btn ${captionsOn ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => {
                            setCaptionsOn(!captionsOn);
                            if (captionsOn) {
                                try { recognitionRef.current?.stop(); } catch { }
                            }
                            toast(captionsOn ? 'Captions off' : 'Captions on');
                        }}
                        title="Toggle Captions"
                    >
                        <Type size={16} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={copyInviteLink} title="Copy Invite Link">
                        <Share2 size={16} />
                    </button>
                    <button className="btn btn-danger" onClick={handleEndMeeting} title="Leave Meeting">
                        <PhoneOff size={16} /> Leave
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="live-content">
                <div className="stage-area" ref={stageRef} style={{ position: 'relative' }}>
                    {/* Watermark Overlay */}
                    {isWatermark && (
                        <div className="watermark-overlay">
                            <div className="watermark-pattern">CONFIDENTIAL • {new Date().toLocaleDateString()}</div>
                        </div>
                    )}

                    {/* Remote Cursors */}
                    {Object.values(remoteCursors).map((c, i) => (
                        <div key={i} style={{
                            position: 'absolute', left: `${c.x * 100}%`, top: `${c.y * 100}%`,
                            pointerEvents: 'none', zIndex: 50, transition: 'all 0.1s linear'
                        }}>
                            <MousePointer2 size={16} fill={c.color} color={c.color} />
                            <span style={{ background: c.color, color: 'white', fontSize: '0.7rem', borderRadius: 4, padding: '0 4px', marginLeft: 8 }}>{c.name}</span>
                        </div>
                    ))}

                    {/* Main Stage Content */}
                    {viewMode === 'whiteboard' ? (
                        <div style={{ width: '100%', height: '100%', background: '#fff', position: 'relative' }}>
                            <Whiteboard ws={wsRef.current} isActive={true} />
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={shareWhiteboard}
                                title="Download whiteboard as image"
                                style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 4, alignItems: 'center' }}
                            >
                                <Download size={14} /> Save
                            </button>
                        </div>
                    ) : (
                        <div className="video-grid-layout">
                            {/* Screen Share (if active) */}
                            {screenStream && (
                                <div className="video-card screen-share" style={{ gridColumn: '1 / -1' }}>
                                    <video
                                        ref={ref => { if (ref) ref.srcObject = screenStream; }}
                                        autoPlay playsInline muted
                                    />
                                    <div className="video-label"><Monitor size={12} /> Screen Share</div>
                                </div>
                            )}

                            {/* Local Video */}
                            <div className="video-card local">
                                {isVideoOn && cameraStream ? (
                                    <video
                                        ref={ref => { if (ref) ref.srcObject = cameraStream; }}
                                        autoPlay playsInline muted
                                    />
                                ) : (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        height: '100%', color: 'var(--text-muted, #94a3b8)', flexDirection: 'column', gap: 8
                                    }}>
                                        <div style={{
                                            width: 56, height: 56, borderRadius: '50%', background: 'rgba(99,102,241,0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
                                            color: '#a5b4fc', fontWeight: '600'
                                        }}>
                                            {(user?.full_name?.[0] || 'Y').toUpperCase()}
                                        </div>
                                        <span style={{ fontSize: '0.85rem' }}>Camera Off</span>
                                    </div>
                                )}
                                <div className="video-label">You {isMuted && '🔇'} {isHandRaised && '✋'}</div>
                            </div>

                            {/* Remote Peers */}
                            {Object.entries(peers).map(([pid, p]) => (
                                <div key={pid} className="video-card remote">
                                    <video
                                        ref={ref => { if (ref && p.stream) ref.srcObject = p.stream; }}
                                        autoPlay playsInline
                                    />
                                    <div className="video-label">
                                        {participants.find(pt => pt.id == pid)?.name || `User ${pid}`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Subtitles Overlay */}
                    {captionsOn && subtitles.length > 0 && (
                        <div style={{
                            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px',
                            borderRadius: 10, maxWidth: '85%', textAlign: 'left', fontSize: '0.9rem',
                            backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', gap: 4,
                            maxHeight: 120, overflow: 'hidden'
                        }}>
                            {subtitles.slice(-3).map((s, i, arr) => (
                                <div key={i} style={{
                                    opacity: i === arr.length - 1 ? 1 : 0.6,
                                    fontStyle: s.final === false ? 'italic' : 'normal',
                                }}>
                                    <strong style={{ color: '#a5b4fc' }}>{s.speaker}:</strong>{' '}
                                    {s.text}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className="live-sidebar">
                    <div className="sidebar-tabs">
                        <button className={`sidebar-tab ${sidebarTab === 'participants' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('participants')} title="People">
                            <Users size={18} />
                        </button>
                        <button className={`sidebar-tab ${sidebarTab === 'chat' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('chat')} title="Chat">
                            <MessageSquare size={18} />
                        </button>
                        <button className={`sidebar-tab ${sidebarTab === 'polls' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('polls')} title="Polls">
                            <Vote size={18} />
                        </button>
                        <button className={`sidebar-tab ${sidebarTab === 'qa' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('qa')} title="Q&A">
                            <MessageCircleQuestion size={18} />
                        </button>
                        <button className={`sidebar-tab ${sidebarTab === 'notepad' ? 'active' : ''}`}
                            onClick={() => setSidebarTab('notepad')} title="Notes">
                            <FileEdit size={18} />
                        </button>
                        {myRole === 'host' && (
                            <button className={`sidebar-tab ${sidebarTab === 'admin' ? 'active' : ''}`}
                                onClick={() => setSidebarTab('admin')} title="Admin">
                                <Shield size={18} />
                            </button>
                        )}
                    </div>
                    <div className="sidebar-content">
                        {sidebarTab === 'participants' && (
                            <div className="participants-wrap">
                                {handRaiseQueue.length > 0 && (
                                    <div className="hand-raise-queue" style={{
                                        padding: 8, background: 'rgba(245,158,11,0.1)',
                                        borderBottom: '1px solid rgba(245,158,11,0.2)'
                                    }}>
                                        <small style={{ fontWeight: 'bold', color: '#f59e0b' }}>✋ Hand Queue</small>
                                        {handRaiseQueue.map((h, i) => (
                                            <div key={i} style={{ fontSize: '0.8rem' }}>{i + 1}. {h.name}</div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ padding: 12 }}>
                                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)', marginBottom: 8 }}>
                                        Participants ({participants.length || 1})
                                    </h4>
                                </div>
                                <ul className="participant-list">
                                    {participants.length > 0 ? (
                                        participants.map((p, i) => (
                                            <li key={i} className="participant-item">
                                                <div className="participant-avatar">{(p.name || 'U')[0]}</div>
                                                <span>{p.name || `User ${p.id}`} {p.id === myUserId && '(You)'}</span>
                                                {p.role === 'host' && <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Host</span>}
                                            </li>
                                        ))
                                    ) : (
                                        <li className="participant-item">
                                            <div className="participant-avatar">{(user?.full_name?.[0] || 'Y')}</div>
                                            <span>{user?.full_name || 'You'} (You)</span>
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}
                        {sidebarTab === 'chat' && (
                            <Chat
                                ws={wsRef.current}
                                messages={chatMessages}
                                isCompact={isCompactChat}
                                showTimestamps={isShowTimestamps}
                                onSendMessage={(text) => {
                                    // Add message locally as "me"
                                    setChatMessages(prev => [...prev, {
                                        sender: user?.full_name || 'You',
                                        text,
                                        isMe: true,
                                        timestamp: new Date().toISOString()
                                    }]);
                                    // Send to server
                                    wsRef.current?.send(JSON.stringify({
                                        type: 'CHAT',
                                        text,
                                        sender: user?.full_name || 'User'
                                    }));
                                }}
                            />
                        )}
                        {sidebarTab === 'polls' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                {activePoll && (
                                    <div style={{ padding: '8px 12px 0', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={sharePollResults}
                                            title="Copy poll results"
                                            style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.75rem' }}
                                        >
                                            <Share2 size={12} /> Share Results
                                        </button>
                                    </div>
                                )}
                                <Polls
                                    ws={wsRef.current}
                                    activePoll={activePoll}
                                    isHost={myRole === 'host'}
                                    onCreatePoll={(pollData) => {
                                        wsRef.current?.send(JSON.stringify({ type: 'POLL_CREATE', ...pollData }));
                                    }}
                                />
                            </div>
                        )}
                        {sidebarTab === 'qa' && (
                            <QAPanel
                                ws={wsRef.current}
                                questions={questions}
                                isHost={myRole === 'host'}
                                onAsk={(qData) => wsRef.current?.send(JSON.stringify({
                                    type: 'QA_ASK', ...qData, id: Date.now(),
                                    sender: user?.full_name || 'User'
                                }))}
                                onUpvote={(qid) => wsRef.current?.send(JSON.stringify({ type: 'QA_UPVOTE', question_id: qid }))}
                                onDelete={(qid) => wsRef.current?.send(JSON.stringify({ type: 'QA_DELETE', question_id: qid }))}
                            />
                        )}
                        {sidebarTab === 'notepad' && (
                            <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                                        <FileEdit size={14} /> Shared Notes
                                    </h4>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={shareNotepad}
                                        title="Copy notes to clipboard"
                                        style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.75rem' }}
                                    >
                                        <Share2 size={12} /> Share
                                    </button>
                                </div>
                                <textarea
                                    className="shared-notepad"
                                    value={sharedNote}
                                    onChange={(e) => {
                                        setSharedNote(e.target.value);
                                        wsRef.current?.send(JSON.stringify({ type: 'NOTE_UPDATE', noteText: e.target.value }));
                                    }}
                                    style={{
                                        flex: 1, width: '100%', resize: 'none',
                                        background: 'var(--bg-secondary, #1e293b)',
                                        border: '1px solid var(--border-color, #334155)',
                                        borderRadius: 8, padding: 12, color: 'inherit',
                                        fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.6
                                    }}
                                />
                            </div>
                        )}
                        {sidebarTab === 'admin' && myRole === 'host' && (
                            <AdminControls
                                ws={wsRef.current}
                                meetingSettings={meetingSettings}
                                participants={participants}
                                waitingUsers={waitingUsers}
                                onUpdateSettings={(s) => wsRef.current?.send(JSON.stringify({ type: 'ADMIN_UPDATE', settings: s }))}
                                onKick={(uid) => {
                                    wsRef.current?.send(JSON.stringify({ type: 'ADMIN_ACTION', action: 'KICK', target_id: uid }));
                                    toast.success('User kicked');
                                }}
                                onSetRole={(uid, role) => {
                                    wsRef.current?.send(JSON.stringify({ type: 'ADMIN_ACTION', action: 'SET_ROLE', target_id: uid, role }));
                                    toast.success(`User role set to ${role}`);
                                }}
                                onAdmit={(uid) => {
                                    wsRef.current?.send(JSON.stringify({ type: 'ADMIN_ACTION', action: 'ADMIT', target_id: uid }));
                                    toast.success('User admitted');
                                    setWaitingUsers(prev => prev.filter(u => u.id !== uid));
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
