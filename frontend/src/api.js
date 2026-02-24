import axios from 'axios';

const API_BASE = 'http://localhost:8000/api/v1';

export const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                try {
                    const res = await axios.post(`${API_BASE}/refresh`, { refresh_token: refreshToken });
                    localStorage.setItem('access_token', res.data.access_token);
                    localStorage.setItem('refresh_token', res.data.refresh_token);
                    originalRequest.headers.Authorization = `Bearer ${res.data.access_token}`;
                    return api(originalRequest);
                } catch {
                    localStorage.clear();
                    window.location.href = '/login';
                }
            } else {
                localStorage.clear();
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// ── Simple in-memory cache for GET requests ──
const _cache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

function cachedGet(url, params, ttl = CACHE_TTL) {
    const key = url + (params ? JSON.stringify(params) : '');
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.time < ttl) {
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

// ── Auth ──
export const authAPI = {
    register: (data) => api.post('/register', data),
    login: (data) => api.post('/login', data),
    getMe: () => api.get('/me'),
    updateProfile: (data) => api.patch('/me', data),
    changePassword: (data) => api.post('/me/change-password', data),
};

// ── Meetings ──
export const meetingsAPI = {
    list: (params = {}) => cachedGet('/meetings', Object.keys(params).length ? params : null),
    get: (id) => api.get(`/meetings/${id}`),
    create: (data) => api.post('/meetings', data).then(r => { invalidateCache('/meetings'); return r; }),
    update: (id, data) => api.patch(`/meetings/${id}`, data).then(r => { invalidateCache('/meetings'); return r; }),
    delete: (id) => api.delete(`/meetings/${id}`).then(r => { invalidateCache('/meetings'); return r; }),
    dashboard: () => cachedGet('/meetings/dashboard'),
    uploadMedia: (file, title = '', autoAnalyze = true) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('auto_analyze', autoAnalyze);
        return api.post('/meetings/upload-media', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000, // 5 min timeout for large files
        });
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
    list: () => api.get('/tasks'),
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

// ── WebSocket helper ──
export function createMeetingWebSocket(meetingId) {
    const token = localStorage.getItem('access_token');
    const wsBase = API_BASE.replace('http', 'ws');
    return new WebSocket(`${wsBase}/ws/meeting/${meetingId}?token=${token}`);
}

// ── Video Meeting ──
export const videoMeetingAPI = {
    createRoom: (title) => api.post('/video-meeting/create', null, { params: { title } }),
    joinRoom: (meeting_code, password) => api.post('/video-meeting/join', { meeting_code, password }),
    getRoomInfo: (roomId) => api.get(`/video-meeting/${roomId}/info`),
    saveTranscript: (roomId, data) => api.post(`/video-meeting/${roomId}/save-transcript`, data),
};

export function createVideoMeetingWebSocket(roomId, userId, displayName) {
    const wsBase = API_BASE.replace('http', 'ws');
    const params = new URLSearchParams({ user_id: userId, display_name: displayName });
    return new WebSocket(`${wsBase}/video-meeting/ws/${roomId}?${params}`);
}

export default api;
