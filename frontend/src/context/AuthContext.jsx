/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import {
    authAPI,
    getAccessToken,
    getRefreshToken,
    saveAuthTokens,
    clearAuthTokens
} from '../api';

const AuthContext = createContext(null);

const USER_CACHE_KEY = 'cached_user';

/** Restore user from sessionStorage instantly (< 1ms) */
function getCachedUser() {
    try {
        const raw = sessionStorage.getItem(USER_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function setCachedUser(user) {
    if (user) {
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
        sessionStorage.removeItem(USER_CACHE_KEY);
    }
}

export function AuthProvider({ children }) {
    // Instant restore: if we have a token + cached user, render immediately
    const hasToken = !!getAccessToken();
    const [user, setUser] = useState(() => hasToken ? getCachedUser() : null);
    // Only show loading if we have a token but NO cached user (first-ever login)
    const [loading, setLoading] = useState(hasToken && !getCachedUser());

    useEffect(() => {
        let mounted = true;

        const bootstrap = async () => {
            const token = getAccessToken();
            if (!token) {
                if (mounted) {
                    setUser(null);
                    setCachedUser(null);
                    setLoading(false);
                }
                return;
            }

            try {
                const res = await authAPI.getMe();
                if (mounted) {
                    setUser(res.data);
                    setCachedUser(res.data);
                }
            } catch {
                clearAuthTokens();
                setCachedUser(null);
                if (mounted) setUser(null);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        bootstrap();
        return () => { mounted = false; };
    }, []);

    const login = async (email, password) => {
        const res = await authAPI.login({ email, password });
        const data = res.data;
        saveAuthTokens(data.access_token, data.refresh_token);
        if (data.user) {
            setUser(data.user);
            setCachedUser(data.user);
        } else {
            const meRes = await authAPI.getMe();
            setUser(meRes.data);
            setCachedUser(meRes.data);
        }
        return data;
    };

    const register = async (email, password, full_name) => {
        const res = await authAPI.register({ email, password, full_name });
        const data = res.data;
        saveAuthTokens(data.access_token, data.refresh_token);
        if (data.user) {
            if (typeof data.user === 'object' && data.user.id) {
                setUser(data.user);
                setCachedUser(data.user);
            } else {
                const meRes = await authAPI.getMe();
                setUser(meRes.data);
                setCachedUser(meRes.data);
            }
        } else {
            const meRes = await authAPI.getMe();
            setUser(meRes.data);
            setCachedUser(meRes.data);
        }
        return data;
    };

    const logout = async () => {
        const refreshToken = getRefreshToken();
        if (refreshToken) {
            try {
                await authAPI.logout({ refresh_token: refreshToken });
            } catch {
                // Token may already be invalidated/expired; continue local logout.
            }
        }
        clearAuthTokens();
        setCachedUser(null);
        setUser(null);
    };

    const updateUser = (data) => {
        setUser(prev => {
            const updated = { ...prev, ...data };
            setCachedUser(updated);
            return updated;
        });
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
