import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import './Chat.css';

export default function Chat({ ws, onSendMessage, messages, isCompact, showTimestamps }) {
    const [input, setInput] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const messagesEndRef = useRef(null);
    const emojiRef = useRef(null);

    // Common emoji quick-select instead of heavy picker dependency
    const quickEmojis = ['👍', '❤️', '😂', '🎉', '🔥', '👏', '😍', '🤔', '💯', '✅'];

    const toggleEmoji = () => setShowEmoji(!showEmoji);

    const handleEmojiSelect = (emoji) => {
        setInput(prev => prev + emoji);
        setShowEmoji(false);
    };

    const handleSend = (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        if (onSendMessage) {
            onSendMessage(input);
        }
        setInput('');
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
        } catch {
            return '';
        }
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
                                <div className="chat-text">{msg.text}</div>
                                {showTimestamps && msg.timestamp && (
                                    <div className="chat-time">{formatTime(msg.timestamp)}</div>
                                )}
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
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            ref={emojiRef}
                            className="emoji-picker-container"
                            style={{
                                position: 'absolute',
                                bottom: '100%',
                                left: 0,
                                background: 'var(--bg-primary, #1e293b)',
                                border: '1px solid var(--border-color, #334155)',
                                borderRadius: 12,
                                padding: 12,
                                zIndex: 100,
                                display: 'grid',
                                gridTemplateColumns: 'repeat(5, 1fr)',
                                gap: 8,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                            }}
                        >
                            {quickEmojis.map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => handleEmojiSelect(emoji)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '1.4rem',
                                        cursor: 'pointer',
                                        padding: 6,
                                        borderRadius: 8,
                                        transition: 'background 0.2s',
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                                    onMouseLeave={(e) => e.target.style.background = 'none'}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </form>
        </div>
    );
}
