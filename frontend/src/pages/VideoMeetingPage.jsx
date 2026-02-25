import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { videoMeetingAPI, createVideoMeetingWebSocket, meetingsAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MonitorOff,
    Copy, MessageSquare, Users, Hand, MoreVertical, Maximize, Minimize,
    Circle, Square, Pencil, BarChart3, Captions, CaptionsOff,
    Download, Timer, X, ChevronUp, ChevronDown, Settings2,
    Hash, Lock, FileText, HelpCircle, Send, Share2,
    VolumeX, Volume2, LockKeyhole, Unlock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadBlobFile, downloadCanvas } from '../utils/download';
import Chat from '../components/Chat';
import Whiteboard from '../components/Whiteboard';
import './VideoMeeting.css';

/* ── Helpers ── */
const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
};

/* ── Main Component ── */
export default function VideoMeetingPage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── Room Info (meeting code, password, etc.) ──
    const [roomInfo, setRoomInfo] = useState(null);

    // ── Core Media State ──
    const [localStream, setLocalStream] = useState(null);
    const [peers, setPeers] = useState({});
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [screenStream, setScreenStream] = useState(null);

    // ── UI Panels ──
    const [activePanel, setActivePanel] = useState(null); // 'chat' | 'participants' | 'whiteboard' | 'polls' | null
    const [chatMessages, setChatMessages] = useState([]);
    const [unreadChats, setUnreadChats] = useState(0);

    // ── Captions ──
    const [captionsOn, setCaptionsOn] = useState(true);
    const [captions, setCaptions] = useState([]);
    const recognitionRef = useRef(null);
    const captionsOnRef = useRef(true);

    // ── Recording ──
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);

    // ── Meeting Timer ──
    const [meetingDuration, setMeetingDuration] = useState(0);
    const meetingTimerRef = useRef(null);

    // ── Hand Raise / Reactions ──
    const [handRaised, setHandRaised] = useState(false);
    const [reactions, setReactions] = useState([]);
    const [raisedHands, setRaisedHands] = useState(new Set());

    // ── Participants ──
    const [participants, setParticipants] = useState([]);

    // ── Polls (inline) ──
    const [polls, setPolls] = useState([]);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [newPollQuestion, setNewPollQuestion] = useState('');
    const [newPollOptions, setNewPollOptions] = useState(['', '']);

    // ── More Menu / Fullscreen ──
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [layout, setLayout] = useState('grid'); // 'grid' | 'speaker'

    // ── Q&A Panel ──
    const [questions, setQuestions] = useState([]);
    const [newQuestion, setNewQuestion] = useState('');

    // ── Notepad Panel ──
    const [notepadText, setNotepadText] = useState('Meeting Notes\n---\n');

    // ── Admin Chat Controls ──
    const [communityChatEnabled, setCommunityChatEnabled] = useState(true);
    const [privateChatEnabled, setPrivateChatEnabled] = useState(true);
    const [meetingLocked, setMeetingLocked] = useState(false);
    const [participantScreenShareEnabled, setParticipantScreenShareEnabled] = useState(true);

    // ── Transcript (accumulated from captions for saving/analysis) ──
    const [savingTranscript, setSavingTranscript] = useState(false);
    const transcriptRef = useRef([]); // { speaker, text, start_time, end_time, confidence }
    const meetingStartTimeRef = useRef(Date.now());

    // ── Refs ──
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const shouldReconnectRef = useRef(true);
    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const screenVideoRef = useRef(null);
    const peerConnections = useRef({});
    const containerRef = useRef(null);

    /* ═══════════════════════════════════════════════
       SETUP & TEARDOWN
       ═══════════════════════════════════════════════ */
    useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

    // Meeting timer
    useEffect(() => {
        meetingTimerRef.current = setInterval(() => setMeetingDuration(d => d + 1), 1000);
        return () => clearInterval(meetingTimerRef.current);
    }, []);

    // Fetch room info (meeting code, password, etc.)
    useEffect(() => {
        if (roomId) {
            videoMeetingAPI.getRoomInfo(roomId)
                .then(res => setRoomInfo(res.data))
                .catch(() => { /* room info is optional */ });
        }
    }, [roomId]);

    // Main setup
    useEffect(() => {
        if (!user) return;

        if (!roomId) {
            navigate('/meetings/new', { replace: true });
            return;
        }

        shouldReconnectRef.current = true;
        reconnectAttemptsRef.current = 0;

        // CRITICAL: abort flag prevents orphaned streams from StrictMode double-mount
        let cancelled = false;

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                // If cleanup already ran (StrictMode), kill this stream immediately
                if (cancelled) {
                    console.warn('[VideoMeeting] Cleanup already ran — stopping orphaned stream');
                    stream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
                    return;
                }

                setLocalStream(stream);
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                connectSignaling(stream);

                // Auto-start captions (speech recognition)
                try {
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    if (SpeechRecognition && !recognitionRef.current) {
                        const recognition = new SpeechRecognition();
                        recognition.continuous = true;
                        recognition.interimResults = true;
                        recognition.lang = 'en-US';
                        recognition.maxAlternatives = 1;

                        recognition.onresult = (event) => {
                            let finalText = '';
                            let interimText = '';
                            for (let i = event.resultIndex; i < event.results.length; i++) {
                                const transcript = event.results[i][0].transcript;
                                if (event.results[i].isFinal) finalText += transcript;
                                else interimText += transcript;
                            }
                            if (finalText) {
                                const elapsed = (Date.now() - meetingStartTimeRef.current) / 1000;
                                transcriptRef.current.push({
                                    speaker: user?.full_name || 'You',
                                    text: finalText,
                                    start_time: Math.max(0, elapsed - 5),
                                    end_time: elapsed,
                                    confidence: event.results[event.resultIndex]?.[0]?.confidence || 0.9,
                                });
                                setCaptions(prev => {
                                    const updated = [...prev, { text: finalText, speaker: user?.full_name || 'You', time: Date.now(), final: true }];
                                    return updated.slice(-8);
                                });
                            } else if (interimText) {
                                setCaptions(prev => {
                                    const filtered = prev.filter(c => c.final);
                                    return [...filtered, { text: interimText, speaker: user?.full_name || 'You', time: Date.now(), final: false }];
                                });
                            }
                        };
                        recognition.onerror = (e) => {
                            if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('Speech error:', e.error);
                        };
                        recognition.onend = () => {
                            if (captionsOnRef.current && recognitionRef.current) {
                                try { recognitionRef.current.start(); } catch { }
                            }
                        };

                        recognition.start();
                        recognitionRef.current = recognition;
                    }
                } catch { }
            })
            .catch(err => {
                if (cancelled) return; // Don't show errors if already cleaning up
                console.error("Media Error:", err);
                toast.error('Camera/microphone access denied');
                connectSignaling(null);
            });

        return () => {
            // Set abort flag FIRST — prevents late-resolving getUserMedia from leaking
            cancelled = true;
            shouldReconnectRef.current = false;
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }

            // Stop any stream that IS already stored
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => { t.stop(); t.enabled = false; });
                localStreamRef.current = null;
            }
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = null;
            }
            try { wsRef.current?.close(); } catch { }
            wsRef.current = null;
            Object.values(peerConnections.current).forEach(pc => { try { pc.close(); } catch { } });
            peerConnections.current = {};
            captionsOnRef.current = false;
            try { recognitionRef.current?.stop(); } catch { }
            recognitionRef.current = null;
            try { stopRecording(true); } catch { }
        };
    }, [roomId, user, navigate]);

    // Sync screen share stream with its video ref
    useEffect(() => {
        if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = screenStream || null;
        }
    }, [screenStream]);

    /* ═══════════════════════════════════════════════
       KEYBOARD SHORTCUTS
       ═══════════════════════════════════════════════ */
    useEffect(() => {
        const handler = (e) => {
            // Don't trigger if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMic(); }
            if (e.key === 'v' || e.key === 'V') { e.preventDefault(); toggleCam(); }
            if (e.key === 'h' || e.key === 'H') { e.preventDefault(); toggleHandRaise(); }
            if (e.key === 'c' || e.key === 'C') { e.preventDefault(); toggleCaptions(); }
            if (e.key === 'r' || e.key === 'R') { e.preventDefault(); toggleRecording(); }
            if (e.key === 'Escape') { setActivePanel(null); setShowMoreMenu(false); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [micOn, camOn, handRaised, captionsOn, isRecording]);

    /* ═══════════════════════════════════════════════
       WEBRTC SIGNALING
       ═══════════════════════════════════════════════ */
    const connectSignaling = (stream) => {
        let ws;
        try {
            ws = createVideoMeetingWebSocket(roomId, user.full_name || 'User');
        } catch (e) {
            toast.error('Session expired. Please login again.');
            navigate('/login');
            return;
        }
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        wsRef.current = ws;

        ws.onopen = () => {
            if (reconnectAttemptsRef.current > 0) {
                toast.success('Reconnected to meeting');
            } else {
                toast.success('Connected to meeting');
            }
            reconnectAttemptsRef.current = 0;
        };
        ws.onclose = (event) => {
            console.log("Disconnected from signaling");
            if (event?.code === 1008) {
                shouldReconnectRef.current = false;
                toast.error('Session expired. Please login again.');
                navigate('/login');
                return;
            }
            if (!shouldReconnectRef.current || leavingRef.current) return;
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(1000 * (2 ** (reconnectAttemptsRef.current - 1)), 10000);
            if (reconnectAttemptsRef.current === 1) {
                toast('Connection lost. Reconnecting...');
            }
            reconnectTimerRef.current = setTimeout(() => {
                if (shouldReconnectRef.current && !leavingRef.current) {
                    connectSignaling(localStreamRef.current);
                }
            }, delay);
        };
        ws.onerror = (err) => console.error("WebSocket error:", err);

        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'user-joined':
                        handleUserJoined(data.user_id, data.display_name, stream);
                        break;
                    case 'signal':
                        handleSignal(data.sender, data.payload, stream);
                        break;
                    case 'user-left':
                        handleUserLeft(data.user_id, data.display_name);
                        break;
                    case 'chat':
                        setChatMessages(prev => [...prev, {
                            sender: data.sender_name || data.sender,
                            text: data.text,
                            isMe: false,
                            timestamp: new Date().toISOString()
                        }]);
                        if (activePanel !== 'chat') setUnreadChats(c => c + 1);
                        break;
                    case 'reaction':
                        showReaction(data.emoji, data.sender_name);
                        break;
                    case 'hand-raise':
                        setRaisedHands(prev => {
                            const next = new Set(prev);
                            if (data.raised) next.add(data.sender_name || data.user_id);
                            else next.delete(data.sender_name || data.user_id);
                            return next;
                        });
                        break;
                    case 'poll':
                        setPolls(prev => [...prev, data.poll]);
                        toast('📊 New poll created!');
                        break;
                    case 'poll-vote':
                        setPolls(prev => prev.map(p =>
                            p.id === data.pollId
                                ? { ...p, votes: { ...p.votes, [data.option]: (p.votes?.[data.option] || 0) + 1 } }
                                : p
                        ));
                        break;
                    case 'whiteboard':
                        // Handled internally by Whiteboard component
                        break;
                    case 'KICKED':
                    case 'kick':
                        // If this kick targets the current user
                        if (String(data.target_user_id) === String(user?.id) || data.reason) {
                            toast.error('You have been removed from the meeting');
                            killAllMedia();
                            navigate('/meetings');
                        }
                        break;
                    case 'shared-notes':
                        setChatMessages(prev => [...prev, {
                            sender: data.sender_name || 'Someone',
                            text: `📝 **Shared Notes:**\n${data.text}`,
                            isMe: false,
                            timestamp: new Date().toISOString()
                        }]);
                        toast('📝 Notes shared with everyone!');
                        break;
                    case 'admin-setting':
                        if (data.setting === 'community-chat') {
                            setCommunityChatEnabled(data.enabled);
                            toast(data.enabled ? '💬 Community chat enabled' : '🔒 Community chat disabled');
                        } else if (data.setting === 'private-chat') {
                            setPrivateChatEnabled(data.enabled);
                            toast(data.enabled ? '💬 Private chat enabled' : '🔒 Private chat disabled');
                        } else if (data.setting === 'mute-all') {
                            // Force mute local mic
                            if (localStreamRef.current) {
                                localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
                            }
                            setMicOn(false);
                            toast('🔇 Host muted all participants', { icon: '🔇' });
                        } else if (data.setting === 'mute-participant') {
                            if (String(data.target_user_id) === String(user?.id)) {
                                if (localStreamRef.current) {
                                    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
                                }
                                setMicOn(false);
                                toast('🔇 Host muted your microphone', { icon: '🔇' });
                            }
                        } else if (data.setting === 'screen-share') {
                            setParticipantScreenShareEnabled(data.enabled);
                            toast(data.enabled ? '🖥️ Screen sharing enabled' : '🔒 Screen sharing disabled by host');
                        } else if (data.setting === 'meeting-locked') {
                            setMeetingLocked(data.enabled);
                            toast(data.enabled ? '🔒 Meeting has been locked' : '🔓 Meeting has been unlocked');
                        }
                        break;
                    default:
                        break;
                }
            } catch (err) {
                console.error('Message parse error:', err);
            }
        };
    };

    const handleUserJoined = async (userId, displayName, stream) => {
        toast(`${displayName || 'Someone'} joined`, { icon: '👤' });
        setParticipants(prev => {
            if (prev.find(p => p.id === userId)) return prev;
            return [...prev, { id: userId, name: displayName || `User ${userId}`, handRaised: false }];
        });
        if (!stream) return;
        const pc = createPeerConnection(userId, stream);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            wsRef.current.send(JSON.stringify({
                type: 'signal', target: userId,
                payload: { type: 'offer', sdp: pc.localDescription }
            }));
        } catch (err) { console.error('Failed to create offer:', err); }
    };

    const handleSignal = async (senderId, payload, stream) => {
        let pc = peerConnections.current[senderId];
        if (!pc) pc = createPeerConnection(senderId, stream);
        try {
            if (payload.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                wsRef.current.send(JSON.stringify({
                    type: 'signal', target: senderId,
                    payload: { type: 'answer', sdp: pc.localDescription }
                }));
            } else if (payload.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } else if (payload.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        } catch (err) { console.error('Signal handling error:', err); }
    };

    const createPeerConnection = (userId, stream) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        peerConnections.current[userId] = pc;
        if (stream) stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'signal', target: userId,
                    payload: { candidate: event.candidate }
                }));
            }
        };
        pc.ontrack = (event) => {
            setPeers(prev => ({ ...prev, [userId]: { stream: event.streams[0] } }));
        };
        return pc;
    };

    const handleUserLeft = (userId, displayName) => {
        toast(`${displayName || 'Someone'} left`, { icon: '👋' });
        if (peerConnections.current[userId]) {
            peerConnections.current[userId].close();
            delete peerConnections.current[userId];
        }
        setPeers(prev => { const n = { ...prev }; delete n[userId]; return n; });
        setParticipants(prev => prev.filter(p => p.id !== userId));
    };

    /* ═══════════════════════════════════════════════
       CONTROLS
       ═══════════════════════════════════════════════ */
    const toggleMic = useCallback(() => {
        if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !micOn);
        setMicOn(v => !v);
    }, [localStream, micOn]);

    const toggleCam = useCallback(() => {
        if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = !camOn);
        setCamOn(v => !v);
    }, [localStream, camOn]);

    const toggleScreenShare = async () => {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            setScreenStream(null);
            if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
            if (localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                Object.values(peerConnections.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender && videoTrack) sender.replaceTrack(videoTrack);
                });
            }
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'always', frameRate: { ideal: 30 } },
                    audio: false,
                });
                setScreenStream(stream);
                // Attach to dedicated ref to avoid re-render flickering
                if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
                const screenTrack = stream.getVideoTracks()[0];
                screenTrack.onended = () => {
                    setScreenStream(null);
                    if (localStream) {
                        const vt = localStream.getVideoTracks()[0];
                        Object.values(peerConnections.current).forEach(pc => {
                            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                            if (sender && vt) sender.replaceTrack(vt);
                        });
                    }
                };
                Object.values(peerConnections.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                });
                toast.success('Screen sharing started');
            } catch (err) {
                if (err.name !== 'NotAllowedError') toast.error("Screen share failed");
            }
        }
    };

    const leavingRef = useRef(false);

    // ── Nuclear media kill — guarantees camera/mic OFF ──
    const killAllMedia = () => {
        shouldReconnectRef.current = false;
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        // 1) Stop stream from ref (most reliable — always current)
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => { t.stop(); t.enabled = false; });
            localStreamRef.current = null;
        }

        // 2) Stop stream from state (in case ref was stale)
        if (localStream) {
            localStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
        }
        setLocalStream(null);

        // 3) Stop screen share
        if (screenStream) {
            screenStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
        }
        setScreenStream(null);

        // 4) Null out ALL video elements on the page — releases any held stream references
        document.querySelectorAll('video').forEach(v => {
            if (v.srcObject) {
                const s = v.srcObject;
                s.getTracks().forEach(t => { t.stop(); t.enabled = false; });
                v.srcObject = null;
            }
        });

        setCamOn(false);
        setMicOn(false);

        // 5) Stop speech recognition
        captionsOnRef.current = false;
        setCaptionsOn(false);
        try { recognitionRef.current?.stop(); } catch { }
        recognitionRef.current = null;

        // 6) Close all peer connections
        Object.values(peerConnections.current).forEach(pc => {
            try { pc.close(); } catch { }
        });
        peerConnections.current = {};

        // 7) Close WebSocket
        try { wsRef.current?.close(); } catch { }
        wsRef.current = null;
    };

    // ── Guarantee cleanup on tab close / navigation ──
    useEffect(() => {
        const onBeforeUnload = () => {
            // Stop all tracks synchronously on tab close
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
            }
            try { recognitionRef.current?.stop(); } catch { }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        window.addEventListener('pagehide', onBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            window.removeEventListener('pagehide', onBeforeUnload);
        };
    }, []);

    const handleLeave = () => {
        if (leavingRef.current) return;
        leavingRef.current = true;

        // Kill all media IMMEDIATELY
        killAllMedia();
        try { stopRecording(true); } catch { }

        // Navigate INSTANTLY
        navigate('/meetings');

        // Background: save transcript (fire-and-forget)
        const entries = transcriptRef.current;
        if (entries.length > 0) {
            videoMeetingAPI.saveTranscript(roomId, {
                title: roomInfo?.title || `Meeting ${new Date().toLocaleDateString()}`,
                transcript: entries,
                auto_analyze: false,
            }).then(res => {
                const { subtitle_count } = res.data;
                toast.success(`Saved ${subtitle_count} transcript lines. Analyze from meetings page.`);
            }).catch(err => {
                console.error('Background save failed:', err);
            });
        }
    };

    const copyInvite = () => {
        const link = window.location.href;
        if (roomInfo?.meeting_code) {
            const details = [
                `Join my meeting!`,
                ``,
                `Meeting Code: ${roomInfo.meeting_code}`,
                roomInfo.password ? `Password: ${roomInfo.password}` : null,
                `Link: ${link}`,
            ].filter(Boolean).join('\n');
            navigator.clipboard.writeText(details);
            toast.success('Meeting details copied!');
        } else {
            navigator.clipboard.writeText(link);
            toast.success('Invite link copied!');
        }
    };

    /* ═══════════════════════════════════════════════
       CHAT
       ═══════════════════════════════════════════════ */
    const sendChatMessage = (text) => {
        setChatMessages(prev => [...prev, {
            sender: user?.full_name || 'You', text, isMe: true,
            timestamp: new Date().toISOString()
        }]);
        wsRef.current?.send(JSON.stringify({ type: 'chat', text }));
    };

    /* ═══════════════════════════════════════════════
       CAPTIONS (Web Speech API)
       ═══════════════════════════════════════════════ */
    const toggleCaptions = useCallback(() => {
        if (captionsOn) {
            if (recognitionRef.current) recognitionRef.current.stop();
            setCaptionsOn(false);
            captionsOnRef.current = false;
            toast('Captions off');
        } else {
            try {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (!SpeechRecognition) { toast.error('Speech recognition not supported in this browser'); return; }

                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'en-US';

                recognition.onresult = (event) => {
                    let finalText = '';
                    let interimText = '';
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) finalText += transcript;
                        else interimText += transcript;
                    }

                    if (finalText) {
                        // Store in transcript for later analysis
                        const elapsed = (Date.now() - meetingStartTimeRef.current) / 1000;
                        transcriptRef.current.push({
                            speaker: user?.full_name || 'You',
                            text: finalText,
                            start_time: Math.max(0, elapsed - 5),
                            end_time: elapsed,
                            confidence: event.results[event.resultIndex]?.[0]?.confidence || 0.9,
                        });
                        setCaptions(prev => {
                            const updated = [...prev, { text: finalText, speaker: user?.full_name || 'You', time: Date.now(), final: true }];
                            return updated.slice(-8); // Keep last 8
                        });
                    } else if (interimText) {
                        setCaptions(prev => {
                            const filtered = prev.filter(c => c.final);
                            return [...filtered, { text: interimText, speaker: user?.full_name || 'You', time: Date.now(), final: false }];
                        });
                    }
                };

                recognition.onerror = (e) => {
                    if (e.error === 'no-speech') return; // Normal — just silence
                    if (e.error === 'aborted') return; // User toggled off
                    console.warn('Speech recognition error:', e.error);
                    // On network or other transient errors, try restarting after delay
                    if (captionsOnRef.current && recognitionRef.current) {
                        setTimeout(() => {
                            if (captionsOnRef.current && recognitionRef.current) {
                                try { recognitionRef.current.start(); } catch { /* already running */ }
                            }
                        }, 1000);
                    }
                };
                recognition.onend = () => {
                    // Auto-restart using ref (avoids stale closure)
                    if (captionsOnRef.current && recognitionRef.current) {
                        // Small delay to avoid rapid-fire restart issues
                        setTimeout(() => {
                            if (captionsOnRef.current && recognitionRef.current) {
                                try { recognitionRef.current.start(); } catch { /* already running */ }
                            }
                        }, 300);
                    }
                };

                recognition.start();
                recognitionRef.current = recognition;
                setCaptionsOn(true);
                captionsOnRef.current = true;
                toast.success('Captions on');
            } catch (e) {
                toast.error('Failed to start captions');
            }
        }
    }, [captionsOn, user]);

    /* ═══════════════════════════════════════════════
       RECORDING (MediaRecorder API)
       ═══════════════════════════════════════════════ */
    const toggleRecording = useCallback(() => {
        if (isRecording) stopRecording(false);
        else startRecording();
    }, [isRecording]);

    const startRecording = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');

            // Capture local video frame-by-frame
            const captureStream = canvas.captureStream(30);

            // Mix audio from local stream
            if (localStreamRef.current) {
                const audioTracks = localStreamRef.current.getAudioTracks();
                audioTracks.forEach(t => captureStream.addTrack(t.clone()));
            }

            // Draw video frames
            const drawFrame = () => {
                if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
                ctx.fillStyle = '#0f1117';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw local video
                if (localVideoRef.current && localVideoRef.current.readyState >= 2) {
                    try { ctx.drawImage(localVideoRef.current, 0, 0, canvas.width, canvas.height); } catch (e) { /* ignore */ }
                }
                requestAnimationFrame(drawFrame);
            };

            const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
            let selectedMimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

            const recorder = new MediaRecorder(captureStream, { mimeType: selectedMimeType, videoBitsPerSecond: 2500000 });
            recordedChunksRef.current = [];

            recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
            recorder.onstop = () => {
                if (recordedChunksRef.current.length > 0) {
                    const blob = new Blob(recordedChunksRef.current, { type: selectedMimeType });
                    downloadBlobFile(blob, `meeting-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`);
                    toast.success('Recording saved!');
                }
            };

            recorder.start(1000);
            mediaRecorderRef.current = recorder;
            drawFrame();

            // Timer
            setRecordingTime(0);
            recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);

            setIsRecording(true);
            toast.success('Recording started');
        } catch (e) {
            console.error('Recording failed:', e);
            toast.error('Failed to start recording');
        }
    };

    const stopRecording = (silent = false) => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
        clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingTime(0);
        if (!silent) toast('Recording stopped');
    };

    /* ═══════════════════════════════════════════════
       SAVE TRANSCRIPT & ANALYZE
       ═══════════════════════════════════════════════ */
    const saveTranscriptAndAnalyze = async () => {
        const entries = transcriptRef.current;
        if (!entries.length) {
            toast.error('No transcript data to save. Enable captions and speak first.');
            return;
        }
        setSavingTranscript(true);
        const toastId = toast.loading(`Saving ${entries.length} transcript entries & running AI analysis...`);
        try {
            const res = await videoMeetingAPI.saveTranscript(roomId, {
                title: `Video Meeting (${new Date().toLocaleDateString()})`,
                transcript: entries,
                auto_analyze: true,
            });
            const { meeting_id, subtitle_count, analysis_status } = res.data;
            if (analysis_status === 'analyzed') {
                toast.success(`Saved ${subtitle_count} lines & analysis complete!`, { id: toastId });
            } else if (analysis_status === 'analysis_failed') {
                toast.success(`Saved ${subtitle_count} lines. Analysis failed — you can retry later.`, { id: toastId });
            } else {
                toast.success(`Saved ${subtitle_count} lines.`, { id: toastId });
            }
            // Navigate to the meeting detail page
            navigate(`/meetings/${meeting_id}`);
        } catch (err) {
            console.error('Save transcript failed:', err);
            toast.error(err.response?.data?.detail || 'Failed to save transcript', { id: toastId });
        } finally {
            setSavingTranscript(false);
        }
    };

    /* ═══════════════════════════════════════════════
       HAND RAISE & REACTIONS
       ═══════════════════════════════════════════════ */
    const toggleHandRaise = useCallback(() => {
        const newState = !handRaised;
        setHandRaised(newState);
        wsRef.current?.send(JSON.stringify({
            type: 'hand-raise', raised: newState,
            sender_name: user?.full_name || 'You'
        }));
        toast(newState ? '✋ Hand raised' : '✋ Hand lowered');
    }, [handRaised, user]);

    const sendReaction = (emoji) => {
        showReaction(emoji, user?.full_name || 'You');
        wsRef.current?.send(JSON.stringify({
            type: 'reaction', emoji,
            sender_name: user?.full_name || 'You'
        }));
    };

    const showReaction = (emoji, senderName) => {
        const id = Date.now() + Math.random();
        setReactions(prev => [...prev, { id, emoji, sender: senderName }]);
        setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
    };

    /* ═══════════════════════════════════════════════
       POLLS
       ═══════════════════════════════════════════════ */
    const createPoll = () => {
        if (!newPollQuestion.trim() || newPollOptions.filter(o => o.trim()).length < 2) {
            toast.error('Need a question and at least 2 options');
            return;
        }
        const poll = {
            id: Date.now().toString(),
            question: newPollQuestion,
            options: newPollOptions.filter(o => o.trim()),
            votes: {},
            creator: user?.full_name || 'You'
        };
        setPolls(prev => [...prev, poll]);
        wsRef.current?.send(JSON.stringify({ type: 'poll', poll }));
        setNewPollQuestion('');
        setNewPollOptions(['', '']);
        setShowPollCreator(false);
        toast.success('Poll created!');
    };

    const votePoll = (pollId, option) => {
        setPolls(prev => prev.map(p =>
            p.id === pollId
                ? { ...p, votes: { ...p.votes, [option]: (p.votes?.[option] || 0) + 1 }, myVote: option }
                : p
        ));
        wsRef.current?.send(JSON.stringify({ type: 'poll-vote', pollId, option }));
    };

    /* ═══════════════════════════════════════════════
       FULLSCREEN
       ═══════════════════════════════════════════════ */
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen?.();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen?.();
            setIsFullscreen(false);
        }
    };

    /* ═══════════════════════════════════════════════
       PANEL TOGGLE
       ═══════════════════════════════════════════════ */
    const togglePanel = (panel) => {
        setActivePanel(prev => prev === panel ? null : panel);
        if (panel === 'chat') setUnreadChats(0);
        setShowMoreMenu(false);
    };

    /* ═══════════════════════════════════════════════
       PARTICIPANT COUNT
       ═══════════════════════════════════════════════ */
    const peerCount = Object.keys(peers).length;
    const totalParticipants = peerCount + 1;

    // Calculate grid class
    const getGridClass = () => {
        if (layout === 'speaker') return 'vm-video-grid speaker-mode';
        const total = totalParticipants + (screenStream ? 1 : 0);
        if (total <= 1) return 'vm-video-grid grid-1';
        if (total <= 2) return 'vm-video-grid grid-2';
        if (total <= 4) return 'vm-video-grid grid-4';
        if (total <= 6) return 'vm-video-grid grid-6';
        return 'vm-video-grid grid-many';
    };

    /* ═══════════════════════════════════════════════
       RENDER
       ═══════════════════════════════════════════════ */
    return (
        <div className="vm-meeting-room" ref={containerRef}>
            {/* ── Floating Reactions ── */}
            <div className="vm-reactions-overlay">
                {reactions.map(r => (
                    <div key={r.id} className="vm-floating-reaction">
                        <span className="vm-floating-emoji">{r.emoji}</span>
                        <span className="vm-floating-name">{r.sender}</span>
                    </div>
                ))}
            </div>

            {/* ── Top Bar ── */}
            <div className="vm-topbar">
                <div className="vm-topbar-left">
                    <div className="vm-meeting-info">
                        <span className="vm-meeting-title">{roomInfo?.title || 'Meeting'}</span>
                        <span className="vm-meeting-time">
                            <Timer size={12} /> {formatTime(meetingDuration)}
                        </span>
                    </div>
                    {roomInfo?.meeting_code && (
                        <div className="vm-meeting-credentials">
                            <span className="vm-meeting-code" title="Meeting Code">
                                <Hash size={11} /> {roomInfo.meeting_code}
                            </span>
                            {roomInfo.password && (
                                <span className="vm-meeting-pwd" title="Meeting Password">
                                    <Lock size={11} /> {roomInfo.password}
                                </span>
                            )}
                        </div>
                    )}
                    {isRecording && (
                        <div className="vm-recording-badge">
                            <Circle size={8} fill="#ef4444" color="#ef4444" />
                            <span>REC {formatTime(recordingTime)}</span>
                        </div>
                    )}
                </div>
                <div className="vm-topbar-right">
                    {raisedHands.size > 0 && (
                        <span className="vm-raised-count">✋ {raisedHands.size}</span>
                    )}
                    <span className="vm-participant-count">
                        <Users size={14} /> {totalParticipants}
                    </span>
                    <button className="vm-topbar-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
                        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>
                    <button className="vm-topbar-btn" onClick={copyInvite} title="Copy invite details">
                        <Copy size={16} />
                    </button>
                </div>
            </div>

            {/* ── Main Content Area ── */}
            <div className="vm-main-area">
                {/* Video Grid */}
                <div className={`vm-content ${activePanel ? 'with-panel' : ''}`}>
                    <div className={getGridClass()}>
                        {/* Screen Share */}
                        {screenStream && (
                            <div className="vm-video-tile screen-share-tile">
                                <video
                                    ref={screenVideoRef}
                                    autoPlay muted playsInline
                                    style={{ objectFit: 'contain', background: '#000' }}
                                />
                                <div className="vm-video-label">
                                    <span className="vm-video-name"><Monitor size={12} /> Screen Share</span>
                                </div>
                            </div>
                        )}

                        {/* Local Video */}
                        <div className={`vm-video-tile ${!camOn ? 'cam-off' : ''}`}>
                            <video ref={localVideoRef} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
                            {!camOn && (
                                <div className="vm-avatar-placeholder">
                                    <div className="vm-avatar-circle">
                                        {(user?.full_name || 'U')[0].toUpperCase()}
                                    </div>
                                </div>
                            )}
                            <div className="vm-video-label">
                                <span className="vm-video-name">
                                    You {handRaised && '✋'}
                                </span>
                                <div className="vm-video-indicators">
                                    {!micOn && <MicOff size={12} />}
                                    {!camOn && <VideoOff size={12} />}
                                </div>
                            </div>
                        </div>

                        {/* Remote Peers */}
                        {Object.entries(peers).map(([id, peer]) => (
                            <div key={id} className="vm-video-tile">
                                <VideoPlayer stream={peer.stream} />
                                <div className="vm-video-label">
                                    <span className="vm-video-name">
                                        {participants.find(p => String(p.id) === String(id))?.name || `User ${id}`}
                                        {raisedHands.has(participants.find(p => String(p.id) === String(id))?.name) && ' ✋'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Captions Overlay ── */}
                    {captionsOn && captions.length > 0 && (
                        <div className="vm-captions-overlay">
                            {captions.slice(-3).map((cap, i) => (
                                <div key={i} className={`vm-caption-line ${cap.final ? 'final' : 'interim'}`}>
                                    <span className="vm-caption-speaker">{cap.speaker}:</span>
                                    <span className="vm-caption-text">{cap.text}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Side Panel ── */}
                {activePanel && (
                    <div className="vm-sidebar">
                        <div className="vm-sidebar-header">
                            <h3>
                                {activePanel === 'chat' && '💬 Chat'}
                                {activePanel === 'participants' && '👥 Participants'}
                                {activePanel === 'whiteboard' && '🎨 Whiteboard'}
                                {activePanel === 'polls' && '📊 Polls'}
                                {activePanel === 'qa' && '❓ Q&A'}
                                {activePanel === 'notepad' && '📝 Notepad'}
                            </h3>
                            <button className="vm-sidebar-close" onClick={() => setActivePanel(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="vm-sidebar-body">
                            {/* Chat Panel */}
                            {activePanel === 'chat' && (
                                <Chat
                                    ws={wsRef.current}
                                    messages={chatMessages}
                                    isCompact={false}
                                    showTimestamps={true}
                                    onSendMessage={sendChatMessage}
                                    participants={participants}
                                    currentUser={user}
                                    isAdmin={true}
                                    chatEnabled={communityChatEnabled}
                                    privateChatEnabled={privateChatEnabled}
                                    onToggleCommunityChat={() => {
                                        setCommunityChatEnabled(prev => !prev);
                                        wsRef.current?.send(JSON.stringify({
                                            type: 'admin-setting',
                                            setting: 'community-chat',
                                            enabled: !communityChatEnabled,
                                        }));
                                        toast.success(communityChatEnabled ? 'Community chat disabled' : 'Community chat enabled');
                                    }}
                                    onTogglePrivateChat={() => {
                                        setPrivateChatEnabled(prev => !prev);
                                        wsRef.current?.send(JSON.stringify({
                                            type: 'admin-setting',
                                            setting: 'private-chat',
                                            enabled: !privateChatEnabled,
                                        }));
                                        toast.success(privateChatEnabled ? 'Private chat disabled' : 'Private chat enabled');
                                    }}
                                />
                            )}

                            {/* Participants Panel */}
                            {activePanel === 'participants' && (
                                <div className="vm-participants-list">
                                    <div className="vm-participant-item you">
                                        <div className="vm-participant-avatar">{(user?.full_name || 'U')[0].toUpperCase()}</div>
                                        <div className="vm-participant-info">
                                            <span className="vm-participant-name">{user?.full_name || 'You'} (You)</span>
                                            <span className="vm-participant-role">Host</span>
                                        </div>
                                        <div className="vm-participant-status">
                                            {handRaised && <span>✋</span>}
                                            {micOn ? <Mic size={14} /> : <MicOff size={14} className="muted" />}
                                            {camOn ? <Video size={14} /> : <VideoOff size={14} className="muted" />}
                                        </div>
                                    </div>
                                    {participants.map(p => (
                                        <div key={p.id} className="vm-participant-item">
                                            <div className="vm-participant-avatar">{(p.name || 'U')[0].toUpperCase()}</div>
                                            <div className="vm-participant-info">
                                                <span className="vm-participant-name">{p.name}</span>
                                            </div>
                                            <div className="vm-participant-status">
                                                {raisedHands.has(p.name) && <span>✋</span>}
                                                <button
                                                    className="vm-kick-btn"
                                                    title={`Mute ${p.name}`}
                                                    onClick={() => {
                                                        wsRef.current?.send(JSON.stringify({
                                                            type: 'admin-setting',
                                                            setting: 'mute-participant',
                                                            target_user_id: p.id,
                                                            target_name: p.name,
                                                        }));
                                                        toast.success(`Mute request sent to ${p.name}`);
                                                    }}
                                                >
                                                    <VolumeX size={12} />
                                                </button>
                                                <button
                                                    className="vm-kick-btn"
                                                    title={`Remove ${p.name}`}
                                                    onClick={() => {
                                                        if (confirm(`Remove ${p.name} from the meeting?`)) {
                                                            wsRef.current?.send(JSON.stringify({
                                                                type: 'kick', target_user_id: p.id
                                                            }));
                                                            toast.success(`${p.name} has been removed`);
                                                        }
                                                    }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {/* ── Host Controls Section ── */}
                                    <div className="vm-admin-controls">
                                        <div className="vm-admin-title">🛡️ Host Controls</div>

                                        <button
                                            className={`vm-admin-toggle ${meetingLocked ? 'active-danger' : ''}`}
                                            onClick={() => {
                                                setMeetingLocked(prev => !prev);
                                                wsRef.current?.send(JSON.stringify({
                                                    type: 'admin-setting',
                                                    setting: 'meeting-locked',
                                                    enabled: !meetingLocked,
                                                }));
                                                toast.success(meetingLocked ? 'Meeting unlocked' : 'Meeting locked');
                                            }}
                                        >
                                            {meetingLocked ? <LockKeyhole size={14} /> : <Unlock size={14} />}
                                            <span>{meetingLocked ? 'Meeting Locked' : 'Lock Meeting'}</span>
                                        </button>

                                        <button
                                            className="vm-admin-toggle"
                                            onClick={() => {
                                                wsRef.current?.send(JSON.stringify({
                                                    type: 'admin-setting',
                                                    setting: 'mute-all',
                                                    enabled: true,
                                                }));
                                                toast.success('Mute request sent to all participants');
                                            }}
                                        >
                                            <VolumeX size={14} />
                                            <span>Mute All</span>
                                        </button>

                                        <button
                                            className={`vm-admin-toggle ${!participantScreenShareEnabled ? 'active-danger' : ''}`}
                                            onClick={() => {
                                                setParticipantScreenShareEnabled(prev => !prev);
                                                wsRef.current?.send(JSON.stringify({
                                                    type: 'admin-setting',
                                                    setting: 'screen-share',
                                                    enabled: !participantScreenShareEnabled,
                                                }));
                                                toast.success(participantScreenShareEnabled ? 'Screen sharing disabled for participants' : 'Screen sharing enabled for participants');
                                            }}
                                        >
                                            {participantScreenShareEnabled ? <Monitor size={14} /> : <MonitorOff size={14} />}
                                            <span>{participantScreenShareEnabled ? 'Disable Screen Share' : 'Enable Screen Share'}</span>
                                        </button>

                                        <button
                                            className={`vm-admin-toggle ${!communityChatEnabled ? 'active-danger' : ''}`}
                                            onClick={() => {
                                                setCommunityChatEnabled(prev => !prev);
                                                wsRef.current?.send(JSON.stringify({
                                                    type: 'admin-setting',
                                                    setting: 'community-chat',
                                                    enabled: !communityChatEnabled,
                                                }));
                                                toast.success(communityChatEnabled ? 'Community chat disabled' : 'Community chat enabled');
                                            }}
                                        >
                                            {communityChatEnabled ? <MessageSquare size={14} /> : <Lock size={14} />}
                                            <span>{communityChatEnabled ? 'Disable Community Chat' : 'Enable Community Chat'}</span>
                                        </button>

                                        <button
                                            className={`vm-admin-toggle ${!privateChatEnabled ? 'active-danger' : ''}`}
                                            onClick={() => {
                                                setPrivateChatEnabled(prev => !prev);
                                                wsRef.current?.send(JSON.stringify({
                                                    type: 'admin-setting',
                                                    setting: 'private-chat',
                                                    enabled: !privateChatEnabled,
                                                }));
                                                toast.success(privateChatEnabled ? 'Private chat disabled' : 'Private chat enabled');
                                            }}
                                        >
                                            {privateChatEnabled ? <Users size={14} /> : <Lock size={14} />}
                                            <span>{privateChatEnabled ? 'Disable Private Chat' : 'Enable Private Chat'}</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Whiteboard Panel */}
                            {activePanel === 'whiteboard' && (
                                <div style={{ flex: 1, minHeight: 400, position: 'relative' }}>
                                    <Whiteboard ws={wsRef.current} isActive={activePanel === 'whiteboard'} />
                                    <button
                                        className="vm-notepad-copy"
                                        style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
                                        onClick={() => {
                                            const canvas = document.querySelector('canvas');
                                            if (canvas) {
                                                // Use data URL approach instead of blob to avoid
                                                // Windows SmartScreen blocking the download
                                                const dataUrl = canvas.toDataURL('image/png');
                                                const a = document.createElement('a');
                                                a.href = dataUrl;
                                                a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
                                                document.body.appendChild(a);
                                                a.click();
                                                setTimeout(() => document.body.removeChild(a), 100);
                                                toast.success('Whiteboard saved!');
                                            } else {
                                                toast.error('No whiteboard to save');
                                            }
                                        }}
                                    >
                                        <Download size={14} /> Save Image
                                    </button>
                                </div>
                            )}

                            {/* Polls Panel */}
                            {activePanel === 'polls' && (
                                <div className="vm-polls-panel">
                                    {!showPollCreator ? (
                                        <button className="vm-create-poll-btn" onClick={() => setShowPollCreator(true)}>
                                            + Create Poll
                                        </button>
                                    ) : (
                                        <div className="vm-poll-creator">
                                            <input
                                                className="vm-poll-input"
                                                placeholder="Poll question..."
                                                value={newPollQuestion}
                                                onChange={e => setNewPollQuestion(e.target.value)}
                                            />
                                            {newPollOptions.map((opt, i) => (
                                                <input
                                                    key={i}
                                                    className="vm-poll-input"
                                                    placeholder={`Option ${i + 1}`}
                                                    value={opt}
                                                    onChange={e => {
                                                        const nOpts = [...newPollOptions];
                                                        nOpts[i] = e.target.value;
                                                        setNewPollOptions(nOpts);
                                                    }}
                                                />
                                            ))}
                                            <div className="vm-poll-creator-actions">
                                                <button className="vm-poll-add-opt" onClick={() => setNewPollOptions(prev => [...prev, ''])}>
                                                    + Add Option
                                                </button>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button className="vm-poll-cancel" onClick={() => setShowPollCreator(false)}>Cancel</button>
                                                    <button className="vm-poll-submit" onClick={createPoll}>Create</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {polls.length === 0 && !showPollCreator && (
                                        <div className="vm-polls-empty">
                                            <BarChart3 size={32} strokeWidth={1} />
                                            <p>No polls yet</p>
                                        </div>
                                    )}
                                    {polls.map(poll => (
                                        <div key={poll.id} className="vm-poll-card">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <h4 className="vm-poll-question">{poll.question}</h4>
                                                    <p className="vm-poll-by">by {poll.creator}</p>
                                                </div>
                                                <button
                                                    className="vm-notepad-copy"
                                                    style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                                                    onClick={() => {
                                                        const totalVotes = Object.values(poll.votes || {}).reduce((a, b) => a + b, 0);
                                                        let text = `📊 Poll: ${poll.question}\n${'─'.repeat(30)}\n`;
                                                        poll.options.forEach(opt => {
                                                            const v = poll.votes?.[opt] || 0;
                                                            const pct = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
                                                            text += `${opt}: ${v} votes (${pct}%)\n`;
                                                        });
                                                        text += `\nTotal: ${totalVotes} votes`;
                                                        navigator.clipboard.writeText(text);
                                                        toast.success('Poll results copied!');
                                                    }}
                                                >
                                                    <Share2 size={12} /> Share
                                                </button>
                                            </div>
                                            <div className="vm-poll-options">
                                                {poll.options.map(opt => {
                                                    const totalVotes = Object.values(poll.votes || {}).reduce((a, b) => a + b, 0);
                                                    const optVotes = poll.votes?.[opt] || 0;
                                                    const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                                                    return (
                                                        <button
                                                            key={opt}
                                                            className={`vm-poll-option ${poll.myVote === opt ? 'voted' : ''}`}
                                                            onClick={() => !poll.myVote && votePoll(poll.id, opt)}
                                                            disabled={!!poll.myVote}
                                                        >
                                                            <span className="vm-poll-opt-text">{opt}</span>
                                                            <span className="vm-poll-opt-pct">{pct}%</span>
                                                            <div className="vm-poll-opt-bar" style={{ width: `${pct}%` }} />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Q&A Panel */}
                            {activePanel === 'qa' && (
                                <div className="vm-qa-panel">
                                    <div className="vm-qa-list">
                                        {questions.length === 0 && (
                                            <div className="vm-polls-empty">
                                                <HelpCircle size={32} strokeWidth={1} />
                                                <p>No questions yet</p>
                                            </div>
                                        )}
                                        {questions.map((q, i) => (
                                            <div key={i} className="vm-qa-item">
                                                <div className="vm-qa-text">{q.text}</div>
                                                <div className="vm-qa-meta">
                                                    <span className="vm-qa-author">{q.author}</span>
                                                    <button
                                                        className={`vm-qa-upvote ${q.upvoted ? 'voted' : ''}`}
                                                        onClick={() => {
                                                            setQuestions(prev => prev.map((qn, idx) =>
                                                                idx === i ? { ...qn, votes: (qn.votes || 0) + (qn.upvoted ? -1 : 1), upvoted: !qn.upvoted } : qn
                                                            ));
                                                        }}
                                                    >
                                                        <ChevronUp size={14} /> {q.votes || 0}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="vm-qa-input-row">
                                        <input
                                            className="vm-qa-input"
                                            placeholder="Ask a question..."
                                            value={newQuestion}
                                            onChange={e => setNewQuestion(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && newQuestion.trim()) {
                                                    setQuestions(prev => [...prev, {
                                                        text: newQuestion.trim(),
                                                        author: user?.full_name || 'You',
                                                        votes: 0,
                                                        upvoted: false,
                                                    }]);
                                                    setNewQuestion('');
                                                }
                                            }}
                                        />
                                        <button
                                            className="vm-qa-send"
                                            onClick={() => {
                                                if (newQuestion.trim()) {
                                                    setQuestions(prev => [...prev, {
                                                        text: newQuestion.trim(),
                                                        author: user?.full_name || 'You',
                                                        votes: 0,
                                                        upvoted: false,
                                                    }]);
                                                    setNewQuestion('');
                                                }
                                            }}
                                        >
                                            <Send size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Notepad Panel */}
                            {activePanel === 'notepad' && (
                                <div className="vm-notepad-panel">
                                    <textarea
                                        className="vm-notepad-textarea"
                                        value={notepadText}
                                        onChange={e => setNotepadText(e.target.value)}
                                        placeholder="Type your meeting notes here..."
                                        spellCheck={false}
                                    />
                                    <div className="vm-notepad-actions">
                                        <button
                                            className="vm-notepad-copy"
                                            onClick={() => {
                                                navigator.clipboard.writeText(notepadText);
                                                toast.success('Notes copied!');
                                            }}
                                        >
                                            <Copy size={14} /> Copy
                                        </button>
                                        <button
                                            className="vm-notepad-copy"
                                            onClick={() => {
                                                meetingsAPI.downloadClientFile(
                                                    notepadText,
                                                    `meeting-notes-${new Date().toISOString().slice(0, 10)}.txt`,
                                                    'text/plain'
                                                );
                                                toast.success('Notes downloaded!');
                                            }}
                                        >
                                            <Download size={14} /> Download TXT
                                        </button>
                                        <button
                                            className="vm-notepad-copy vm-share-btn"
                                            onClick={() => {
                                                wsRef.current?.send(JSON.stringify({
                                                    type: 'chat',
                                                    text: `📝 **Shared Notes:**\n${notepadText}`
                                                }));
                                                setChatMessages(prev => [...prev, {
                                                    sender: user?.full_name || 'You',
                                                    text: `📝 **Shared Notes:**\n${notepadText}`,
                                                    isMe: true,
                                                    timestamp: new Date().toISOString()
                                                }]);
                                                toast.success('Notes shared to chat!');
                                            }}
                                        >
                                            <Share2 size={14} /> Share to All
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Bottom Controls Bar ── */}
                <div className="vm-controls">
                    <div className="vm-ctrl-group">
                        {/* Mic */}
                        <button
                            className={`vm-ctrl-btn ${!micOn ? 'off' : ''}`}
                            onClick={toggleMic}
                            title="Toggle Mic (M)"
                        >
                            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                        </button>

                        {/* Camera */}
                        <button
                            className={`vm-ctrl-btn ${!camOn ? 'off' : ''}`}
                            onClick={toggleCam}
                            title="Toggle Camera (V)"
                        >
                            {camOn ? <Video size={20} /> : <VideoOff size={20} />}
                        </button>

                        {/* Screen Share */}
                        <button
                            className={`vm-ctrl-btn ${screenStream ? 'active' : ''}`}
                            onClick={toggleScreenShare}
                            title="Screen Share"
                        >
                            {screenStream ? <MonitorOff size={20} /> : <Monitor size={20} />}
                        </button>

                        <div className="vm-ctrl-divider" />

                        {/* Captions */}
                        <button
                            className={`vm-ctrl-btn ${captionsOn ? 'active' : ''}`}
                            onClick={toggleCaptions}
                            title="Captions (C)"
                        >
                            {captionsOn ? <Captions size={20} /> : <CaptionsOff size={20} />}
                        </button>

                        {/* Recording */}
                        <button
                            className={`vm-ctrl-btn ${isRecording ? 'recording' : ''}`}
                            onClick={toggleRecording}
                            title="Record (R)"
                        >
                            {isRecording ? <Square size={18} fill="currentColor" /> : <Circle size={20} />}
                        </button>

                        {/* Hand Raise */}
                        <button
                            className={`vm-ctrl-btn ${handRaised ? 'active' : ''}`}
                            onClick={toggleHandRaise}
                            title="Raise Hand (H)"
                        >
                            <Hand size={20} />
                        </button>

                        <div className="vm-ctrl-divider" />

                        {/* Chat */}
                        <button
                            className={`vm-ctrl-btn ${activePanel === 'chat' ? 'active' : ''}`}
                            onClick={() => togglePanel('chat')}
                            title="Chat"
                            style={{ position: 'relative' }}
                        >
                            <MessageSquare size={20} />
                            {unreadChats > 0 && <span className="vm-badge">{unreadChats}</span>}
                        </button>

                        {/* Participants */}
                        <button
                            className={`vm-ctrl-btn ${activePanel === 'participants' ? 'active' : ''}`}
                            onClick={() => togglePanel('participants')}
                            title="Participants"
                        >
                            <Users size={20} />
                        </button>

                        {/* Whiteboard */}
                        <button
                            className={`vm-ctrl-btn ${activePanel === 'whiteboard' ? 'active' : ''}`}
                            onClick={() => togglePanel('whiteboard')}
                            title="Whiteboard"
                        >
                            <Pencil size={20} />
                        </button>

                        {/* Polls */}
                        <button
                            className={`vm-ctrl-btn ${activePanel === 'polls' ? 'active' : ''}`}
                            onClick={() => togglePanel('polls')}
                            title="Polls"
                        >
                            <BarChart3 size={20} />
                        </button>

                        {/* Q&A */}
                        <button
                            className={`vm-ctrl-btn ${activePanel === 'qa' ? 'active' : ''}`}
                            onClick={() => togglePanel('qa')}
                            title="Q&A"
                            style={{ position: 'relative' }}
                        >
                            <HelpCircle size={20} />
                            {questions.length > 0 && <span className="vm-badge">{questions.length}</span>}
                        </button>

                        {/* Notepad */}
                        <button
                            className={`vm-ctrl-btn ${activePanel === 'notepad' ? 'active' : ''}`}
                            onClick={() => togglePanel('notepad')}
                            title="Notepad"
                        >
                            <FileText size={20} />
                        </button>

                        {/* More */}
                        <div style={{ position: 'relative' }}>
                            <button
                                className={`vm-ctrl-btn ${showMoreMenu ? 'active' : ''}`}
                                onClick={() => setShowMoreMenu(!showMoreMenu)}
                                title="More"
                            >
                                <MoreVertical size={20} />
                            </button>
                            {showMoreMenu && (
                                <div className="vm-more-menu">
                                    {/* Save Transcript & Analyze */}
                                    <button
                                        className="vm-more-item vm-save-transcript"
                                        onClick={() => { saveTranscriptAndAnalyze(); setShowMoreMenu(false); }}
                                        disabled={savingTranscript}
                                        title={transcriptRef.current.length === 0 ? 'Enable captions first to capture a transcript' : `${transcriptRef.current.length} transcript entries ready`}
                                    >
                                        <Download size={16} />
                                        {savingTranscript ? 'Saving...' : `Save Transcript & Analyze (${transcriptRef.current.length})`}
                                    </button>
                                    <div className="vm-more-divider" />
                                    <button className="vm-more-item" onClick={() => { setLayout(l => l === 'grid' ? 'speaker' : 'grid'); setShowMoreMenu(false); }}>
                                        <Settings2 size={16} /> {layout === 'grid' ? 'Speaker View' : 'Grid View'}
                                    </button>
                                    <button className="vm-more-item" onClick={() => { toggleFullscreen(); setShowMoreMenu(false); }}>
                                        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                                    </button>
                                    <div className="vm-more-divider" />
                                    <div className="vm-reactions-row">
                                        {['👍', '👏', '❤️', '😂', '😮', '🎉'].map(emoji => (
                                            <button key={emoji} className="vm-reaction-btn" onClick={() => { sendReaction(emoji); setShowMoreMenu(false); }}>
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="vm-more-divider" />
                                    <div className="vm-shortcut-hints">
                                        <span><kbd>M</kbd> Mic</span>
                                        <span><kbd>V</kbd> Camera</span>
                                        <span><kbd>H</kbd> Hand</span>
                                        <span><kbd>C</kbd> Captions</span>
                                        <span><kbd>R</kbd> Record</span>
                                        <span><kbd>Esc</kbd> Close Panel</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="vm-ctrl-divider" />

                        {/* Leave */}
                        <button className="vm-ctrl-btn leave" onClick={handleLeave} title="Leave Meeting">
                            <PhoneOff size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Video Player for Remote Streams ── */
const VideoPlayer = ({ stream }) => {
    const videoRef = useRef(null);
    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);
    return <video ref={videoRef} autoPlay playsInline />;
};
