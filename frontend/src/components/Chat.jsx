import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Copy, Search, Users, User, Lock, Unlock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './Chat.css';

/* ── Emoji data organized by category ── */
const EMOJI_CATEGORIES = {
    'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '😱', '😨', '😰', '😥', '😢', '😭', '😤', '😡', '🤬', '💀', '💩', '🤡', '👹', '👻', '👽', '🤖', '😺', '😸', '😻'],
    'Gestures': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '✍️', '🤳'],
    'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
    'Objects': ['🔥', '⭐', '🌟', '✨', '⚡', '💫', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '📌', '📍', '🔔', '🔕', '📣', '📢', '💡', '🔑', '🗝️', '📝', '📋', '📎', '📏'],
    'Symbols': ['✅', '❌', '⭕', '❗', '❓', '💯', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⬛', '⬜', '🔶', '🔷', '▶️', '⏸️', '⏹️', '🔄', '⏰', '⏳', '♻️', '🔒', '🔓'],
};

export default function Chat({
    ws,
    onSendMessage,
    messages,
    isCompact,
    showTimestamps,
    participants = [],
    currentUser = null,
    isAdmin = false,
    chatEnabled = true,
    privateChatEnabled = true,
    onToggleCommunityChat,
    onTogglePrivateChat,
}) {
    const [input, setInput] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [emojiCategory, setEmojiCategory] = useState('Smileys');
    const [emojiSearch, setEmojiSearch] = useState('');
    const [chatMode, setChatMode] = useState('community'); // 'community' | 'private'
    const [privateTo, setPrivateTo] = useState(null); // { id, name }
    const [privateMessages, setPrivateMessages] = useState({}); // { oderId: [msgs] }
    const [unreadPrivate, setUnreadPrivate] = useState({}); // { oderId: count }
    const messagesEndRef = useRef(null);
    const emojiRef = useRef(null);
    const inputRef = useRef(null);

    const toggleEmoji = () => setShowEmoji(!showEmoji);

    const handleEmojiSelect = (emoji) => {
        setInput(prev => prev + emoji);
        inputRef.current?.focus();
    };

    const handleSend = (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        if (chatMode === 'private' && privateTo) {
            // Send private message
            const msg = {
                sender: currentUser?.full_name || 'You',
                text: input,
                isMe: true,
                timestamp: new Date().toISOString(),
                private: true,
                to: privateTo,
            };
            setPrivateMessages(prev => ({
                ...prev,
                [privateTo.id]: [...(prev[privateTo.id] || []), msg],
            }));
            // Send via WebSocket
            ws?.send(JSON.stringify({
                type: 'private-chat',
                target_user_id: privateTo.id,
                text: input,
            }));
        } else {
            // Community message
            if (onSendMessage) onSendMessage(input);
        }
        setInput('');
    };

    const handleCopyMessage = (text) => {
        navigator.clipboard.writeText(text);
    };

    // Handle incoming private messages
    useEffect(() => {
        if (!ws) return;
        const handleMessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'private-chat') {
                    const senderId = data.sender_id || data.sender;
                    const senderName = data.sender_name || 'Someone';
                    const msg = {
                        sender: senderName,
                        text: data.text,
                        isMe: false,
                        timestamp: new Date().toISOString(),
                        private: true,
                    };
                    setPrivateMessages(prev => ({
                        ...prev,
                        [senderId]: [...(prev[senderId] || []), msg],
                    }));
                    // If not currently viewing this private chat, increment unread
                    if (chatMode !== 'private' || privateTo?.id !== senderId) {
                        setUnreadPrivate(prev => ({
                            ...prev,
                            [senderId]: (prev[senderId] || 0) + 1,
                        }));
                    }
                }
            } catch { /* not for us */ }
        };
        ws.addEventListener('message', handleMessage);
        return () => ws.removeEventListener('message', handleMessage);
    }, [ws, chatMode, privateTo]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, privateMessages, privateTo]);

    // Close emoji picker on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (emojiRef.current && !emojiRef.current.contains(event.target)) {
                setShowEmoji(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        try {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };

    const getFilteredEmojis = () => {
        if (!emojiSearch) return EMOJI_CATEGORIES[emojiCategory] || [];
        return Object.values(EMOJI_CATEGORIES).flat();
    };

    const currentMessages = chatMode === 'private' && privateTo
        ? (privateMessages[privateTo.id] || [])
        : messages;

    const selectPrivateUser = (p) => {
        setPrivateTo(p);
        setChatMode('private');
        // Clear unread for this user
        setUnreadPrivate(prev => ({ ...prev, [p.id]: 0 }));
    };

    const isChatDisabled = chatMode === 'community' && !chatEnabled;
    const isPrivateDisabled = chatMode === 'private' && !privateChatEnabled;

    return (
        <div className="chat-component">
            {/* ── Chat Mode Tabs ── */}
            <div className="chat-mode-tabs">
                <button
                    className={`chat-mode-tab ${chatMode === 'community' ? 'active' : ''}`}
                    onClick={() => { setChatMode('community'); setPrivateTo(null); }}
                >
                    <Users size={14} /> Community
                    {!chatEnabled && <Lock size={10} className="chat-lock-icon" />}
                </button>
                <button
                    className={`chat-mode-tab ${chatMode === 'private' ? 'active' : ''}`}
                    onClick={() => setChatMode('private')}
                >
                    <User size={14} /> Private
                    {!privateChatEnabled && <Lock size={10} className="chat-lock-icon" />}
                    {Object.values(unreadPrivate).reduce((a, b) => a + b, 0) > 0 && (
                        <span className="chat-unread-badge">
                            {Object.values(unreadPrivate).reduce((a, b) => a + b, 0)}
                        </span>
                    )}
                </button>
                {isAdmin && (
                    <div className="chat-admin-controls">
                        <button
                            className={`chat-admin-btn ${chatEnabled ? 'enabled' : 'disabled'}`}
                            onClick={onToggleCommunityChat}
                            title={chatEnabled ? 'Disable community chat' : 'Enable community chat'}
                        >
                            {chatEnabled ? <Unlock size={12} /> : <Lock size={12} />}
                        </button>
                        <button
                            className={`chat-admin-btn ${privateChatEnabled ? 'enabled' : 'disabled'}`}
                            onClick={onTogglePrivateChat}
                            title={privateChatEnabled ? 'Disable private chat' : 'Enable private chat'}
                        >
                            {privateChatEnabled ? <Unlock size={12} /> : <Lock size={12} />}
                            <span style={{ fontSize: '0.6rem' }}>DM</span>
                        </button>
                    </div>
                )}
            </div>

            {/* ── Private Chat User Selector ── */}
            {chatMode === 'private' && !privateTo && (
                <div className="chat-private-users">
                    <div className="chat-private-label">Select a person to chat with:</div>
                    {participants.length === 0 ? (
                        <div className="chat-empty-small">No other participants yet</div>
                    ) : (
                        participants.map(p => (
                            <button
                                key={p.id}
                                className="chat-private-user-btn"
                                onClick={() => selectPrivateUser(p)}
                            >
                                <div className="chat-private-avatar">{(p.name || 'U')[0].toUpperCase()}</div>
                                <span>{p.name}</span>
                                {unreadPrivate[p.id] > 0 && (
                                    <span className="chat-unread-badge">{unreadPrivate[p.id]}</span>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}

            {/* ── Private Chat Header ── */}
            {chatMode === 'private' && privateTo && (
                <div className="chat-private-header">
                    <span>💬 Chat with <strong>{privateTo.name}</strong></span>
                    <button className="chat-private-back" onClick={() => setPrivateTo(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ── Messages ── */}
            {(chatMode === 'community' || privateTo) && (
                <div className="chat-messages">
                    {isChatDisabled && (
                        <div className="chat-disabled-notice">
                            <Lock size={20} />
                            <p>Community chat is disabled by the host</p>
                        </div>
                    )}
                    {isPrivateDisabled && (
                        <div className="chat-disabled-notice">
                            <Lock size={20} />
                            <p>Private chat is disabled by the host</p>
                        </div>
                    )}
                    {!isChatDisabled && !isPrivateDisabled && currentMessages.length === 0 ? (
                        <div className="chat-empty">
                            <Smile size={48} color="#e5e7eb" />
                            <p>{chatMode === 'private' ? `Start chatting with ${privateTo?.name}` : 'No messages yet. Start the conversation!'}</p>
                        </div>
                    ) : (
                        !isChatDisabled && !isPrivateDisabled && currentMessages.map((msg, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`chat-message ${msg.isMe ? 'me' : 'other'} ${isCompact ? 'compact' : ''}`}
                            >
                                <div className="chat-bubble">
                                    {!msg.isMe && <div className="chat-sender">{msg.sender || 'User'}</div>}
                                    <div className="chat-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                                    <div className="chat-meta">
                                        {showTimestamps && msg.timestamp && (
                                            <span className="chat-time">{formatTime(msg.timestamp)}</span>
                                        )}
                                        <button
                                            className="chat-copy-btn"
                                            onClick={() => handleCopyMessage(msg.text)}
                                            title="Copy message"
                                        >
                                            <Copy size={10} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* ── Input Area ── */}
            {!isChatDisabled && !isPrivateDisabled && (chatMode === 'community' || privateTo) && (
                <form className="chat-input-area" onSubmit={handleSend}>
                    <div className="chat-controls">
                        <button type="button" className="btn-icon" onClick={toggleEmoji}>
                            <Smile size={20} />
                        </button>
                    </div>

                    <input
                        ref={inputRef}
                        className="chat-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={chatMode === 'private' ? `Message ${privateTo?.name}...` : "Type a message..."}
                    />

                    <button type="submit" className="btn-send" disabled={!input.trim()}>
                        <Send size={18} />
                    </button>

                    <AnimatePresence>
                        {showEmoji && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                ref={emojiRef}
                                className="emoji-picker-container"
                            >
                                <div className="emoji-tabs">
                                    {Object.keys(EMOJI_CATEGORIES).map(cat => (
                                        <button
                                            key={cat}
                                            type="button"
                                            className={`emoji-tab ${emojiCategory === cat ? 'active' : ''}`}
                                            onClick={() => { setEmojiCategory(cat); setEmojiSearch(''); }}
                                        >
                                            {cat === 'Smileys' && '😀'}
                                            {cat === 'Gestures' && '👋'}
                                            {cat === 'Hearts' && '❤️'}
                                            {cat === 'Objects' && '🔥'}
                                            {cat === 'Symbols' && '✅'}
                                        </button>
                                    ))}
                                </div>
                                <div className="emoji-search">
                                    <Search size={12} />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={emojiSearch}
                                        onChange={e => setEmojiSearch(e.target.value)}
                                    />
                                </div>
                                <div className="emoji-grid">
                                    {getFilteredEmojis().map((emoji, i) => (
                                        <button
                                            key={`${emoji}-${i}`}
                                            type="button"
                                            onClick={() => handleEmojiSelect(emoji)}
                                            className="emoji-btn"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </form>
            )}
        </div>
    );
}
