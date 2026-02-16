import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { videoMeetingAPI, createVideoMeetingWebSocket } from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Video, VideoOff, Mic, MicOff, MonitorUp, PhoneOff,
    MessageSquare, Users, Copy, Check, Send, Hand,
    Maximize, Minimize, ScreenShareOff, X, Radio, Clock,
    Link as LinkIcon, Lock, Unlock, Shield, UserX, Volume2,
    VolumeX, Circle, Square, Pencil, BarChart3, StickyNote,
    Eraser, Trash2, ChevronDown, Settings, Layers, Image,
    Download, Keyboard, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import './VideoMeeting.css';

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

export default function VideoMeetingPage() {
    const { roomId: paramRoomId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── Core State ──
    const [phase, setPhase] = useState('lobby');          // lobby | waiting | meeting
    const [roomId, setRoomId] = useState(paramRoomId || '');
    const [displayName, setDisplayName] = useState(user?.full_name || '');
    const [participants, setParticipants] = useState([]);
    const [isHost, setIsHost] = useState(false);
    const [duration, setDuration] = useState(0);

    // ── Media State ──
    const [videoOn, setVideoOn] = useState(true);
    const [audioOn, setAudioOn] = useState(true);
    const [screenSharing, setScreenSharing] = useState(false);
    const [bgBlur, setBgBlur] = useState(false);
    const [handRaised, setHandRaised] = useState(false);

    // ── Panels ──
    const [activePanel, setActivePanel] = useState(null);  // chat | participants | whiteboard | polls | notes | shortcuts | settings
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [viewMode, setViewMode] = useState('gallery');   // gallery | speaker
    const [pinnedUser, setPinnedUser] = useState(null);

    // ── Chat ──
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [unreadChat, setUnreadChat] = useState(0);

    // ── Recording ──
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    // ── Settings ──
    const [meetingSettings, setMeetingSettings] = useState({
        locked: false, waiting_room_enabled: false, recording: false, host_id: '',
    });
    const [waitingList, setWaitingList] = useState([]);

    // ── Polls ──
    const [polls, setPolls] = useState({});
    const [newPollQuestion, setNewPollQuestion] = useState('');
    const [newPollOptions, setNewPollOptions] = useState(['', '']);

    // ── Notes ──
    const [meetingNotes, setMeetingNotes] = useState('');

    // ── Whiteboard ──
    const [wbColor, setWbColor] = useState('#ffffff');
    const [wbWidth, setWbWidth] = useState(2);
    const [wbTool, setWbTool] = useState('pen');
    const [copied, setCopied] = useState(false);
    const [remoteStreams, setRemoteStreams] = useState({});

    // ── Refs ──
    const wsRef = useRef(null);
    const localStreamRef = useRef(null);
    const screenStreamRef = useRef(null);
    const peerConnectionsRef = useRef({});
    const remoteStreamsRef = useRef({});
    const localVideoRef = useRef(null);
    const chatEndRef = useRef(null);
    const timerRef = useRef(null);
    const recTimerRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const canvasRef = useRef(null);
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef(null);
    const userIdRef = useRef(user?.id?.toString() || Math.random().toString(36).slice(2, 14));

    // ── Timer ──
    useEffect(() => {
        if (phase === 'meeting') {
            timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [phase]);

    // ── Auto-start camera in lobby ──
    useEffect(() => {
        if (phase === 'lobby') {
            getLocalStream();
        }
    }, []);

    // ── Re-attach stream when phase changes (critical fix for blank video) ──
    useEffect(() => {
        if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
    }, [phase]);

    const formatTime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    // ── Get Local Media ──
    const getLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720, facingMode: 'user' },
                audio: true,
            });
            localStreamRef.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            return stream;
        } catch {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                localStreamRef.current = stream;
                setVideoOn(false);
                return stream;
            } catch {
                toast.error('No media devices available');
                return null;
            }
        }
    }, []);

    // ── Create Peer Connection ──
    const createPeerConnection = useCallback((remoteUserId) => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }
        pc.onicecandidate = (e) => {
            if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice-candidate', target: remoteUserId, candidate: e.candidate,
                }));
            }
        };
        pc.ontrack = (e) => {
            const [stream] = e.streams;
            remoteStreamsRef.current[remoteUserId] = stream;
            setRemoteStreams(prev => ({ ...prev, [remoteUserId]: stream }));
        };
        peerConnectionsRef.current[remoteUserId] = pc;
        return pc;
    }, []);

    // ── Connect to Room ──
    const connectToRoom = useCallback(async () => {
        // Reuse existing stream or get a new one
        let stream = localStreamRef.current;
        if (!stream) {
            stream = await getLocalStream();
            if (!stream) return;
        }
        const ws = createVideoMeetingWebSocket(roomId, userIdRef.current, displayName);
        wsRef.current = ws;

        ws.onopen = () => toast('Connecting…', { icon: '🔗' });

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            switch (data.type) {
                // ── Core Signaling ──
                case 'room-joined':
                case 'admitted': {
                    setPhase('meeting');
                    setParticipants(data.participants || []);
                    setChatMessages(data.chat_history || []);
                    setIsHost(data.is_host);
                    setMeetingSettings(data.settings || {});
                    setPolls(data.polls || {});
                    toast.success('Joined meeting');
                    for (const p of (data.participants || [])) {
                        if (p.user_id !== userIdRef.current) {
                            const pc = createPeerConnection(p.user_id);
                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            ws.send(JSON.stringify({ type: 'offer', target: p.user_id, offer: pc.localDescription }));
                        }
                    }
                    break;
                }
                case 'waiting-room':
                    setPhase('waiting');
                    toast('Waiting for host to admit you…', { icon: '⏳', duration: 10000 });
                    break;
                case 'meeting-locked':
                    toast.error('This meeting is locked.');
                    navigate('/dashboard');
                    break;
                case 'rejected':
                    toast.error(data.message || 'Entry denied.');
                    navigate('/dashboard');
                    break;
                case 'removed':
                    toast.error(data.message || 'You were removed.');
                    leaveMeeting();
                    break;
                case 'meeting-ended':
                    toast(data.message || 'Meeting ended.', { icon: '📞' });
                    leaveMeeting();
                    break;
                case 'user-joined':
                    setParticipants(data.participants);
                    toast(`${data.display_name} joined`, { icon: '👋' });
                    break;
                case 'user-left': {
                    setParticipants(data.participants);
                    toast(`${data.display_name} left`, { icon: '👋' });
                    const pc = peerConnectionsRef.current[data.user_id];
                    if (pc) { pc.close(); delete peerConnectionsRef.current[data.user_id]; }
                    delete remoteStreamsRef.current[data.user_id];
                    setRemoteStreams(prev => { const n = { ...prev }; delete n[data.user_id]; return n; });
                    break;
                }
                case 'offer': {
                    const pc = createPeerConnection(data.from_user);
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    ws.send(JSON.stringify({ type: 'answer', target: data.from_user, answer: pc.localDescription }));
                    break;
                }
                case 'answer': {
                    const pc = peerConnectionsRef.current[data.from_user];
                    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    break;
                }
                case 'ice-candidate': {
                    const pc = peerConnectionsRef.current[data.from_user];
                    if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    break;
                }
                // ── Feature Events ──
                case 'chat':
                    setChatMessages(prev => [...prev, data]);
                    if (activePanel !== 'chat') setUnreadChat(u => u + 1);
                    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
                    break;
                case 'media-state':
                    setParticipants(prev => prev.map(p =>
                        p.user_id === data.user_id
                            ? { ...p, video_on: data.video ?? p.video_on, audio_on: data.audio ?? p.audio_on, screen_sharing: data.screen ?? p.screen_sharing, bg_blurred: data.bg_blur ?? p.bg_blurred }
                            : p
                    ));
                    break;
                case 'hand-raised':
                    setParticipants(data.participants);
                    if (data.raised) toast(`${data.display_name} raised hand`, { icon: '✋' });
                    break;
                case 'all-hands-lowered':
                    setParticipants(data.participants);
                    toast('All hands lowered', { icon: '👇' });
                    break;
                case 'reaction':
                    toast(`${data.display_name}: ${data.emoji}`, { duration: 2000 });
                    break;
                case 'host-mute-all':
                    setParticipants(data.participants);
                    toast('Host muted all participants', { icon: '🔇' });
                    break;
                case 'force-mute':
                    if (localStreamRef.current) {
                        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
                        setAudioOn(false);
                    }
                    toast(data.message, { icon: '🔇' });
                    break;
                case 'settings-update':
                    setMeetingSettings(data.settings);
                    break;
                case 'host-changed':
                    setParticipants(data.participants);
                    setMeetingSettings(data.settings);
                    setIsHost(data.new_host === userIdRef.current);
                    if (data.new_host === userIdRef.current) toast.success('You are now the host!');
                    break;
                case 'waiting-room-update':
                    setWaitingList(data.waiting_list || []);
                    break;
                case 'recording-state':
                    if (data.recording) toast('Recording started', { icon: '🔴' });
                    else toast('Recording stopped', { icon: '⏹️' });
                    break;
                case 'poll-created':
                    setPolls(prev => ({ ...prev, [data.poll.poll_id]: data.poll }));
                    toast('New poll created!', { icon: '📊' });
                    break;
                case 'poll-updated':
                    setPolls(prev => ({ ...prev, [data.poll.poll_id]: data.poll }));
                    break;
                case 'poll-ended':
                    setPolls(prev => ({ ...prev, [data.poll.poll_id]: data.poll }));
                    toast('Poll ended', { icon: '📊' });
                    break;
                case 'whiteboard-stroke':
                    drawRemoteStroke(data);
                    break;
                case 'whiteboard-clear':
                    clearCanvas();
                    break;
                case 'breakout-update':
                    setParticipants(data.participants);
                    toast('Breakout rooms updated', { icon: '🏠' });
                    break;
                case 'breakout-closed':
                    setParticipants(data.participants);
                    toast('Breakout rooms closed', { icon: '🏠' });
                    break;
            }
        };

        ws.onclose = () => {
            if (phase === 'meeting') toast('Disconnected');
        };
    }, [roomId, displayName, getLocalStream, createPeerConnection, activePanel]);

    // ── Media Controls ──
    const toggleVideo = () => {
        const vt = localStreamRef.current?.getVideoTracks()[0];
        if (vt) { vt.enabled = !vt.enabled; setVideoOn(vt.enabled); wsRef.current?.send(JSON.stringify({ type: 'media-state', video: vt.enabled })); }
    };
    const toggleAudio = () => {
        const at = localStreamRef.current?.getAudioTracks()[0];
        if (at) { at.enabled = !at.enabled; setAudioOn(at.enabled); wsRef.current?.send(JSON.stringify({ type: 'media-state', audio: at.enabled })); }
    };
    const toggleBgBlur = () => {
        setBgBlur(!bgBlur);
        wsRef.current?.send(JSON.stringify({ type: 'media-state', bg_blur: !bgBlur }));
    };
    const toggleHand = () => {
        setHandRaised(!handRaised);
        wsRef.current?.send(JSON.stringify({ type: 'raise-hand', raised: !handRaised }));
    };
    const toggleScreenShare = async () => {
        if (screenSharing) {
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            const vt = localStreamRef.current?.getVideoTracks()[0];
            Object.values(peerConnectionsRef.current).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender && vt) sender.replaceTrack(vt);
            });
            setScreenSharing(false);
            wsRef.current?.send(JSON.stringify({ type: 'media-state', screen: false }));
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
                screenStreamRef.current = stream;
                const st = stream.getVideoTracks()[0];
                Object.values(peerConnectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(st);
                });
                st.onended = () => toggleScreenShare();
                setScreenSharing(true);
                wsRef.current?.send(JSON.stringify({ type: 'media-state', screen: true }));
            } catch { /* user cancelled */ }
        }
    };

    // ── Recording ──
    const toggleRecording = () => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            clearInterval(recTimerRef.current);
            wsRef.current?.send(JSON.stringify({ type: 'host-action', action: 'toggle-recording', recording: false }));
        } else {
            try {
                const stream = localVideoRef.current?.captureStream?.() || localStreamRef.current;
                if (!stream) { toast.error('No stream to record'); return; }
                const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
                recordedChunksRef.current = [];
                mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
                mr.onstop = () => {
                    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `meeting-${roomId}-${Date.now()}.webm`;
                    a.click(); URL.revokeObjectURL(url);
                    toast.success('Recording saved!');
                };
                mr.start(1000);
                mediaRecorderRef.current = mr;
                setIsRecording(true);
                setRecordingTime(0);
                recTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
                wsRef.current?.send(JSON.stringify({ type: 'host-action', action: 'toggle-recording', recording: true }));
                toast.success('Recording started');
            } catch { toast.error('Recording not supported'); }
        }
    };

    // ── Host Actions ──
    const hostAction = (action, extra = {}) => {
        wsRef.current?.send(JSON.stringify({ type: 'host-action', action, ...extra }));
    };

    // ── Chat ──
    const sendChat = (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        wsRef.current?.send(JSON.stringify({ type: 'chat', message: chatInput.trim() }));
        setChatInput('');
    };

    // ── Polls ──
    const createPoll = () => {
        const validOptions = newPollOptions.filter(o => o.trim());
        if (!newPollQuestion.trim() || validOptions.length < 2) {
            toast.error('Need a question and at least 2 options'); return;
        }
        wsRef.current?.send(JSON.stringify({ type: 'create-poll', question: newPollQuestion, options: validOptions }));
        setNewPollQuestion(''); setNewPollOptions(['', '']);
    };
    const votePoll = (pollId, idx) => {
        wsRef.current?.send(JSON.stringify({ type: 'vote-poll', poll_id: pollId, option_index: idx }));
    };

    // ── Whiteboard ──
    const drawRemoteStroke = (data) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const pts = data.points || [];
        if (pts.length < 2) return;
        ctx.strokeStyle = data.color || '#fff';
        ctx.lineWidth = data.width || 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x * canvas.width, pts[0].y * canvas.height);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * canvas.width, pts[i].y * canvas.height);
        }
        ctx.stroke();
    };
    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    };
    const handleCanvasMouseDown = (e) => {
        isDrawingRef.current = true;
        const rect = canvasRef.current.getBoundingClientRect();
        lastPointRef.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    };
    const handleCanvasMouseMove = (e) => {
        if (!isDrawingRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const pt = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
        ctx.strokeStyle = wbTool === 'eraser' ? '#1a1b2e' : wbColor;
        ctx.lineWidth = wbTool === 'eraser' ? 20 : wbWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lastPointRef.current.x * canvas.width, lastPointRef.current.y * canvas.height);
        ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
        ctx.stroke();
        wsRef.current?.send(JSON.stringify({
            type: 'whiteboard-stroke',
            points: [lastPointRef.current, pt],
            color: wbTool === 'eraser' ? '#1a1b2e' : wbColor,
            width: wbTool === 'eraser' ? 20 : wbWidth,
            tool: wbTool,
        }));
        lastPointRef.current = pt;
    };
    const handleCanvasMouseUp = () => { isDrawingRef.current = false; };

    // ── Misc ──
    const sendReaction = (emoji) => wsRef.current?.send(JSON.stringify({ type: 'reaction', emoji }));
    const copyLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/video-meeting/${roomId}`);
        setCopied(true); toast.success('Link copied!'); setTimeout(() => setCopied(false), 2000);
    };
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) { document.documentElement.requestFullscreen(); setIsFullscreen(true); }
        else { document.exitFullscreen(); setIsFullscreen(false); }
    };
    const togglePanel = (panel) => {
        setActivePanel(activePanel === panel ? null : panel);
        if (panel === 'chat') setUnreadChat(0);
    };
    const leaveMeeting = () => {
        Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
        peerConnectionsRef.current = {};
        wsRef.current?.close();
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current?.stop();
        clearInterval(timerRef.current);
        clearInterval(recTimerRef.current);
        navigate('/dashboard');
    };
    const createRoom = async () => {
        try {
            const res = await videoMeetingAPI.createRoom('Video Meeting');
            setRoomId(res.data.room_id);
            toast.success(`Room ${res.data.room_id} created`);
        } catch { toast.error('Failed to create room'); }
    };

    // Cleanup
    useEffect(() => {
        return () => {
            Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
            wsRef.current?.close();
            localStreamRef.current?.getTracks().forEach(t => t.stop());
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            clearInterval(timerRef.current);
            clearInterval(recTimerRef.current);
        };
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if (phase !== 'meeting') return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'm' || e.key === 'M') toggleAudio();
            if (e.key === 'v' || e.key === 'V') toggleVideo();
            if (e.key === 'h' || e.key === 'H') toggleHand();
            if (e.key === 'c' || e.key === 'C') togglePanel('chat');
            if (e.key === 'p' || e.key === 'P') togglePanel('participants');
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [phase, audioOn, videoOn, handRaised, activePanel]);

    const totalVideos = 1 + Object.keys(remoteStreams).length;
    const gridClass = totalVideos <= 1 ? 'grid-1' : totalVideos <= 2 ? 'grid-2' : totalVideos <= 4 ? 'grid-4' : totalVideos <= 6 ? 'grid-6' : 'grid-many';
    const raisedHands = participants.filter(p => p.hand_raised);

    // ════════════════════════════════════════════════════
    // LOBBY
    // ════════════════════════════════════════════════════
    if (phase === 'lobby') {
        return (
            <div className="vm-lobby">
                <div className="vm-lobby-bg"><div className="vm-orb vm-orb-1" /><div className="vm-orb vm-orb-2" /><div className="vm-orb vm-orb-3" /></div>
                <motion.div className="vm-lobby-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="vm-lobby-header">
                        <div className="vm-lobby-logo"><Video size={28} /></div>
                        <h1>Video Meeting</h1>
                        <p>Connect face-to-face with your team</p>
                    </div>
                    <div className="vm-lobby-preview">
                        <video ref={localVideoRef} autoPlay muted playsInline className="vm-lobby-video" style={{ filter: bgBlur ? 'blur(8px)' : 'none' }} />
                        <div className="vm-lobby-preview-controls">
                            <button className={`vm-preview-btn ${!videoOn ? 'off' : ''}`} onClick={() => {
                                const vt = localStreamRef.current?.getVideoTracks()[0];
                                if (vt) { vt.enabled = !vt.enabled; setVideoOn(vt.enabled); }
                            }}>{videoOn ? <Video size={18} /> : <VideoOff size={18} />}</button>
                            <button className={`vm-preview-btn ${!audioOn ? 'off' : ''}`} onClick={() => {
                                const at = localStreamRef.current?.getAudioTracks()[0];
                                if (at) { at.enabled = !at.enabled; setAudioOn(at.enabled); }
                            }}>{audioOn ? <Mic size={18} /> : <MicOff size={18} />}</button>
                            <button className={`vm-preview-btn ${bgBlur ? 'on' : ''}`} onClick={() => setBgBlur(!bgBlur)} title="Background Blur">
                                <Image size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="vm-lobby-form">
                        <div className="input-group">
                            <label className="input-label">Your Name</label>
                            <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Enter your name" />
                        </div>
                        <div className="vm-join-section">
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label className="input-label">Meeting ID</label>
                                <input className="input" value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Enter meeting ID to join" />
                            </div>
                            <motion.button className="btn btn-primary btn-lg vm-join-btn" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                disabled={!roomId.trim() || !displayName.trim()}
                                onClick={async () => {
                                    if (!roomId.trim() || !displayName.trim()) return;
                                    // Ensure we have a stream (may already have from lobby preview)
                                    if (!localStreamRef.current) await getLocalStream();
                                    connectToRoom();
                                }}
                            ><Video size={18} /> Join Meeting</motion.button>
                        </div>
                        <div className="vm-divider"><span>or</span></div>
                        <motion.button className="btn btn-secondary btn-lg" style={{ width: '100%' }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={async () => { if (!displayName.trim()) { toast.error('Enter your name'); return; } await createRoom(); }}
                        ><Radio size={18} /> Create New Meeting</motion.button>
                    </div>
                    <button className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ marginTop: 12 }}>← Back to Dashboard</button>
                </motion.div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════
    // WAITING ROOM
    // ════════════════════════════════════════════════════
    if (phase === 'waiting') {
        return (
            <div className="vm-lobby">
                <div className="vm-lobby-bg"><div className="vm-orb vm-orb-1" /><div className="vm-orb vm-orb-2" /></div>
                <motion.div className="vm-lobby-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center' }}>
                    <div className="vm-waiting-icon"><Shield size={48} /></div>
                    <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Waiting Room</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Please wait for the host to let you in...</p>
                    <div className="vm-waiting-spinner" />
                    <button className="btn btn-ghost" onClick={() => { wsRef.current?.close(); navigate('/dashboard'); }} style={{ marginTop: 24 }}>Leave</button>
                </motion.div>
            </div>
        );
    }

    // ════════════════════════════════════════════════════
    // MEETING VIEW
    // ════════════════════════════════════════════════════
    return (
        <div className="vm-meeting">
            {/* ── Video Grid ── */}
            <div className={`vm-grid-area ${activePanel ? 'sidebar-open' : ''}`}>
                <div className={`vm-video-grid ${viewMode === 'speaker' && pinnedUser ? 'speaker-mode' : gridClass}`}>
                    {/* Local Video */}
                    <div className={`vm-video-tile ${pinnedUser === 'local' ? 'pinned' : ''} ${viewMode === 'speaker' && pinnedUser && pinnedUser !== 'local' ? 'mini' : ''}`}
                        onClick={() => setPinnedUser(pinnedUser === 'local' ? null : 'local')}
                    >
                        <video ref={localVideoRef} autoPlay muted playsInline className="vm-video" style={{ filter: bgBlur ? 'blur(8px)' : 'none' }} />
                        {!videoOn && <div className="vm-video-avatar"><span>{(displayName || 'U')[0].toUpperCase()}</span></div>}
                        {handRaised && <div className="vm-hand-indicator">✋</div>}
                        <div className="vm-video-label">
                            <span className="vm-video-name">You {screenSharing ? '(Screen)' : ''}</span>
                            <div className="vm-video-indicators">
                                {!audioOn && <MicOff size={12} className="indicator-off" />}
                                {!videoOn && <VideoOff size={12} className="indicator-off" />}
                            </div>
                        </div>
                    </div>
                    {/* Remote Videos */}
                    {Object.entries(remoteStreams).map(([uid, stream]) => {
                        const pInfo = participants.find(p => p.user_id === uid);
                        const name = pInfo?.display_name || 'Guest';
                        return (
                            <div key={uid}
                                className={`vm-video-tile ${pinnedUser === uid ? 'pinned' : ''} ${viewMode === 'speaker' && pinnedUser && pinnedUser !== uid ? 'mini' : ''}`}
                                onClick={() => setPinnedUser(pinnedUser === uid ? null : uid)}
                            >
                                <RemoteVideo stream={stream} />
                                {pInfo?.video_on === false && <div className="vm-video-avatar"><span>{name[0].toUpperCase()}</span></div>}
                                {pInfo?.hand_raised && <div className="vm-hand-indicator">✋</div>}
                                <div className="vm-video-label">
                                    <span className="vm-video-name">{name} {pInfo?.is_host ? '⭐' : ''} {pInfo?.screen_sharing ? '(Screen)' : ''}</span>
                                    <div className="vm-video-indicators">
                                        {!pInfo?.audio_on && <MicOff size={12} className="indicator-off" />}
                                        {!pInfo?.video_on && <VideoOff size={12} className="indicator-off" />}
                                    </div>
                                </div>
                                {/* Host: kick & mute on hover */}
                                {isHost && uid !== userIdRef.current && (
                                    <div className="vm-tile-host-actions">
                                        <button onClick={(e) => { e.stopPropagation(); hostAction('mute-user', { target_user: uid }); }} title="Mute"><VolumeX size={14} /></button>
                                        <button onClick={(e) => { e.stopPropagation(); hostAction('remove-user', { target_user: uid }); }} title="Remove"><UserX size={14} /></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Topbar ── */}
                <div className="vm-topbar">
                    <div className="vm-topbar-left">
                        {isRecording && <span className="vm-rec-badge"><Circle size={10} className="vm-rec-dot" /> REC {formatTime(recordingTime)}</span>}
                        <Radio size={14} className="vm-live-dot" />
                        <span className="vm-room-id">{roomId}</span>
                        <button className="vm-copy-btn" onClick={copyLink}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
                        {meetingSettings.locked && <Lock size={14} style={{ color: '#eab308' }} title="Meeting Locked" />}
                    </div>
                    <div className="vm-topbar-center"><Clock size={14} /><span>{formatTime(duration)}</span></div>
                    <div className="vm-topbar-right">
                        {raisedHands.length > 0 && <span className="vm-raised-count" title={raisedHands.map(p => p.display_name).join(', ')}>✋ {raisedHands.length}</span>}
                        <span className="vm-participant-count"><Users size={14} /> {participants.length}</span>
                        <button className="vm-topbar-btn" onClick={() => setViewMode(viewMode === 'gallery' ? 'speaker' : 'gallery')}
                            title={viewMode === 'gallery' ? 'Speaker View' : 'Gallery View'}
                        ><Layers size={16} /></button>
                        <button className="vm-topbar-btn" onClick={toggleFullscreen}>{isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
                    </div>
                </div>
            </div>

            {/* ── Sidebar Panel ── */}
            <AnimatePresence>
                {activePanel && (
                    <motion.div className="vm-sidebar" initial={{ width: 0, opacity: 0 }} animate={{ width: 360, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
                        <div className="vm-sidebar-header">
                            <h3>{activePanel === 'chat' ? 'Chat' : activePanel === 'participants' ? 'Participants' : activePanel === 'whiteboard' ? 'Whiteboard' : activePanel === 'polls' ? 'Polls' : activePanel === 'notes' ? 'Notes' : activePanel === 'shortcuts' ? 'Shortcuts' : activePanel === 'settings' ? 'Host Settings' : ''}</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setActivePanel(null)}><X size={18} /></button>
                        </div>

                        {/* ── Participants Panel ── */}
                        {activePanel === 'participants' && (
                            <div className="vm-panel-content">
                                {/* Waiting Room */}
                                {isHost && waitingList.length > 0 && (
                                    <div className="vm-waiting-section">
                                        <div className="vm-section-title"><AlertCircle size={14} /> Waiting Room ({waitingList.length})</div>
                                        {waitingList.map(w => (
                                            <div key={w.user_id} className="vm-participant-item">
                                                <div className="vm-participant-avatar">{(w.display_name || 'G')[0].toUpperCase()}</div>
                                                <span className="vm-participant-name">{w.display_name}</span>
                                                <div className="vm-admit-btns">
                                                    <button className="btn btn-xs btn-primary" onClick={() => hostAction('admit-user', { target_user: w.user_id })}>Admit</button>
                                                    <button className="btn btn-xs btn-ghost" onClick={() => hostAction('reject-user', { target_user: w.user_id })}>Deny</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="vm-section-title"><Users size={14} /> In Meeting ({participants.length})</div>
                                {participants.map(p => (
                                    <div key={p.user_id} className="vm-participant-item">
                                        <div className="vm-participant-avatar">{(p.display_name || 'G')[0].toUpperCase()}</div>
                                        <div className="vm-participant-info">
                                            <span className="vm-participant-name">
                                                {p.display_name}{p.is_host && <span className="vm-host-badge">Host</span>}{p.user_id === userIdRef.current && ' (You)'}
                                            </span>
                                        </div>
                                        <div className="vm-participant-status">
                                            {p.hand_raised && <span style={{ fontSize: '1rem' }}>✋</span>}
                                            {p.audio_on ? <Mic size={14} /> : <MicOff size={14} className="indicator-off" />}
                                            {p.video_on ? <Video size={14} /> : <VideoOff size={14} className="indicator-off" />}
                                        </div>
                                        {isHost && p.user_id !== userIdRef.current && (
                                            <div className="vm-participant-actions">
                                                <button className="vm-small-btn" onClick={() => hostAction('mute-user', { target_user: p.user_id })} title="Mute"><VolumeX size={12} /></button>
                                                <button className="vm-small-btn danger" onClick={() => hostAction('remove-user', { target_user: p.user_id })} title="Remove"><UserX size={12} /></button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isHost && (
                                    <div className="vm-host-bulk-actions">
                                        <button className="btn btn-xs btn-secondary" onClick={() => hostAction('mute-all')}><VolumeX size={12} /> Mute All</button>
                                        <button className="btn btn-xs btn-secondary" onClick={() => hostAction('lower-all-hands')}>👇 Lower All Hands</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Chat Panel ── */}
                        {activePanel === 'chat' && (
                            <>
                                <div className="vm-chat-messages">
                                    {chatMessages.length === 0 ? (
                                        <div className="vm-chat-empty"><MessageSquare size={32} style={{ opacity: 0.3 }} /><p>No messages yet</p></div>
                                    ) : chatMessages.map((msg, i) => (
                                        <div key={i} className={`vm-chat-msg ${msg.user_id === userIdRef.current ? 'own' : ''}`}>
                                            <div className="vm-chat-msg-header">
                                                <span className="vm-chat-sender">{msg.display_name}</span>
                                                <span className="vm-chat-time">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                            </div>
                                            <div className="vm-chat-msg-text">{msg.message}</div>
                                        </div>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>
                                <form className="vm-chat-input" onSubmit={sendChat}>
                                    <input className="input" placeholder="Type a message…" value={chatInput} onChange={e => setChatInput(e.target.value)} />
                                    <button className="btn btn-primary btn-icon" type="submit"><Send size={16} /></button>
                                </form>
                            </>
                        )}

                        {/* ── Whiteboard Panel ── */}
                        {activePanel === 'whiteboard' && (
                            <div className="vm-panel-content vm-wb-panel">
                                <div className="vm-wb-toolbar">
                                    <button className={`vm-wb-btn ${wbTool === 'pen' ? 'active' : ''}`} onClick={() => setWbTool('pen')}><Pencil size={14} /></button>
                                    <button className={`vm-wb-btn ${wbTool === 'eraser' ? 'active' : ''}`} onClick={() => setWbTool('eraser')}><Eraser size={14} /></button>
                                    <div className="vm-wb-colors">
                                        {['#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7'].map(c => (
                                            <button key={c} className={`vm-wb-color ${wbColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => { setWbColor(c); setWbTool('pen'); }} />
                                        ))}
                                    </div>
                                    <select className="vm-wb-size" value={wbWidth} onChange={e => setWbWidth(Number(e.target.value))}>
                                        <option value={2}>Thin</option><option value={4}>Medium</option><option value={8}>Thick</option>
                                    </select>
                                    <button className="vm-wb-btn" onClick={() => { clearCanvas(); wsRef.current?.send(JSON.stringify({ type: 'whiteboard-clear' })); }}><Trash2 size={14} /></button>
                                </div>
                                <canvas ref={canvasRef} width={640} height={480} className="vm-wb-canvas"
                                    onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp} />
                            </div>
                        )}

                        {/* ── Polls Panel ── */}
                        {activePanel === 'polls' && (
                            <div className="vm-panel-content">
                                {/* Create Poll */}
                                <div className="vm-poll-create">
                                    <div className="vm-section-title"><BarChart3 size={14} /> Create Poll</div>
                                    <input className="input" placeholder="Question" value={newPollQuestion} onChange={e => setNewPollQuestion(e.target.value)} style={{ marginBottom: 8 }} />
                                    {newPollOptions.map((opt, i) => (
                                        <input key={i} className="input" placeholder={`Option ${i + 1}`} value={opt}
                                            onChange={e => { const o = [...newPollOptions]; o[i] = e.target.value; setNewPollOptions(o); }}
                                            style={{ marginBottom: 4, fontSize: '0.8rem' }} />
                                    ))}
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        <button className="btn btn-xs btn-ghost" onClick={() => setNewPollOptions([...newPollOptions, ''])}>+ Option</button>
                                        <button className="btn btn-xs btn-primary" onClick={createPoll}>Create</button>
                                    </div>
                                </div>
                                {/* Active Polls */}
                                {Object.values(polls).map(poll => (
                                    <div key={poll.poll_id} className={`vm-poll-card ${poll.active ? '' : 'ended'}`}>
                                        <div className="vm-poll-question">{poll.question}</div>
                                        {poll.options.map((opt, i) => {
                                            const pct = poll.total_votes > 0 ? Math.round((poll.vote_counts[i] / poll.total_votes) * 100) : 0;
                                            return (
                                                <button key={i} className="vm-poll-option" onClick={() => poll.active && votePoll(poll.poll_id, i)} disabled={!poll.active}>
                                                    <span>{opt}</span>
                                                    <div className="vm-poll-bar" style={{ width: `${pct}%` }} />
                                                    <span className="vm-poll-pct">{pct}% ({poll.vote_counts[i]})</span>
                                                </button>
                                            );
                                        })}
                                        <div className="vm-poll-footer">
                                            <span>{poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}</span>
                                            {poll.active && (isHost || poll.creator === userIdRef.current) && (
                                                <button className="btn btn-xs btn-ghost" onClick={() => wsRef.current?.send(JSON.stringify({ type: 'end-poll', poll_id: poll.poll_id }))}>End Poll</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Notes Panel ── */}
                        {activePanel === 'notes' && (
                            <div className="vm-panel-content">
                                <textarea className="vm-notes-textarea" placeholder="Take your meeting notes here…"
                                    value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} />
                                <button className="btn btn-xs btn-secondary" style={{ marginTop: 8 }} onClick={() => {
                                    const blob = new Blob([meetingNotes], { type: 'text/plain' });
                                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                                    a.download = `meeting-notes-${roomId}.txt`; a.click();
                                    toast.success('Notes downloaded');
                                }}><Download size={12} /> Download Notes</button>
                            </div>
                        )}

                        {/* ── Keyboard Shortcuts ── */}
                        {activePanel === 'shortcuts' && (
                            <div className="vm-panel-content">
                                <div className="vm-shortcuts-list">
                                    {[
                                        ['M', 'Toggle Mute'], ['V', 'Toggle Video'], ['H', 'Raise/Lower Hand'],
                                        ['C', 'Toggle Chat'], ['P', 'Toggle Participants'], ['F11', 'Fullscreen'],
                                    ].map(([key, desc]) => (
                                        <div key={key} className="vm-shortcut-row">
                                            <kbd className="vm-kbd">{key}</kbd>
                                            <span>{desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Host Settings Panel ── */}
                        {activePanel === 'settings' && isHost && (
                            <div className="vm-panel-content">
                                <div className="vm-section-title"><Settings size={14} /> Meeting Settings</div>
                                <div className="vm-setting-row">
                                    <span>Waiting Room</span>
                                    <button className={`vm-toggle ${meetingSettings.waiting_room_enabled ? 'on' : ''}`}
                                        onClick={() => hostAction('toggle-waiting-room', { enabled: !meetingSettings.waiting_room_enabled })}>
                                        {meetingSettings.waiting_room_enabled ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <div className="vm-setting-row">
                                    <span>Lock Meeting</span>
                                    <button className={`vm-toggle ${meetingSettings.locked ? 'on' : ''}`}
                                        onClick={() => hostAction('lock-meeting', { locked: !meetingSettings.locked })}>
                                        {meetingSettings.locked ? <Lock size={14} /> : <Unlock size={14} />}
                                    </button>
                                </div>
                                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <button className="btn btn-danger" onClick={() => { hostAction('end-meeting'); leaveMeeting(); }}>
                                        <PhoneOff size={16} /> End Meeting for All
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Controls Bar ── */}
            <div className="vm-controls">
                <div className="vm-controls-left">
                    <div className="vm-meeting-info">
                        <span className="vm-meeting-title">Meeting</span>
                        <span className="vm-meeting-time">{formatTime(duration)}</span>
                    </div>
                </div>

                <div className="vm-controls-center">
                    <motion.button className={`vm-ctrl-btn ${!audioOn ? 'off' : ''}`} onClick={toggleAudio} title="Mute (M)" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        {audioOn ? <Mic size={20} /> : <MicOff size={20} />}
                    </motion.button>
                    <motion.button className={`vm-ctrl-btn ${!videoOn ? 'off' : ''}`} onClick={toggleVideo} title="Video (V)" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        {videoOn ? <Video size={20} /> : <VideoOff size={20} />}
                    </motion.button>
                    <motion.button className={`vm-ctrl-btn ${screenSharing ? 'active' : ''}`} onClick={toggleScreenShare} title="Share Screen" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        {screenSharing ? <ScreenShareOff size={20} /> : <MonitorUp size={20} />}
                    </motion.button>
                    <motion.button className={`vm-ctrl-btn ${bgBlur ? 'active' : ''}`} onClick={toggleBgBlur} title="Virtual Background" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <Image size={20} />
                    </motion.button>

                    <div className="vm-ctrl-divider" />

                    <motion.button className={`vm-ctrl-btn secondary ${handRaised ? 'active hand-active' : ''}`} onClick={toggleHand} title="Raise Hand (H)" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <Hand size={20} />
                    </motion.button>
                    {isHost && (
                        <motion.button className={`vm-ctrl-btn secondary ${isRecording ? 'recording' : ''}`} onClick={toggleRecording} title="Record" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            {isRecording ? <Square size={18} /> : <Circle size={18} />}
                        </motion.button>
                    )}

                    <div className="vm-ctrl-divider" />

                    <motion.button className={`vm-ctrl-btn secondary ${activePanel === 'chat' ? 'active' : ''}`} onClick={() => togglePanel('chat')} title="Chat (C)" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <MessageSquare size={20} />{unreadChat > 0 && <span className="vm-badge">{unreadChat}</span>}
                    </motion.button>
                    <motion.button className={`vm-ctrl-btn secondary ${activePanel === 'participants' ? 'active' : ''}`} onClick={() => togglePanel('participants')} title="Participants (P)" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <Users size={20} />
                    </motion.button>
                    <motion.button className={`vm-ctrl-btn secondary ${activePanel === 'whiteboard' ? 'active' : ''}`} onClick={() => togglePanel('whiteboard')} title="Whiteboard" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <Pencil size={20} />
                    </motion.button>
                    <motion.button className={`vm-ctrl-btn secondary ${activePanel === 'polls' ? 'active' : ''}`} onClick={() => togglePanel('polls')} title="Polls" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <BarChart3 size={20} />
                    </motion.button>

                    {/* More menu */}
                    <div className="vm-more-menu">
                        <button className="vm-ctrl-btn secondary" title="More"><ChevronDown size={20} /></button>
                        <div className="vm-more-dropdown">
                            <button onClick={() => togglePanel('notes')}><StickyNote size={14} /> Notes</button>
                            <button onClick={() => togglePanel('shortcuts')}><Keyboard size={14} /> Shortcuts</button>
                            {isHost && <button onClick={() => togglePanel('settings')}><Settings size={14} /> Settings</button>}
                            <div className="vm-more-divider" />
                            <div className="vm-reactions-row">
                                {['👍', '❤️', '😂', '👏', '🎉', '🔥'].map(e => (
                                    <button key={e} className="vm-reaction-btn" onClick={() => sendReaction(e)}>{e}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="vm-ctrl-divider" />

                    <motion.button className="vm-ctrl-btn leave" onClick={leaveMeeting} title="Leave" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                        <PhoneOff size={20} />
                    </motion.button>
                </div>

                <div className="vm-controls-right">
                    <button className="vm-copy-link-btn" onClick={copyLink}>
                        <LinkIcon size={14} />{copied ? 'Copied!' : 'Invite'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Remote Video Component
function RemoteVideo({ stream }) {
    const ref = useRef(null);
    useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
    return <video ref={ref} autoPlay playsInline className="vm-video" />;
}
