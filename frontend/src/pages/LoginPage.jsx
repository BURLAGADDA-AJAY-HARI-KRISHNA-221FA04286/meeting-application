import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Brain, Eye, EyeOff, ArrowRight, Zap, Shield, BarChart3, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import './Auth.css';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '' });
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(form.email, form.password);
            toast.success('Welcome back!');
            navigate('/dashboard');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Login failed');
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
                            Transform your meetings into actionable intelligence with AI-powered analysis, risk detection, and smart task generation.
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
                            <h2>Welcome back</h2>
                            <p>Sign in to continue to MeetingAI</p>
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="login-email">Email</label>
                            <input
                                id="login-email"
                                className="input"
                                type="email"
                                placeholder="you@example.com"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                required
                                autoFocus
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label" htmlFor="login-password">Password</label>
                            <div className="password-input-wrapper">
                                <input
                                    id="login-password"
                                    className="input"
                                    type={showPw ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    required
                                />
                                <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)}>
                                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <motion.button
                            id="login-submit"
                            className="btn btn-primary btn-lg auth-submit"
                            type="submit"
                            disabled={loading}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                        >
                            {loading ? <div className="spinner" /> : <>Sign In <ArrowRight size={18} /></>}
                        </motion.button>

                        <p className="auth-switch">
                            Don't have an account? <Link to="/register">Create one</Link>
                        </p>
                    </form>
                </div>
            </motion.div>
        </div>
    );
}
