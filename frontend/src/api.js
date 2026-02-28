import axios from 'axios';

const RAW_API_BASE = import.meta.env.VITE_API_BASE?.trim() || import.meta.env.VITE_API_URL?.trim();
const API_BASE = RAW_API_BASE || `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export function getAccessToken() {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveAuthTokens(accessToken, refreshToken) {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearAuthTokens() {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const originalRequest = error.config || {};
        const requestUrl = originalRequest.url || '';
        const isAuthEndpoint = requestUrl.includes('/login') || requestUrl.includes('/refresh');

        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
            originalRequest._retry = true;
            const refreshToken = getRefreshToken();
            if (refreshToken) {
                try {
                    const res = await axios.post(`${API_BASE}/refresh`, { refresh_token: refreshToken });
                    saveAuthTokens(res.data.access_token, res.data.refresh_token);
                    originalRequest.headers.Authorization = `Bearer ${res.data.access_token}`;
                    return api(originalRequest);
                } catch {
                    clearAuthTokens();
                    window.location.href = '/login';
                }
            } else {
                clearAuthTokens();
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// ── Stale-While-Revalidate cache for GET requests ──
const _cache = new Map();
const CACHE_TTL = 30_000; // 30s fresh window

/**
 * SWR cache: returns cached data instantly, refreshes in background if stale.
 * Fresh (< TTL): return cache, no fetch.
 * Stale (> TTL): return cache immediately + silent background refetch.
 * Empty: fetch normally.
 */
function cachedGet(url, params, ttl = CACHE_TTL) {
    const key = url + (params ? JSON.stringify(params) : '');
    const cached = _cache.get(key);
    const now = Date.now();

    if (cached) {
        if (now - cached.time < ttl) {
            return Promise.resolve(cached.data);
        }
        // Stale: return old data now, refresh silently in background
        api.get(url, params ? { params } : undefined)
            .then(res => { _cache.set(key, { data: res, time: Date.now() }); })
            .catch(() => { });
        return Promise.resolve(cached.data);
    }

    return api.get(url, params ? { params } : undefined).then(res => {
        _cache.set(key, { data: res, time: Date.now() });
        return res;
    });
}

function invalidateCache(prefix) {
    for (const key of _cache.keys()) {
        if (key.startsWith(prefix)) _cache.delete(key);
    }
}

function _sanitizeDownloadFilename(filename, fallbackName = 'download.txt') {
    const base = (filename || '').trim();
    const withoutControls = Array.from(base, (ch) => (ch.charCodeAt(0) < 32 ? '_' : ch)).join('');
    const cleaned = withoutControls
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+/, '');
    if (!cleaned) return fallbackName;
    return cleaned.slice(0, 180);
}

function _extractFilenameFromContentDisposition(disposition) {
    if (!disposition) return null;

    // RFC 5987 form: filename*=UTF-8''encoded%20name.txt
    const utfMatch = disposition.match(/filename\*\s*=\s*([^;]+)/i);
    if (utfMatch) {
        let value = utfMatch[1].trim().replace(/^"(.*)"$/, '$1');
        value = value.replace(/^UTF-8''/i, '');
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    // Basic form: filename="name.txt" or filename=name.txt
    const basicMatch =
        disposition.match(/filename\s*=\s*"([^"]+)"/i) ||
        disposition.match(/filename\s*=\s*([^;\n]+)/i);
    return basicMatch ? basicMatch[1].trim() : null;
}

// ── Auth ──
export const authAPI = {
    register: (data) => api.post('/register', data),
    login: (data) => api.post('/login', data),
    logout: (data) => api.post('/logout', data),
    forgotPassword: (data) => api.post('/forgot-password', data),
    resetPassword: (data) => api.post('/reset-password', data),
    getMe: () => api.get('/me'),
    updateProfile: (data) => api.patch('/me', data),
    changePassword: (data) => api.post('/me/change-password', data),
};

// ── Download helper: fetch → blob → saveAs (native Save-As dialog) ──
async function _fetchAndSave(url, fallbackName) {
    const { saveAs } = await import('./utils/download.js');
    const token = getAccessToken();
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const disp = res.headers.get('Content-Disposition') || '';
        const extracted = _extractFilenameFromContentDisposition(disp);
        const filename = _sanitizeDownloadFilename(extracted, fallbackName);
        const blob = await res.blob();
        await saveAs(blob, filename);
    } catch (err) {
        console.error('Download failed:', err);
        throw err;
    }
}

// ── Meetings ──
export const meetingsAPI = {
    list: (params = {}) => cachedGet('/meetings', Object.keys(params).length ? params : null),
    get: (id) => api.get(`/meetings/${id}`),
    create: (data) => api.post('/meetings', data).then(r => { invalidateCache('/meetings'); return r; }),
    update: (id, data) => api.patch(`/meetings/${id}`, data).then(r => { invalidateCache('/meetings'); return r; }),
    delete: (id) => api.delete(`/meetings/${id}`).then(r => { invalidateCache('/meetings'); return r; }),
    dashboard: () => cachedGet('/meetings/dashboard'),
    uploadMedia: (file, title = '', autoAnalyze = false) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('auto_analyze', autoAnalyze);
        return api.post('/meetings/upload-media', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000,
        });
    },
    // ── File Downloads (uses native Save-As dialog) ──
    downloadReport: (id) => _fetchAndSave(
        `${API_BASE}/meetings/${id}/download-report`,
        'meeting_report.txt'
    ),
    downloadTranscript: (id) => _fetchAndSave(
        `${API_BASE}/meetings/${id}/download-transcript`,
        'transcript.txt'
    ),
    // For client-side content (notes, ICS) — no server round-trip needed
    downloadClientFile: async (content, filename, mimeType = 'text/plain') => {
        const { saveAs } = await import('./utils/download.js');
        const blob = new Blob([content], { type: mimeType });
        await saveAs(blob, filename);
    },
};

// ── AI ──
export const aiAPI = {
    analyze: (meetingId, force = false) => api.post(`/ai/${meetingId}/analyze?force=${force}`),
    getResults: (meetingId) => api.get(`/ai/${meetingId}/results`),
    ragQuery: (meetingId, question) => api.post(`/ai/${meetingId}/rag-query`, { question }),
};

// ── Tasks ──
export const tasksAPI = {
    list: (params = {}) => api.get('/tasks', { params }),
    create: (data) => api.post('/tasks', data),
    generate: (meetingId) => api.post(`/meetings/${meetingId}/generate-tasks`),
    update: (taskId, data) => api.patch(`/tasks/${taskId}`, data),
    delete: (taskId) => api.delete(`/tasks/${taskId}`),
};

// ── GitHub Export ──
export const githubAPI = {
    exportTasks: (meetingId, repo, taskIds = null, token = null) =>
        api.post(`/meetings/${meetingId}/export-github`, { repo, task_ids: taskIds, token }),
};

export const jiraAPI = {
    exportTasks: (meetingId, payload) =>
        api.post(`/meetings/${meetingId}/export-jira`, payload),
};

// ── WebSocket helper ──
export function createMeetingWebSocket(meetingId) {
    const token = getAccessToken();
    if (!token) throw new Error('Authentication required for WebSocket connection');
    const wsBase = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://');
    return new WebSocket(`${wsBase}/ws/meeting/${meetingId}`, ['bearer', token]);
}

// ── Video Meeting ──
export const videoMeetingAPI = {
    createRoom: (title) => api.post('/video-meeting/create', null, { params: { title } }),
    joinRoom: (meeting_code, password) => api.post('/video-meeting/join', { meeting_code, password }),
    getRoomInfo: (roomId) => api.get(`/video-meeting/${roomId}/info`),
    saveTranscript: (roomId, data) => api.post(`/video-meeting/${roomId}/save-transcript`, data),
};

export function createVideoMeetingWebSocket(roomId, displayName) {
    const token = getAccessToken();
    if (!token) throw new Error('Authentication required for WebSocket connection');
    const wsBase = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://');
    const params = new URLSearchParams({ display_name: displayName || 'User' });
    return new WebSocket(`${wsBase}/video-meeting/ws/${roomId}?${params}`, ['bearer', token]);
}

export default api;
