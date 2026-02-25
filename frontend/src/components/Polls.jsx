import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Vote, Plus, X } from 'lucide-react';

export default function Polls({ ws, activePoll, isHost, onCreatePoll }) {
    const [creationMode, setCreationMode] = useState(false);
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['Yes', 'No']);
    const [hasVoted, setHasVoted] = useState(false);

    // activePoll = { question: string, options: string[], votes: { [optionIndex]: count } }

    const handleCreate = (e) => {
        e.preventDefault();
        if (!question.trim()) return;

        onCreatePoll({
            question,
            options: options.filter(o => o.trim())
        });
        setCreationMode(false);
        setQuestion('');
        setOptions(['Yes', 'No']);
        setHasVoted(false);
    };

    const handleOptionChange = (idx, val) => {
        const newOpts = [...options];
        newOpts[idx] = val;
        setOptions(newOpts);
    };

    const addOption = () => setOptions([...options, '']);
    const removeOption = (idx) => setOptions(options.filter((_, i) => i !== idx));

    const castVote = (idx) => {
        if (hasVoted) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'POLL_VOTE',
                option_index: idx
            }));
            setHasVoted(true);
        }
    };

    // Prepare chart data
    const chartData = activePoll ? activePoll.options.map((opt, i) => ({
        name: opt,
        votes: activePoll.votes[i] || 0
    })) : [];

    return (
        <div className="polls-container" style={{ padding: 16 }}>
            {!activePoll && !creationMode ? (
                <div className="polls-empty" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Vote size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                    <p>No active poll.</p>
                    {isHost ? (
                        <button className="btn btn-primary btn-sm" onClick={() => setCreationMode(true)} style={{ marginTop: 12 }}>
                            Create Poll
                        </button>
                    ) : (
                        <p style={{ marginTop: 12, fontSize: '0.85rem' }}>Only host can create a poll.</p>
                    )}
                </div>
            ) : creationMode ? (
                <form onSubmit={handleCreate} className="poll-creation-form">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h4 style={{ margin: 0 }}>New Poll</h4>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreationMode(false)}><X size={16} /></button>
                    </div>

                    <input
                        className="input"
                        placeholder="Ask a question..."
                        value={question}
                        onChange={e => setQuestion(e.target.value)}
                        style={{ marginBottom: 12 }}
                        required
                    />

                    <div className="poll-options-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {options.map((opt, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6 }}>
                                <input
                                    className="input"
                                    placeholder={`Option ${i + 1}`}
                                    value={opt}
                                    onChange={e => handleOptionChange(i, e.target.value)}
                                    required
                                />
                                {options.length > 2 && (
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeOption(i)}><X size={14} /></button>
                                )}
                            </div>
                        ))}
                    </div>

                    <button type="button" className="btn btn-ghost btn-xs" onClick={addOption} style={{ marginTop: 8 }}>
                        <Plus size={12} /> Add Option
                    </button>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>Launch Poll</button>
                </form>
            ) : (
                <div className="active-poll">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                        <h4 style={{ margin: 0 }}>{activePoll.question}</h4>
                        {/* Host could stop poll here if we implemented that logic */}
                    </div>

                    {!hasVoted ? (
                        <div className="poll-vote-options" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {activePoll.options.map((opt, i) => (
                                <button
                                    key={i}
                                    className="btn btn-secondary"
                                    onClick={() => castVote(i)}
                                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="poll-results" style={{ height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                                    <Tooltip cursor={{ fill: 'transparent' }} />
                                    <Bar dataKey="votes" fill="var(--accent-primary)" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
                                Thanks for voting! Results update live.
                            </p>
                            {isHost && (
                                <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 12 }} onClick={() => setCreationMode(true)}>
                                    Start New Poll
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
