/**
 * Bulletproof download utility.
 * 
 * Primary:  showSaveFilePicker (native Save-As dialog — guaranteed filename)
 * Fallback: blob + anchor.download (for browsers without File System Access API)
 */

// Map of extensions to MIME accept types for showSaveFilePicker
const EXT_MAP = {
    '.txt': { 'text/plain': ['.txt'] },
    '.ics': { 'text/calendar': ['.ics'] },
    '.json': { 'application/json': ['.json'] },
    '.csv': { 'text/csv': ['.csv'] },
    '.webm': { 'video/webm': ['.webm'] },
    '.mp4': { 'video/mp4': ['.mp4'] },
    '.png': { 'image/png': ['.png'] },
};

function getExt(filename) {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot) : '.txt';
}

function normalizeFilename(filename, fallback = 'download.txt') {
    const base = (filename || '').trim();
    const withoutControls = Array.from(base, (ch) => (ch.charCodeAt(0) < 32 ? '_' : ch)).join('');
    const cleaned = withoutControls
        .trim()
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/^\.+/, '')
        .trim();
    if (!cleaned) return fallback;
    return cleaned.slice(0, 180);
}

/**
 * Save a Blob to disk. Uses showSaveFilePicker if available,
 * otherwise falls back to anchor.download.
 */
export async function saveAs(blob, filename) {
    const safeFilename = normalizeFilename(filename);

    // Strategy 1: File System Access API (native Save-As dialog)
    if (window.showSaveFilePicker) {
        try {
            const ext = getExt(safeFilename);
            const accept = EXT_MAP[ext] || { 'application/octet-stream': [ext] };
            const handle = await window.showSaveFilePicker({
                suggestedName: safeFilename,
                types: [{ description: 'File', accept }],
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        } catch (err) {
            if (err.name === 'AbortError') return false; // user cancelled
            console.warn('showSaveFilePicker failed, using fallback:', err);
        }
    }

    // Strategy 2: Blob URL + anchor.download (fallback)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 3000);
    return true;
}

/** Save text content as a file */
export async function downloadTextFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    return saveAs(blob, filename);
}

/** Save a Blob (recordings, binary) */
export async function downloadBlobFile(blob, filename) {
    return saveAs(blob, filename);
}

/** Save canvas as PNG */
export function downloadCanvas(canvas, filename) {
    canvas.toBlob(async (blob) => {
        if (blob) await saveAs(blob, filename);
    }, 'image/png');
}
