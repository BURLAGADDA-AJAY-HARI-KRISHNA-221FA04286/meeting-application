/**
 * Safe download utility that bypasses Windows SmartScreen/Defender
 * by using data URIs for text and appending to DOM for binary files.
 * 
 * Windows SmartScreen blocks blob: URLs from localhost because they
 * have no Zone Identifier. Data URIs don't have this problem for text.
 */

/**
 * Download text content as a file (TXT, ICS, JSON, CSV, etc.)
 * Uses data URI approach to bypass Windows SmartScreen
 */
export function downloadTextFile(content, filename, mimeType = 'text/plain') {
    // Encode to base64 for data URI
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const dataUri = `data:${mimeType};base64,${encoded}`;

    const link = document.createElement('a');
    link.href = dataUri;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    // Small delay before cleanup to ensure download starts
    setTimeout(() => {
        document.body.removeChild(link);
    }, 200);
}

/**
 * Download binary content (Blob) as file.
 * Appends to DOM and uses timeout to avoid SmartScreen issues.
 */
export function downloadBlobFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);

    // Click with a small delay
    setTimeout(() => {
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 500);
    }, 100);
}

/**
 * Download canvas content as PNG (uses data URL)
 */
export function downloadCanvas(canvas, filename) {
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 200);
}

/**
 * Generate a formatted meeting report as text
 */
export function generateMeetingReport(meeting, analysis) {
    const lines = [];
    const divider = '═'.repeat(60);

    lines.push(divider);
    lines.push(`  MEETING REPORT: ${meeting?.title || 'Untitled Meeting'}`);
    lines.push(divider);
    lines.push('');
    lines.push(`Date: ${new Date(meeting?.created_at).toLocaleString()}`);
    lines.push(`Report Generated: ${new Date().toLocaleString()}`);
    lines.push('');

    if (analysis) {
        // Executive Summary
        const summary = analysis.summary;
        if (summary) {
            lines.push('─'.repeat(40));
            lines.push('📋 EXECUTIVE SUMMARY');
            lines.push('─'.repeat(40));
            if (typeof summary === 'string') {
                lines.push(summary);
            } else if (typeof summary === 'object') {
                const text = summary.executive_summary || summary.summary || summary.text || summary.overview;
                if (text) lines.push(text);

                // Key Points
                const keyPoints = summary.key_points || summary.topics_discussed || [];
                if (keyPoints.length > 0) {
                    lines.push('');
                    lines.push('🔑 KEY POINTS:');
                    keyPoints.forEach((p, i) => {
                        const txt = typeof p === 'string' ? p : (p.point || p.text || JSON.stringify(p));
                        lines.push(`  ${i + 1}. ${txt}`);
                    });
                }

                // Key Decisions
                const decisions = summary.key_decisions || summary.decisions || [];
                if (decisions.length > 0) {
                    lines.push('');
                    lines.push('✅ KEY DECISIONS:');
                    decisions.forEach((d, i) => {
                        const txt = typeof d === 'string' ? d : (d.decision || d.text || JSON.stringify(d));
                        lines.push(`  ${i + 1}. ${txt}`);
                    });
                }
            }
            lines.push('');
        }

        // Decisions
        if (analysis.decisions) {
            const decs = Array.isArray(analysis.decisions) ? analysis.decisions :
                (typeof analysis.decisions === 'object' ?
                    Object.values(analysis.decisions).find(v => Array.isArray(v)) || [] : []);
            if (decs.length > 0) {
                lines.push('─'.repeat(40));
                lines.push('📌 DECISIONS');
                lines.push('─'.repeat(40));
                decs.forEach((d, i) => {
                    const txt = typeof d === 'string' ? d : (d.decision || d.text || JSON.stringify(d));
                    lines.push(`  ${i + 1}. ${txt}`);
                });
                lines.push('');
            }
        }

        // Action Items
        if (analysis.actions) {
            const acts = Array.isArray(analysis.actions) ? analysis.actions :
                (typeof analysis.actions === 'object' ?
                    Object.values(analysis.actions).find(v => Array.isArray(v)) || [] : []);
            if (acts.length > 0) {
                lines.push('─'.repeat(40));
                lines.push('📝 ACTION ITEMS');
                lines.push('─'.repeat(40));
                acts.forEach((a, i) => {
                    if (typeof a === 'string') {
                        lines.push(`  ${i + 1}. ${a}`);
                    } else {
                        lines.push(`  ${i + 1}. ${a.action || a.task || a.text || JSON.stringify(a)}`);
                        if (a.assignee) lines.push(`     Assigned to: ${a.assignee}`);
                        if (a.deadline || a.due_date) lines.push(`     Deadline: ${a.deadline || a.due_date}`);
                        if (a.priority) lines.push(`     Priority: ${a.priority}`);
                    }
                });
                lines.push('');
            }
        }

        // Risks
        if (analysis.risks) {
            const risks = Array.isArray(analysis.risks) ? analysis.risks :
                (typeof analysis.risks === 'object' ?
                    Object.values(analysis.risks).find(v => Array.isArray(v)) || [] : []);
            if (risks.length > 0) {
                lines.push('─'.repeat(40));
                lines.push('⚠️ RISKS & CONCERNS');
                lines.push('─'.repeat(40));
                risks.forEach((r, i) => {
                    const txt = typeof r === 'string' ? r : (r.risk || r.text || r.description || JSON.stringify(r));
                    lines.push(`  ${i + 1}. ${txt}`);
                    if (r.impact) lines.push(`     Impact: ${r.impact}`);
                    if (r.mitigation) lines.push(`     Mitigation: ${r.mitigation}`);
                });
                lines.push('');
            }
        }

        // Sentiment
        if (analysis.sentiment) {
            lines.push('─'.repeat(40));
            lines.push('📊 SENTIMENT ANALYSIS');
            lines.push('─'.repeat(40));
            if (typeof analysis.sentiment === 'string') {
                lines.push(analysis.sentiment);
            } else {
                const s = analysis.sentiment;
                if (s.overall) lines.push(`  Overall: ${s.overall}`);
                if (s.tone) lines.push(`  Tone: ${s.tone}`);
                if (s.score !== undefined) lines.push(`  Score: ${s.score}`);
                if (s.summary) lines.push(`  ${s.summary}`);
            }
            lines.push('');
        }
    }

    // Transcript
    if (meeting?.transcript) {
        lines.push('─'.repeat(40));
        lines.push('📄 TRANSCRIPT');
        lines.push('─'.repeat(40));
        lines.push(meeting.transcript);
        lines.push('');
    }

    lines.push(divider);
    lines.push('  Generated by MeetingAI Intelligence Platform');
    lines.push(divider);

    return lines.join('\n');
}
