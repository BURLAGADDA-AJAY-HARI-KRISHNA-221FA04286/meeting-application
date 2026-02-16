import axios from 'axios';

const API_BASE = 'http://localhost:8000/api/v1';

const api = axios.create({
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
    list: (params = {}) => api.get('/meetings', { params }),
    get: (id) => api.get(`/meetings/${id}`),
    create: (data) => api.post('/meetings', data),
    update: (id, data) => api.patch(`/meetings/${id}`, data),
    delete: (id) => api.delete(`/meetings/${id}`),
    dashboard: () => api.get('/meetings/dashboard'),
};

// ── AI ──
export const aiAPI = {
    analyze: (meetingId) => api.post(`/ai/${meetingId}/analyze`),
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
    exportTasks: (meetingId, repo, taskIds = null) =>
        api.post(`/meetings/${meetingId}/export-github`, { repo, task_ids: taskIds }),
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
    getRoomInfo: (roomId) => api.get(`/video-meeting/${roomId}/info`),
};

export function createVideoMeetingWebSocket(roomId, userId, displayName) {
    const wsBase = API_BASE.replace('http', 'ws');
    const params = new URLSearchParams({ user_id: userId, display_name: displayName });
    return new WebSocket(`${wsBase}/ws/video-meeting/${roomId}?${params}`);
}

export default api;
