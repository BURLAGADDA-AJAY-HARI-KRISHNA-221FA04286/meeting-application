/**
 * Download utility — uses multiple strategies to ensure files 
 * actually save on Windows (bypasses SmartScreen/Defender issues).
 * 
 * Strategy order:
 * 1. navigator.msSaveOrOpenBlob (legacy Edge — most reliable on Windows)
 * 2. Blob with anchor click + forced DOM attachment
 * 3. Data URI fallback
 */

/**
 * Core download function that tries multiple approaches
 */
function triggerDownload(blob, filename) {
    // Strategy 1: msSaveOrOpenBlob (works reliably on Windows Edge legacy)
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, filename);
        return;
    }

    // Strategy 2: Create object URL, attach to visible (but off-screen) anchor
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    // Make it "real" in the DOM rather than display:none
    link.style.position = 'fixed';
    link.style.left = '-9999px';
    link.style.top = '-9999px';
    link.style.opacity = '0';
    document.body.appendChild(link);

    // Use a microtask delay to let the browser register the link
    requestAnimationFrame(() => {
        link.click();
        // Cleanup after a generous delay
        setTimeout(() => {
            try { document.body.removeChild(link); } catch (e) { /* already removed */ }
            URL.revokeObjectURL(url);
        }, 5000);
    });
}

/**
 * Download text content as a file (TXT, ICS, JSON, CSV, etc.)
 */
export function downloadTextFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    triggerDownload(blob, filename);
}

/**
 * Download binary content (Blob) as file.
 */
export function downloadBlobFile(blob, filename) {
    triggerDownload(blob, filename);
}

/**
 * Download canvas content as PNG
 */
export function downloadCanvas(canvas, filename) {
    canvas.toBlob((blob) => {
        if (blob) {
            triggerDownload(blob, filename);
        }
    }, 'image/png');
}

/**
 * Download a file from a URL by fetching it and triggering save.
 * Use this for server-side download endpoints.
 */
export async function downloadFromUrl(url, fallbackFilename = 'download.txt', headers = {}) {
    try {
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Extract filename from Content-Disposition header if available
        const disposition = response.headers.get('Content-Disposition');
        let filename = fallbackFilename;
        if (disposition) {
            const match = disposition.match(/filename="?([^";\n]+)"?/);
            if (match) filename = match[1];
        }

        const blob = await response.blob();
        triggerDownload(blob, filename);
        return true;
    } catch (err) {
        console.error('Download failed:', err);
        // Fallback: open in new tab
        window.open(url, '_blank');
        return false;
    }
}
