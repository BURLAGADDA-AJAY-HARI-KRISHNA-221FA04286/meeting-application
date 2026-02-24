import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Layout, Mic, Bell, Shield, Check } from 'lucide-react';
import './SettingsModal.css';
import { PRODUCTIVITY_SETTINGS } from './SettingsConfig';

export default function SettingsModal({ isOpen, onClose, userSettings, onUpdateSettings }) {
    const [activeTab, setActiveTab] = useState('performance');

    if (!isOpen) return null;

    const handleToggle = (categoryId, settingId) => {
        // Create new settings object
        const newSettings = { ...userSettings, [settingId]: !userSettings[settingId] };
        onUpdateSettings(newSettings);

        // Save to LocalStorage for persistence
        localStorage.setItem('meetingAppSettings', JSON.stringify(newSettings));
    };

    const getIcon = (iconName) => {
        switch (iconName) {
            case 'Zap': return <Zap size={16} />;
            case 'Layout': return <Layout size={16} />;
            case 'Mic': return <Mic size={16} />;
            case 'Bell': return <Bell size={16} />;
            case 'Shield': return <Shield size={16} />;
            default: return <Zap size={16} />;
        }
    };

    return (
        <div className="settings-modal-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={e => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>⚙️ Settings</h2>
                    <button className="btn-icon-only btn-ghost" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="settings-body">
                    <div className="settings-sidebar">
                        {PRODUCTIVITY_SETTINGS.map(category => (
                            <button
                                key={category.id}
                                className={`settings-tab ${activeTab === category.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(category.id)}
                            >
                                <span style={{ marginRight: 8 }}>{getIcon(category.icon)}</span>
                                {category.label}
                            </button>
                        ))}
                    </div>

                    <div className="settings-content">
                        {PRODUCTIVITY_SETTINGS.map(category => (
                            activeTab === category.id && (
                                <div key={category.id} className="setting-group-content">
                                    <h3 style={{ marginBottom: 16 }}>{category.label}</h3>
                                    {category.items.map(item => (
                                        <div key={item.id} className="setting-item">
                                            <div className="setting-info">
                                                <span className="setting-label">{item.id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                                                <span className="setting-desc">{item.desc}</span>
                                            </div>
                                            <label className="toggle-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={!!userSettings[item.id]}
                                                    onChange={() => handleToggle(category.id, item.id)}
                                                />
                                                <span className="slider"></span>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            )
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
