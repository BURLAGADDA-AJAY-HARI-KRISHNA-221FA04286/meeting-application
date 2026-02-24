import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Copy, Search } from 'lucide-react';
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

export default function Chat({ ws, onSendMessage, messages, isCompact, showTimestamps }) {
    const [input, setInput] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [emojiCategory, setEmojiCategory] = useState('Smileys');
    const [emojiSearch, setEmojiSearch] = useState('');
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
        if (onSendMessage) onSendMessage(input);
        setInput('');
    };

    const handleCopyMessage = (text) => {
        navigator.clipboard.writeText(text);
    };

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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

    // Filter emojis by search
    const getFilteredEmojis = () => {
        if (!emojiSearch) return EMOJI_CATEGORIES[emojiCategory] || [];
        const lower = emojiSearch.toLowerCase();
        return Object.values(EMOJI_CATEGORIES).flat().filter(e => e.includes(lower));
    };

    return (
        <div className="chat-component">
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="chat-empty">
                        <Smile size={48} color="#e5e7eb" />
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
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
                    placeholder="Type a message..."
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
                            {/* Category Tabs */}
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

                            {/* Search */}
                            <div className="emoji-search">
                                <Search size={12} />
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={emojiSearch}
                                    onChange={e => setEmojiSearch(e.target.value)}
                                />
                            </div>

                            {/* Emoji Grid */}
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
        </div>
    );
}
