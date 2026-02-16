import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Brain, Eye, EyeOff, ArrowRight, Zap, Shield, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import './Auth.css';

export default function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' });
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.password !== form.confirm) {
            toast.error('Passwords do not match');
            return;
        }
        setLoading(true);
        try {
            await register(form.email, form.password, form.full_name);
            toast.success('Account created!');
            navigate('/dashboard');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-bg-effects">
                <div className="auth-orb orb-1" />
                <div className="auth-orb orb-2" />
                <div className="auth-orb orb-3" />
            </div>

            <motion.div
                className="auth-container"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                {/* Left — branding */}
                <div className="auth-hero">
                    <div className="auth-hero-content">
                        <motion.div
                            className="auth-logo"
                            animate={{ boxShadow: ['0 8px 24px rgba(99,102,241,0.25)', '0 8px 32px rgba(99,102,241,0.4)', '0 8px 24px rgba(99,102,241,0.25)'] }}
                            transition={{ repeat: Infinity, duration: 3 }}
                        >
                            <Brain size={32} />
                        </motion.div>
                        <h1 className="auth-hero-title">
                            Meeting<span className="gradient-text">AI</span>
                        </h1>
                        <p className="auth-hero-subtitle">
                            Transform your meetings into actionable intelligence with AI-powered analysis.
                        </p>
                        <div className="auth-features">
                            {[
                                { icon: Zap, title: 'AI-Powered Analysis', desc: 'Instant summaries, actions & risks' },
                                { icon: Shield, title: 'Risk Detection', desc: 'Never miss critical issues' },
                                { icon: BarChart3, title: 'Smart Task Board', desc: 'Auto-generated action items' },
                            ].map((f, i) => (
                                <motion.div
                                    key={f.title}
                                    className="auth-feature"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 + i * 0.1 }}
                                >
                                    <div className="auth-feature-icon"><f.icon size={18} /></div>
                                    <div>
                                        <strong>{f.title}</strong>
                                        <span>{f.desc}</span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right — form */}
                <div className="auth-form-section">
                    <form className="auth-form" onSubmit={handleSubmit}>
                        <div className="auth-form-header">
                            <h2>Create account</h2>
                            <p>Start analyzing meetings in seconds</p>
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="register-name">Full Name</label>
                            <input
                                id="register-name"
                                className="input"
                                type="text"
                                placeholder="John Doe"
                                value={form.full_name}
                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                autoFocus
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="register-email">Email</label>
                            <input
                                id="register-email"
                                className="input"
                                type="email"
                                placeholder="you@example.com"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="register-password">Password</label>
                            <div className="password-input-wrapper">
                                <input
                                    id="register-password"
                                    className="input"
                                    type={showPw ? 'text' : 'password'}
                                    placeholder="Min 8 characters"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    required
                                    minLength={8}
                                />
                                <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="register-confirm">Confirm Password</label>
                            <input
                                id="register-confirm"
                                className="input"
                                type="password"
                                placeholder="••••••••"
                                value={form.confirm}
                                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                                required
                                minLength={8}
                            />
                        </div>

                        <motion.button
                            id="register-submit"
                            className="btn btn-primary btn-lg auth-submit"
                            type="submit"
                            disabled={loading}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                        >
                            {loading ? <div className="spinner" /> : <>Create Account <ArrowRight size={18} /></>}
                        </motion.button>

                        <p className="auth-switch">
                            Already have an account? <Link to="/login">Sign in</Link>
                        </p>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
