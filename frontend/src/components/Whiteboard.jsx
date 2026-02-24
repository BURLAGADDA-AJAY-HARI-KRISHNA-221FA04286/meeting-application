import { useRef, useState, useEffect, useCallback } from 'react';
import { Eraser, Pen, Trash2, Share2 } from 'lucide-react';

export default function Whiteboard({ ws, isActive }) {
    const canvasRef = useRef(null);
    const drawingStateRef = useRef({ isDrawing: false, lastPoint: null });
    const [color, setColor] = useState('#000000');
    const [lineWidth, setLineWidth] = useState(3);
    const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
    const strokeHistoryRef = useRef([]); // Store all strokes for replay

    // Setup canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resizeCanvas = () => {
            const parent = canvas.parentElement;
            if (!parent) return;
            const prevData = canvas.toDataURL();
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
            // Replay all strokes after resize
            replayStrokes();
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    // Replay all recorded strokes (after resize or initial sync)
    const replayStrokes = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const stroke of strokeHistoryRef.current) {
            if (stroke.points.length < 2) continue;
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = stroke.width;
            ctx.beginPath();
            const first = stroke.points[0];
            ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
            for (let i = 1; i < stroke.points.length; i++) {
                const p = stroke.points[i];
                ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
            }
            ctx.stroke();
        }
    }, []);

    // Listen for incoming whiteboard events from other participants
    useEffect(() => {
        if (!ws) return;

        const handleMessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type !== 'WHITEBOARD') return;

                const { action, data } = message;

                if (action === 'draw') {
                    // Remote stroke data: add to history and render
                    if (data.stroke) {
                        strokeHistoryRef.current.push(data.stroke);
                        renderStroke(data.stroke);
                    }
                } else if (action === 'clear') {
                    strokeHistoryRef.current = [];
                    const canvas = canvasRef.current;
                    if (canvas) {
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                }
            } catch (e) {
                // Not a JSON message or not for us
            }
        };

        ws.addEventListener('message', handleMessage);
        return () => ws.removeEventListener('message', handleMessage);
    }, [ws]);

    // Render a single stroke on the canvas
    const renderStroke = useCallback((stroke) => {
        const canvas = canvasRef.current;
        if (!canvas || !stroke.points || stroke.points.length < 2) return;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const first = stroke.points[0];
        ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
        for (let i = 1; i < stroke.points.length; i++) {
            const p = stroke.points[i];
            ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
        }
        ctx.stroke();
    }, []);

    // Convert pixel coordinates to normalized (0-1) coordinates
    const getNormalizedCoords = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        let clientX, clientY;
        if (e.touches && e.touches[0]) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) / canvas.width,
            y: (clientY - rect.top) / canvas.height,
        };
    };

    // Current stroke being drawn
    const currentStrokeRef = useRef(null);

    const startDrawing = (e) => {
        e.preventDefault();
        const { x, y } = getNormalizedCoords(e);
        const strokeColor = tool === 'eraser' ? '#ffffff' : color;

        currentStrokeRef.current = {
            color: strokeColor,
            width: tool === 'eraser' ? lineWidth * 3 : lineWidth,
            points: [{ x, y }],
        };
        drawingStateRef.current.isDrawing = true;

        // Start path on canvas
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = tool === 'eraser' ? lineWidth * 3 : lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(x * canvas.width, y * canvas.height);
        }
    };

    const draw = (e) => {
        if (!drawingStateRef.current.isDrawing || !currentStrokeRef.current) return;
        e.preventDefault();
        const { x, y } = getNormalizedCoords(e);
        currentStrokeRef.current.points.push({ x, y });

        // Draw on local canvas
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.lineTo(x * canvas.width, y * canvas.height);
            ctx.stroke();
        }
    };

    const stopDrawing = () => {
        if (!drawingStateRef.current.isDrawing) return;
        drawingStateRef.current.isDrawing = false;

        const stroke = currentStrokeRef.current;
        if (stroke && stroke.points.length >= 2) {
            // Save to local history
            strokeHistoryRef.current.push(stroke);

            // Broadcast to other participants
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'WHITEBOARD',
                    action: 'draw',
                    data: { stroke },
                }));
            }
        }
        currentStrokeRef.current = null;
    };

    const clearCanvas = () => {
        strokeHistoryRef.current = [];
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Broadcast clear to all participants
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'WHITEBOARD',
                action: 'clear',
                data: {},
            }));
        }
    };

    return (
        <div className="whiteboard-container" style={{ width: '100%', height: '100%', position: 'relative', background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
            <div className="whiteboard-toolbar" style={{
                position: 'absolute', top: 12, left: 12, right: 12,
                background: 'rgba(255,255,255,0.95)', padding: '8px 12px', borderRadius: '8px',
                display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 10, flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button className={`btn btn-sm ${tool === 'pen' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTool('pen')}>
                        <Pen size={16} />
                    </button>
                    <button className={`btn btn-sm ${tool === 'eraser' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTool('eraser')}>
                        <Eraser size={16} />
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={clearCanvas} title="Clear Board">
                        <Trash2 size={16} color="#ef4444" />
                    </button>
                </div>
                <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                    {['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'].map(c => (
                        <button
                            key={c}
                            onClick={() => { setColor(c); setTool('pen'); }}
                            style={{
                                width: 22, height: 22, borderRadius: '50%', background: c,
                                border: color === c && tool === 'pen' ? '2px solid #6366f1' : '1px solid #ddd',
                                cursor: 'pointer', transition: 'transform 0.15s',
                                transform: color === c && tool === 'pen' ? 'scale(1.2)' : 'scale(1)',
                            }}
                        />
                    ))}
                </div>
                <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />
                <input
                    type="range"
                    min="1"
                    max="20"
                    value={lineWidth}
                    onChange={(e) => setLineWidth(parseInt(e.target.value))}
                    style={{ width: 80 }}
                />
                <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{lineWidth}px</span>
                {ws && (
                    <>
                        <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#10b981' }}>
                            <Share2 size={12} />
                            <span>Shared</span>
                        </div>
                    </>
                )}
            </div>

            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ touchAction: 'none', cursor: 'crosshair', width: '100%', height: '100%' }}
            />
        </div>
    );
}
