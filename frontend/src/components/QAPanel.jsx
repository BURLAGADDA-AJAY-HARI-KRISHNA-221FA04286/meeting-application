import React, { useState } from 'react';
import { ThumbsUp, Send, Trash2, User, CircleHelp } from 'lucide-react';

export default function QAPanel({ questions, isHost, onAsk, onUpvote, onDelete }) {
    const [questionText, setQuestionText] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!questionText.trim()) return;

        onAsk({
            text: questionText,
            anonymous: isAnonymous
        });
        setQuestionText('');
        setIsAnonymous(false);
    };

    // Sort questions by upvotes
    const sortedQuestions = [...questions].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));

    return (
        <div className="qa-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header / List */}
            <div className="qa-list" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                {sortedQuestions.length === 0 ? (
                    <div className="qa-empty" style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)' }}>
                        <CircleHelp size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                        <p>No questions yet.</p>
                        <p style={{ fontSize: '0.8rem' }}>Be the first to ask!</p>
                    </div>
                ) : (
                    sortedQuestions.map(q => (
                        <div key={q.id} className="qa-item" style={{
                            background: 'var(--bg-secondary)',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                            position: 'relative'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <User size={12} />
                                    <span>{q.sender}</span>
                                    <span>•</span>
                                    <span>{new Date(q.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                {isHost && (
                                    <button
                                        onClick={() => onDelete(q.id)}
                                        className="btn btn-ghost btn-xs text-danger"
                                        title="Delete Question"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>{q.text}</p>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button
                                    className="btn btn-ghost btn-xs"
                                    onClick={() => onUpvote(q.id)}
                                    style={{ color: q.myUpvote ? 'var(--accent-primary)' : 'inherit' }}
                                >
                                    <ThumbsUp size={14} fill={q.myUpvote ? 'currentColor' : 'none'} />
                                    <span style={{ marginLeft: 4 }}>{q.upvotes || 0}</span>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} style={{
                padding: 12,
                borderTop: '1px solid var(--border-color)',
                background: 'var(--bg-primary)'
            }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <textarea
                        className="input"
                        placeholder="Ask a question..."
                        value={questionText}
                        onChange={e => setQuestionText(e.target.value)}
                        style={{ minHeight: 60, resize: 'none' }}
                        required
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={isAnonymous}
                            onChange={e => setIsAnonymous(e.target.checked)}
                        />
                        Ask anonymously
                    </label>
                    <button type="submit" className="btn btn-primary btn-sm">
                        <Send size={14} style={{ marginRight: 4 }} /> Ask
                    </button>
                </div>
            </form>
        </div>
    );
}
