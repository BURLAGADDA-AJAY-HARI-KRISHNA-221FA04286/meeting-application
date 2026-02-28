import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { videoMeetingAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { Video, Lock, Hash, ArrowRight, Plus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import './JoinMeeting.css';

export default function JoinMeetingPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [meetingCode, setMeetingCode] = useState('');
    const [password, setPassword] = useState('');
    const [joining, setJoining] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [createdRoom, setCreatedRoom] = useState(null);

    const handleJoin = async (e) => {
        e.preventDefault();
        if (!meetingCode.trim() || !password.trim()) {
            toast.error('Please enter meeting code and password');
            return;
        }

        setJoining(true);
        try {
            const res = await videoMeetingAPI.joinRoom(meetingCode.trim(), password.trim());
            toast.success(`Joining "${res.data.title}"...`);
            navigate(`/meetings/room/${res.data.room_id}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to join meeting');
        } finally {
            setJoining(false);
        }
    };

    const handleCreate = async () => {
        setCreating(true);
        try {
            const title = newTitle.trim() || `${user?.full_name || 'User'}'s Meeting`;
            const res = await videoMeetingAPI.createRoom(title);
            setCreatedRoom(res.data);
            toast.success('Meeting created! Share the code & password below.');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create meeting');
        } finally {
            setCreating(false);
        }
    };

    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copied!`);
    };

    const joinCreatedRoom = () => {
        if (createdRoom) {
            navigate(`/meetings/room/${createdRoom.room_id}`);
        }
    };

    return (
        <div className="join-meeting-page">
            <div className="join-bg">
                <div className="join-orb join-orb-1" />
                <div className="join-orb join-orb-2" />
                <div className="join-orb join-orb-3" />
            </div>

            <div className="join-container">
                {/* JOIN SECTION */}
                <motion.div
                    className="join-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <div className="join-card-header">
                        <div className="join-icon-wrap join-icon-blue">
                            <Users size={24} />
                        </div>
                        <h2>Join a Meeting</h2>
                        <p>Enter the meeting code and password to join</p>
                    </div>

                    <form onSubmit={handleJoin} className="join-form">
                        <div className="join-field">
                            <label><Hash size={14} /> Meeting Code</label>
                            <input
                                type="text"
                                placeholder="abc-defg-hij"
                                value={meetingCode}
                                onChange={e => setMeetingCode(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="join-field">
                            <label><Lock size={14} /> Password</label>
                            <input
                                type="password"
                                placeholder="6-digit password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>

                        <motion.button
                            type="submit"
                            className="join-btn join-btn-primary"
                            disabled={joining || !meetingCode.trim() || !password.trim()}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {joining ? (
                                <div className="spinner" />
                            ) : (
                                <>
                                    <ArrowRight size={18} />
                                    Join Meeting
                                </>
                            )}
                        </motion.button>
                    </form>
                </motion.div>

                {/* DIVIDER */}
                <div className="join-divider">
                    <span>OR</span>
                </div>

                {/* CREATE SECTION */}
                <motion.div
                    className="join-card"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <div className="join-card-header">
                        <div className="join-icon-wrap join-icon-purple">
                            <Plus size={24} />
                        </div>
                        <h2>Create a Meeting</h2>
                        <p>Start a new meeting and share the code with others</p>
                    </div>

                    {!createdRoom ? (
                        <div className="join-form">
                            <div className="join-field">
                                <label><Video size={14} /> Meeting Title (optional)</label>
                                <input
                                    type="text"
                                    placeholder="My Team Meeting"
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                />
                            </div>

                            <motion.button
                                type="button"
                                className="join-btn join-btn-secondary"
                                onClick={handleCreate}
                                disabled={creating}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {creating ? (
                                    <div className="spinner" />
                                ) : (
                                    <>
                                        <Plus size={18} />
                                        Create Meeting
                                    </>
                                )}
                            </motion.button>
                        </div>
                    ) : (
                        <motion.div
                            className="created-info"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <div className="created-title">{createdRoom.title}</div>

                            <div className="created-row">
                                <span className="created-label">Meeting Code</span>
                                <div className="created-value">
                                    <code>{createdRoom.meeting_code}</code>
                                    <button
                                        className="copy-btn"
                                        onClick={() => copyToClipboard(createdRoom.meeting_code, 'Meeting code')}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>

                            <div className="created-row">
                                <span className="created-label">Password</span>
                                <div className="created-value">
                                    <code>{createdRoom.password}</code>
                                    <button
                                        className="copy-btn"
                                        onClick={() => copyToClipboard(createdRoom.password, 'Password')}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>

                            <div className="created-row">
                                <span className="created-label">Invite Link</span>
                                <div className="created-value">
                                    <code className="link-code">{window.location.origin}{createdRoom.join_link}</code>
                                    <button
                                        className="copy-btn"
                                        onClick={() => copyToClipboard(`${window.location.origin}${createdRoom.join_link}`, 'Invite link')}
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>

                            <div className="created-share-tip">
                                Share the <strong>meeting code</strong> and <strong>password</strong> with participants
                            </div>

                            <motion.button
                                className="join-btn join-btn-primary"
                                onClick={joinCreatedRoom}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <Video size={18} />
                                Enter Meeting
                            </motion.button>

                            <button
                                className="join-btn join-btn-ghost"
                                onClick={() => {
                                    const text = `Join my meeting!\n\nMeeting Code: ${createdRoom.meeting_code}\nPassword: ${createdRoom.password}\nLink: ${window.location.origin}${createdRoom.join_link}`;
                                    copyToClipboard(text, 'All meeting details');
                                }}
                            >
                                Copy All Details
                            </button>
                        </motion.div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
