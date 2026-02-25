import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, api, getRefreshToken } from '../api';

import { motion } from 'framer-motion';
import {
    User, Lock, Keyboard, Info, Save, Eye, EyeOff,
    Settings, Shield, Zap, Github
} from 'lucide-react';
import toast from 'react-hot-toast';
import './Settings.css';

const fadeUp = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
};

export default function SettingsPage() {
    const { user, updateUser } = useAuth();
    const [profile, setProfile] = useState({
        full_name: user?.full_name || '',
        email: user?.email || '',
    });
    const [passwords, setPasswords] = useState({
        current_password: '',
        new_password: '',
        confirm_password: '',
    });
    const [showPw, setShowPw] = useState({});
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPw, setSavingPw] = useState(false);
    const [githubToken, setGithubToken] = useState(() => sessionStorage.getItem('github_token') || localStorage.getItem('github_token') || '');
    const [githubRepo, setGithubRepo] = useState(() => sessionStorage.getItem('github_repo') || localStorage.getItem('github_repo') || '');
    const [jiraBaseUrl, setJiraBaseUrl] = useState(() => sessionStorage.getItem('jira_base_url') || localStorage.getItem('jira_base_url') || '');
    const [jiraProjectKey, setJiraProjectKey] = useState(() => sessionStorage.getItem('jira_project_key') || localStorage.getItem('jira_project_key') || '');
    const [jiraEmail, setJiraEmail] = useState(() => sessionStorage.getItem('jira_email') || localStorage.getItem('jira_email') || '');
    const [jiraApiToken, setJiraApiToken] = useState(() => sessionStorage.getItem('jira_api_token') || localStorage.getItem('jira_api_token') || '');

    const handleProfileSave = async (e) => {
        e.preventDefault();
        setSavingProfile(true);
        try {
            const res = await authAPI.updateProfile(profile);
            updateUser(res.data);
            toast.success('Profile updated!');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Update failed');
        } finally {
            setSavingProfile(false);
        }
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (passwords.new_password !== passwords.confirm_password) {
            toast.error('Passwords do not match');
            return;
        }
        setSavingPw(true);
        try {
            await authAPI.changePassword({
                current_password: passwords.current_password,
                new_password: passwords.new_password,
                refresh_token: getRefreshToken(),
            });
            toast.success('Password changed!');
            setPasswords({ current_password: '', new_password: '', confirm_password: '' });
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to change password');
        } finally {
            setSavingPw(false);
        }
    };

    const shortcuts = [
        { name: 'New Meeting', keys: ['Ctrl', 'N'] },
        { name: 'Search', keys: ['Ctrl', 'K'] },
        { name: 'Dashboard', keys: ['Alt', '1'] },
        { name: 'Meetings', keys: ['Alt', '2'] },
        { name: 'Tasks', keys: ['Alt', '3'] },
        { name: 'Settings', keys: ['Alt', '4'] },
    ];

    return (
        <div className="page-container settings-page">
            <motion.div className="settings-header" {...fadeUp}>
                <h1 className="page-title">
                    <Settings size={24} style={{ color: 'var(--accent-primary)' }} /> Settings
                </h1>
                <p className="page-subtitle">Manage your account and preferences</p>
            </motion.div>

            <div className="settings-grid">
                {/* ── Profile ── */}
                <motion.div className="card settings-card" {...fadeUp} transition={{ delay: 0.05 }}>
                    <div className="settings-avatar-section">
                        <div className="settings-avatar">
                            {(user?.full_name || 'U')[0].toUpperCase()}
                        </div>
                        <div className="settings-avatar-info">
                            <h4>{user?.full_name || 'User'}</h4>
                            <p>{user?.email}</p>
                        </div>
                    </div>
                    <h3><User size={18} /> Profile</h3>
                    <p>Update your personal information</p>
                    <form className="profile-form" onSubmit={handleProfileSave}>
                        <div className="input-group">
                            <label className="input-label" htmlFor="settings-name">Full Name</label>
                            <input
                                id="settings-name"
                                className="input"
                                value={profile.full_name}
                                onChange={e => setProfile({ ...profile, full_name: e.target.value })}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label" htmlFor="settings-email">Email</label>
                            <input
                                id="settings-email"
                                className="input"
                                type="email"
                                value={profile.email}
                                onChange={e => setProfile({ ...profile, email: e.target.value })}
                            />
                        </div>
                        <div className="profile-actions">
                            <motion.button
                                className="btn btn-primary"
                                type="submit"
                                disabled={savingProfile}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {savingProfile ? <div className="spinner" /> : <><Save size={16} /> Save Changes</>}
                            </motion.button>
                        </div>
                    </form>
                </motion.div>

                {/* ── Password ── */}
                <motion.div className="card settings-card" {...fadeUp} transition={{ delay: 0.05 }}>
                    <h3><Lock size={18} /> Change Password</h3>
                    <p>Keep your account secure</p>
                    <form className="password-form" onSubmit={handlePasswordChange}>
                        {[
                            { id: 'current_password', label: 'Current Password', placeholder: '••••••••' },
                            { id: 'new_password', label: 'New Password', placeholder: 'Min 8 characters' },
                            { id: 'confirm_password', label: 'Confirm New Password', placeholder: '••••••••' },
                        ].map(field => (
                            <div className="input-group" key={field.id}>
                                <label className="input-label" htmlFor={`settings-${field.id}`}>{field.label}</label>
                                <div className="password-input-wrapper">
                                    <input
                                        id={`settings-${field.id}`}
                                        className="input"
                                        type={showPw[field.id] ? 'text' : 'password'}
                                        placeholder={field.placeholder}
                                        value={passwords[field.id]}
                                        onChange={e => setPasswords({ ...passwords, [field.id]: e.target.value })}
                                        required
                                        minLength={field.id !== 'current_password' ? 8 : undefined}
                                    />
                                    <button
                                        type="button"
                                        className="pw-toggle"
                                        onClick={() => setShowPw({ ...showPw, [field.id]: !showPw[field.id] })}
                                    >
                                        {showPw[field.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                        ))}
                        <div className="password-actions">
                            <motion.button
                                className="btn btn-primary"
                                type="submit"
                                disabled={savingPw}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                {savingPw ? <div className="spinner" /> : <><Shield size={16} /> Update Password</>}
                            </motion.button>
                        </div>
                    </form>
                </motion.div>

                {/* ── Shortcuts ── */}
                <motion.div className="card settings-card" {...fadeUp} transition={{ delay: 0.08 }}>
                    <h3><Keyboard size={18} /> Keyboard Shortcuts</h3>
                    <p>Navigate faster with keyboard shortcuts</p>
                    <div className="shortcuts-grid">
                        {shortcuts.map(s => (
                            <div key={s.name} className="shortcut-item">
                                <span className="shortcut-name">{s.name}</span>
                                <div className="shortcut-keys">
                                    {s.keys.map(k => (
                                        <span key={k} className="shortcut-key-tag">{k}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* ── Integrations ── */}
                <motion.div className="card settings-card" {...fadeUp} transition={{ delay: 0.1 }}>
                    <h3><Github size={18} /> Integrations</h3>
                    <p>Connect with external services</p>
                    <div className="input-group">
                        <label className="input-label" htmlFor="gh-token">GitHub Personal Access Token (PAT)</label>
                        <input
                            id="gh-token"
                            className="input"
                            type="password"
                            placeholder="ghp_xxxxxxxxxxxx"
                            value={githubToken}
                            onChange={(e) => {
                                const value = e.target.value;
                                setGithubToken(value);
                                sessionStorage.setItem('github_token', value);
                                localStorage.removeItem('github_token');
                            }}
                        />
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4 }}>
                            Required to export tasks as issues. Token is stored locally in your browser.
                        </small>
                    </div>
                    {githubToken && (
                        <div style={{ marginBottom: 16 }}>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={async () => {
                                    const token = githubToken;
                                    if (!token) return;
                                    const toastId = toast.loading('Verifying token...');
                                    try {
                                        const res = await api.post('/integrations/github/test', { token });
                                        if (res.data.valid) {
                                            toast.success(res.data.message, { id: toastId });
                                        } else {
                                            toast.error(res.data.message, { id: toastId });
                                        }
                                    } catch (e) {
                                        toast.error('Verification failed', { id: toastId });
                                    }
                                }}
                            >
                                <Zap size={14} /> Verify Token
                            </button>
                        </div>
                    )}
                    <div className="input-group">
                        <label className="input-label" htmlFor="gh-repo">Default Repository (optional)</label>
                        <input
                            id="gh-repo"
                            className="input"
                            placeholder="username/repo-name"
                            value={githubRepo}
                            onChange={(e) => {
                                const value = e.target.value;
                                setGithubRepo(value);
                                sessionStorage.setItem('github_repo', value);
                                localStorage.removeItem('github_repo');
                            }}
                        />
                    </div>

                    <div className="input-group" style={{ marginTop: 18 }}>
                        <label className="input-label" htmlFor="jira-base-url">Jira Base URL (optional)</label>
                        <input
                            id="jira-base-url"
                            className="input"
                            placeholder="https://your-company.atlassian.net"
                            value={jiraBaseUrl}
                            onChange={(e) => {
                                const value = e.target.value;
                                setJiraBaseUrl(value);
                                sessionStorage.setItem('jira_base_url', value);
                                localStorage.removeItem('jira_base_url');
                            }}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="jira-project-key">Jira Project Key</label>
                        <input
                            id="jira-project-key"
                            className="input"
                            placeholder="ENG"
                            value={jiraProjectKey}
                            onChange={(e) => {
                                const value = e.target.value;
                                setJiraProjectKey(value);
                                sessionStorage.setItem('jira_project_key', value);
                                localStorage.removeItem('jira_project_key');
                            }}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="jira-email">Jira Email</label>
                        <input
                            id="jira-email"
                            className="input"
                            type="email"
                            placeholder="name@company.com"
                            value={jiraEmail}
                            onChange={(e) => {
                                const value = e.target.value;
                                setJiraEmail(value);
                                sessionStorage.setItem('jira_email', value);
                                localStorage.removeItem('jira_email');
                            }}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label" htmlFor="jira-api-token">Jira API Token</label>
                        <input
                            id="jira-api-token"
                            className="input"
                            type="password"
                            placeholder="Atlassian API token"
                            value={jiraApiToken}
                            onChange={(e) => {
                                const value = e.target.value;
                                setJiraApiToken(value);
                                sessionStorage.setItem('jira_api_token', value);
                                localStorage.removeItem('jira_api_token');
                            }}
                        />
                    </div>
                </motion.div>

                {/* ── About ── */}
                <motion.div className="card settings-card" {...fadeUp} transition={{ delay: 0.12 }}>
                    <h3><Info size={18} /> About MeetingAI</h3>
                    <p>Application information</p>
                    <div className="about-info">
                        <div className="about-row">
                            <span className="about-label">Version</span>
                            <span className="about-value">2.0.0</span>
                        </div>
                        <div className="about-row">
                            <span className="about-label">AI Engine</span>
                            <span className="about-value">Google Gemini</span>
                        </div>
                        <div className="about-row">
                            <span className="about-label">Framework</span>
                            <span className="about-value">React + FastAPI</span>
                        </div>
                        <div className="about-row">
                            <span className="about-label">Tech Stack</span>
                            <div className="about-tech-stack">
                                {['React', 'FastAPI', 'PostgreSQL', 'Gemini AI'].map(t => (
                                    <span key={t} className="badge badge-primary">{t}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
