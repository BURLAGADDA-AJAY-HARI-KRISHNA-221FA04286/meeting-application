import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Mic, Video, Monitor, Hand, MessageSquare, Smile, Settings, PhoneOff } from 'lucide-react';
import './LandingPage.css';

/* ── Particle canvas ── */
function Particles() {
    const ref = useRef(null);
    useEffect(() => {
        const c = ref.current; if (!c) return;
        const ctx = c.getContext('2d');
        let W, H, pts, id;
        // Fewer particles on touch/mobile — massive perf gain
        const isTouch = window.matchMedia('(pointer: coarse)').matches;
        const N = isTouch ? 25 : 40;   // was 70
        const D = isTouch ? 0 : 120;  // no lines on mobile
        const resize = () => { W = c.width = innerWidth; H = c.height = innerHeight; };
        resize(); window.addEventListener('resize', resize, { passive: true });
        pts = Array.from({ length: N }, () => ({
            x: Math.random() * W, y: Math.random() * H,
            vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
            r: Math.random() * 1.4 + .5, a: Math.random() * .3 + .08,
        }));
        let mx = -1e4, my = -1e4, needMouse = false;
        const mv = e => { mx = e.clientX; my = e.clientY; needMouse = true; };
        window.addEventListener('mousemove', mv, { passive: true });
        let frame = 0;
        const tick = () => {
            frame++;
            ctx.clearRect(0, 0, W, H);
            pts.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0 || p.x > W) p.vx *= -1;
                if (p.y < 0 || p.y > H) p.vy *= -1;
                if (needMouse) {
                    const dx = p.x - mx, dy = p.y - my;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < 8100) { const dm = Math.sqrt(d2); p.x += dx / dm * 1.1; p.y += dy / dm * 1.1; }
                }
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(110,100,255,${p.a})`; ctx.fill();
            });
            needMouse = false;
            // Lines every 2nd frame, desktop only
            if (D > 0 && frame % 2 === 0) {
                for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
                    const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < D * D) {
                        const d = Math.sqrt(d2);
                        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
                        ctx.strokeStyle = `rgba(100,90,240,${(1 - d / D) * .09})`; ctx.lineWidth = .6; ctx.stroke();
                    }
                }
            }
            id = requestAnimationFrame(tick);
        };
        tick();
        return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', mv); };
    }, []);
    return <canvas id="lp-canvas" ref={ref} />;
}

/* ── Hooks ── */
function useScroll() {
    useEffect(() => {
        const nav = document.querySelector('.lp-nav');
        const h = () => nav?.classList.toggle('scrolled', scrollY > 30);
        window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h);
    }, []);
}
function useReveal() {
    useEffect(() => {
        const els = document.querySelectorAll('.rv');
        const obs = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('in')), { threshold: .1, rootMargin: '0px 0px -50px 0px' });
        els.forEach(e => obs.observe(e)); return () => obs.disconnect();
    }, []);
}
function useTilt(ref) {
    useEffect(() => {
        if (window.matchMedia('(pointer: coarse)').matches) return; // skip on touch
        const el = ref.current; if (!el) return;
        let rafId;
        const mv = e => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const cx = innerWidth / 2, cy = innerHeight / 2;
                el.style.transform = `rotateX(${16 - (e.clientY - cy) / cy * 6}deg) rotateY(${-2 + (e.clientX - cx) / cx * 5}deg)`;
            });
        };
        const out = () => { cancelAnimationFrame(rafId); el.style.transform = 'rotateX(16deg) rotateY(-2deg)'; };
        window.addEventListener('mousemove', mv, { passive: true });
        el.closest('.lp-scene')?.addEventListener('mouseleave', out);
        return () => { cancelAnimationFrame(rafId); window.removeEventListener('mousemove', mv); };
    }, [ref]);
}
function useBentoTilt() {
    useEffect(() => {
        if (window.matchMedia('(pointer: coarse)').matches) return; // skip on touch
        const cards = Array.from(document.querySelectorAll('.lp-bcard'));
        const handlers = [];
        cards.forEach(c => {
            let rafId;
            const mv = e => {
                cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    const r = c.getBoundingClientRect();
                    const x = ((e.clientX - r.left) / r.width - .5) * 12;
                    const y = -((e.clientY - r.top) / r.height - .5) * 12;
                    c.style.transform = `perspective(900px) rotateX(${y}deg) rotateY(${x}deg) translateY(-4px)`;
                });
            };
            const out = () => { cancelAnimationFrame(rafId); c.style.transform = ''; };
            c.addEventListener('mousemove', mv); c.addEventListener('mouseleave', out);
            handlers.push({ c, mv, out });
        });
        return () => handlers.forEach(({ c, mv, out }) => { c.removeEventListener('mousemove', mv); c.removeEventListener('mouseleave', out); });
    }, []);
}

/* ── Data ── */
const FEATURES = [
    { icon: '🤖', color: 'rgba(99,102,241,.15)', ic: '#6366f1', title: 'Gemini AI Analysis', desc: 'Automatic summaries, action items, risks, blockers, and decisions extracted by Gemini 2.0 Flash right after every meeting.' },
    { icon: '📹', color: 'rgba(34,211,238,.12)', ic: '#22d3ee', title: 'WebRTC HD Video', desc: 'Peer-to-peer video with adaptive bitrate, TURN relay fallback, screen sharing, and up to 50 concurrent participants.' },
    { icon: '🎙️', color: 'rgba(139,92,246,.12)', ic: '#8b5cf6', title: 'Live Transcription', desc: 'Real-time captions using Web Speech API. Every word is timestamped and stored for searchable history.', wide: true },
    { icon: '✅', color: 'rgba(52,211,153,.12)', ic: '#34d399', title: 'Auto Task Export', desc: 'Action items become GitHub Issues or Jira tickets — with owner, deadline, and meeting context auto-filled.' },
    { icon: '🔍', color: 'rgba(251,191,36,.1)', ic: '#fbbf24', title: 'RAG Knowledge Search', desc: 'Ask anything about past meetings in natural language. Vector search retrieves the exact segment with full context.' },
    { icon: '🎨', color: 'rgba(244,114,182,.12)', ic: '#f472b6', title: 'Collaborative Whiteboard', desc: 'Real-time canvas synced via WebSocket. Draw, annotate, add sticky notes — all participants see changes instantly.' },
    { icon: '📊', color: 'rgba(99,102,241,.12)', ic: '#818cf8', title: 'Live Polls & Q&A', desc: 'Engage your audience mid-meeting with instant polls, audience upvoted Q&A, and emoji reactions.' },
];

const STEPS = [
    { n: '01', title: 'Create a Room', desc: 'Start an instant meeting — share the code and password with your team via Slack or calendar.' },
    { n: '02', title: 'Collaborate', desc: 'HD video, chat, whiteboard, screen share, polls — everything in one premium meeting room.' },
    { n: '03', title: 'AI Analyzes', desc: 'Gemini reads the transcript and generates summaries, insights, and action items automatically.' },
    { n: '04', title: 'Ship It', desc: 'Tasks push to GitHub or Jira. Query past meetings by asking questions in plain English.' },
];



export default function LandingPage() {
    const heroRef = useRef(null);
    useScroll(); useReveal(); useTilt(heroRef); useBentoTilt();

    return (
        <div className="lp-root" style={{ background: '#030509', minHeight: '100vh' }}>
            <Particles />

            {/* NAV */}
            <nav className="lp-nav">
                <Link to="/" className="lp-logo">
                    <span className="lp-logo-icon">🧠</span>
                    MeetingAI
                </Link>
                <ul className="lp-nav-links">
                    <li><a href="#features">Features</a></li>
                    <li><a href="#how">How it works</a></li>
                </ul>
                <div className="lp-nav-cta">
                    <Link to="/login" className="lpb lpb-ghost">Sign in</Link>
                    <Link to="/register" className="lpb lpb-primary">Get started free →</Link>
                </div>
            </nav>

            {/* HERO */}
            <section className="lp-hero">
                <div className="lp-floor" />
                <div className="lp-orbs">
                    <div className="lp-orb lp-orb-a" /><div className="lp-orb lp-orb-b" />
                    <div className="lp-orb lp-orb-c" /><div className="lp-orb lp-orb-d" />
                </div>

                <div className="lp-badge">
                    <span className="lp-badge-live">LIVE</span>
                    Powered by Gemini 2.0 Flash · WebRTC · Vector Search
                </div>

                <h1 className="lp-h1">
                    Meetings that<br />
                    <em>think for you.</em>
                </h1>
                <p className="lp-sub">
                    AI-powered video conferencing with real-time transcription, automated summaries, smart task creation, and RAG knowledge retrieval — so your team can focus on building.
                </p>
                <div className="lp-cta-row">
                    <Link to="/register" className="lpb lpb-primary lpb-lg">Start free — no credit card</Link>
                    <Link to="/login" className="lpb lpb-outline lpb-lg">▶ Watch demo</Link>
                </div>
                <p className="lp-cta-hint">Free plan · No credit card required · Setup in 60 seconds</p>

                {/* 3D MOCKUP */}
                <div className="lp-scene">
                    {/* Chip A */}
                    <div className="lp-chip chip-a">
                        <div className="lp-chip-row">
                            <div className="lp-chip-icon" style={{ background: 'rgba(99,102,241,.15)' }}>🤖</div>
                            <div>
                                <div className="lp-chip-title">AI summary ready</div>
                                <div className="lp-chip-sub">4 actions · 2 decisions · just now</div>
                            </div>
                        </div>
                    </div>
                    {/* Chip B */}
                    <div className="lp-chip chip-b">
                        <div className="lp-chip-row">
                            <div className="lp-chip-icon" style={{ background: 'rgba(52,211,153,.15)' }}>✅</div>
                            <div>
                                <div className="lp-chip-title">3 tasks → GitHub</div>
                                <div className="lp-chip-sub">Issues created · just now</div>
                            </div>
                        </div>
                    </div>

                    <div className="lp-card-3d" ref={heroRef}>
                        <div className="lp-screen">
                            <div className="lp-chrome">
                                <div className="lp-dots">
                                    <div className="lp-dot" /><div className="lp-dot" /><div className="lp-dot" />
                                </div>
                                <div className="lp-url">app.meetingai.io/meetings/room/3f8d2a1b</div>
                            </div>
                            <div className="lp-room">
                                <div className="lp-videos">
                                    <div className="lp-tile t1 speaking">
                                        <div className="lp-av" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>AJ</div>
                                        <div className="lp-tile-name"><span className="lp-mic"><Mic size={10} /></span>Ajay (You)</div>
                                        <div className="lp-wave">
                                            <div className="lp-wb" /><div className="lp-wb" /><div className="lp-wb" /><div className="lp-wb" /><div className="lp-wb" />
                                        </div>
                                    </div>
                                    <div className="lp-tile t2">
                                        <div className="lp-av" style={{ background: 'linear-gradient(135deg,#22d3ee,#3b82f6)' }}>SR</div>
                                        <div className="lp-tile-name">Sarah</div>
                                    </div>
                                    <div className="lp-tile t3">
                                        <div className="lp-av" style={{ background: 'linear-gradient(135deg,#f472b6,#8b5cf6)' }}>MK</div>
                                        <div className="lp-tile-name">Michael</div>
                                    </div>
                                    <div className="lp-tile t4">
                                        <div className="lp-av" style={{ background: 'linear-gradient(135deg,#34d399,#22d3ee)' }}>PL</div>
                                        <div className="lp-tile-name">Priya</div>
                                    </div>
                                    <div className="lp-tile t5">
                                        <div className="lp-av" style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }}>JW</div>
                                        <div className="lp-tile-name">James</div>
                                    </div>
                                </div>
                                <div className="lp-sidebar">
                                    <div className="lp-sb-head">AI Live Insights</div>
                                    <div className="lp-acard ac-green">
                                        <span className="lp-atag">Action ⚡</span>
                                        <strong>Ship auth v2</strong> by Friday — Sarah
                                    </div>
                                    <div className="lp-acard ac-amber">
                                        <span className="lp-atag">Risk ⚠️</span>
                                        Pricing not finalized. Blocker for Q2 launch.
                                    </div>
                                    <div className="lp-acard ac-blue">
                                        <span className="lp-atag">Decision ✓</span>
                                        Release <strong>v2.0</strong> end of March
                                    </div>
                                    <div className="lp-acard ac-green">
                                        <span className="lp-atag">Action ⚡</span>
                                        <strong>Michael</strong>: close PR #142 today
                                    </div>
                                    <div className="lp-ticker">
                                        <div style={{ fontSize: '.52rem', color: '#3a5068', marginBottom: 3 }}>LIVE TRANSCRIPT</div>
                                        <div className="lp-ticker-text">"...the API gateway handles retry logic, circuit breaker in next sprint..."</div>
                                    </div>
                                </div>
                                <div className="lp-controls">
                                    {[<Mic size={14} />, <Video size={14} />, <Monitor size={14} />, <Hand size={14} />, <MessageSquare size={14} />, <Smile size={14} />, <Settings size={14} />].map((ic, i) => (
                                        <div key={i} className="lp-ctrl">{ic}</div>
                                    ))}
                                    <div className="lp-ctrl lp-ctrl-red"><PhoneOff size={14} /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* STATS */}
            <div className="lp-stats">
                {[
                    { n: '50K+', l: 'Meetings Analyzed' },
                    { n: '98%', l: 'Transcription Accuracy' },
                    { n: '3.2×', l: 'Faster Follow-ups' },
                    { n: '12min', l: 'Saved Per Meeting' },
                ].map(s => (
                    <div key={s.l} className="lp-stat rv">
                        <div className="lp-stat-n">{s.n}</div>
                        <div className="lp-stat-l">{s.l}</div>
                    </div>
                ))}
            </div>

            {/* FEATURES */}
            <section id="features" className="lp-section">
                <div className="rv">
                    <div className="lp-eyebrow">Features</div>
                    <h2 className="lp-sec-title">Everything in one<br /><em style={{ fontStyle: 'normal', background: 'linear-gradient(135deg,#6366f1,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>intelligent workspace</em></h2>
                    <p className="lp-sec-sub">We obsessed over every detail so your team doesn't have to. From WebRTC to vector search — it just works.</p>
                </div>
                <div className="lp-bento">
                    {FEATURES.map((f, i) => (
                        <div key={f.title} className={`lp-bcard rv d${(i % 4) + 1}${f.wide ? ' w2' : ''}`}>
                            <div className="lp-bcard-icon" style={{ background: f.color, color: f.ic }}>{f.icon}</div>
                            <div className="lp-bcard-title">{f.title}</div>
                            <div className="lp-bcard-desc">{f.desc}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section id="how" style={{ borderTop: '1px solid rgba(255,255,255,.04)', background: 'rgba(4,7,16,.55)', position: 'relative', zIndex: 2 }}>
                <div className="lp-section" style={{ textAlign: 'center' }}>
                    <div className="rv">
                        <div className="lp-eyebrow" style={{ justifyContent: 'center' }}>How it works</div>
                        <h2 className="lp-sec-title">Up and running in 60 seconds</h2>
                        <p className="lp-sec-sub" style={{ margin: '0 auto' }}>No complex integrations, no IT tickets. Create a room and let the AI do its thing.</p>
                    </div>
                    <div className="lp-howgrid">
                        {STEPS.map((s, i) => (
                            <div key={s.n} className={`lp-step rv d${i + 1}`}>
                                <div className="lp-step-n">{s.n}</div>
                                <div className="lp-step-title">{s.title}</div>
                                <div className="lp-step-desc">{s.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>



            {/* CTA */}
            <div className="lp-cta">
                <div className="lp-cta-glow" />
                <h2 className="lp-cta-h rv">
                    Stop wasting time.<br />
                    <span style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                        Make every meeting matter.
                    </span>
                </h2>
                <p className="lp-cta-sub rv d1">Join thousands of teams who run faster, smarter meetings with MeetingAI.</p>
                <div className="lp-cta-btns rv d2">
                    <Link to="/register" className="lpb lpb-primary lpb-lg">Create free account →</Link>
                    <Link to="/login" className="lpb lpb-outline lpb-lg">Sign in</Link>
                </div>
            </div>

            {/* FOOTER */}
            <footer className="lp-footer">
                <div className="lp-footer-top">
                    <div className="lp-footer-brand">
                        <div className="lp-logo" style={{ textDecoration: 'none' }}>
                            <span className="lp-logo-icon">🧠</span>MeetingAI
                        </div>
                        <p>AI-powered meeting intelligence for modern engineering teams. Powered by Gemini 2.0, WebRTC, and vector search.</p>
                    </div>
                    <div className="lp-footer-col">
                        <h5>Product</h5>
                        <ul>
                            <li><a href="#features">Features</a></li>
                            <li><a href="#how">How it works</a></li>
                            <li><Link to="/register">Get started</Link></li>
                        </ul>
                    </div>
                    <div className="lp-footer-col">
                        <h5>Developers</h5>
                        <ul>
                            <li><a href="/docs">API Docs</a></li>
                            <li><a href="#">GitHub</a></li>
                            <li><a href="#">Changelog</a></li>
                        </ul>
                    </div>
                    <div className="lp-footer-col">
                        <h5>Legal</h5>
                        <ul>
                            <li><a href="#">Privacy</a></li>
                            <li><a href="#">Terms</a></li>
                            <li><a href="#">Security</a></li>
                        </ul>
                    </div>
                </div>
                <div className="lp-footer-bottom">
                    <span>© 2026 MeetingAI. All rights reserved.</span>
                    <span>Built with ❤️ + Gemini AI</span>
                </div>
            </footer>
        </div>
    );
}
