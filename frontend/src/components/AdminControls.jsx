import React, { useState } from 'react';
import { Shield, Lock, Unlock, UserCheck, Key, X, UserMinus, Crown, Eye } from 'lucide-react';

export default function AdminControls({ meetingSettings, onUpdateSettings, participants, waitingUsers, onKick, onSetRole, onAdmit, onDeny }) {
    const settings = meetingSettings || { locked: false, waiting_room: false, password: null };
    const [password, setPassword] = useState('');
    const [showPasswordInput, setShowPasswordInput] = useState(false);

    // Handler for settings toggle
    const toggleLock = () => {
        onUpdateSettings({ locked: !settings.locked });
    };

    const toggleWaitingRoom = () => {
        onUpdateSettings({ waiting_room: !settings.waiting_room });
    };

    const handlePasswordSubmit = (e) => {
        e.preventDefault();
        onUpdateSettings({ password: password });
        setPassword('');
        setShowPasswordInput(false);
    };

    const clearPassword = () => {
        onUpdateSettings({ password: null });
    };

    return (
        <div className="admin-panel" style={{ padding: 16 }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={20} className="text-primary" /> Admin Controls
            </h3>

            {/* General Settings */}
            <div className="admin-section" style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Meeting Security</h4>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {settings.locked ? <Lock size={16} color="#ef4444" /> : <Unlock size={16} color="#10b981" />}
                        <span>Lock Meeting</span>
                    </div>
                    <label className="switch">
                        <input type="checkbox" checked={settings.locked} onChange={toggleLock} />
                        <span className="slider round"></span>
                    </label>
                </div>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <UserCheck size={16} />
                        <span>Waiting Room</span>
                    </div>
                    <label className="switch">
                        <input type="checkbox" checked={settings.waiting_room} onChange={toggleWaitingRoom} />
                        <span className="slider round"></span>
                    </label>
                </div>

                <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Key size={16} />
                        <span>Password</span>
                    </div>
                    <div>
                        {settings.password ? (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span className="badge badge-success">Active</span>
                                <button className="btn btn-ghost btn-xs" onClick={clearPassword}><X size={12} /></button>
                            </div>
                        ) : (
                            <button className="btn btn-secondary btn-xs" onClick={() => setShowPasswordInput(!showPasswordInput)}>
                                Set
                            </button>
                        )}
                    </div>
                </div>

                {showPasswordInput && (
                    <form onSubmit={handlePasswordSubmit} style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            className="input input-sm"
                            placeholder="Enter password..."
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary btn-sm">Save</button>
                    </form>
                )}
            </div>

            {/* Waiting Room List (Mock/Real) */}
            {waitingUsers.length > 0 && (
                <div className="admin-section" style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Waiting Room ({waitingUsers.length})</h4>
                    {waitingUsers.map(u => (
                        <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span>{u.name}</span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-success btn-xs" onClick={() => onAdmit(u.id)}>Admit</button>
                                <button className="btn btn-danger btn-xs" onClick={() => onDeny?.(u.id)}>Deny</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Participant Management */}
            <div className="admin-section">
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Manage Participants</h4>
                <ul className="participant-list">
                    {participants.map(p => (
                        <li key={p.id || p.user_id} className="participant-item" style={{ justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="participant-avatar">{(p.name || 'U')[0]}</div>
                                <span>{p.name || `User ${p.user_id}`}</span>
                                {p.role === 'host' && <Crown size={12} fill="gold" color="gold" />}
                            </div>

                            {/* Controls only for non-self */}
                            {p.role !== 'host' && (
                                <div className="participant-actions" style={{ display: 'flex', gap: 4 }}>
                                    <button className="btn btn-ghost btn-xs" onClick={() => onSetRole(p.user_id, 'host')} title="Make Host">
                                        <Crown size={14} />
                                    </button>
                                    <button className="btn btn-ghost btn-xs" onClick={() => onSetRole(p.user_id, 'presenter')} title="Make Presenter">
                                        <Eye size={14} />
                                    </button>
                                    <button className="btn btn-ghost btn-xs text-danger" onClick={() => onKick(p.user_id)} title="Kick">
                                        <UserMinus size={14} />
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
