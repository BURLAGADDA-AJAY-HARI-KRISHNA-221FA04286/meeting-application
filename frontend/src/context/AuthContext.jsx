import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            authAPI.getMe()
                .then(res => setUser(res.data))
                .catch(() => {
                    localStorage.clear();
                    setUser(null);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (email, password) => {
        try {
            const res = await authAPI.login({ email, password });
            const data = res.data;
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            // user object may come from the token response or /me endpoint
            if (data.user) {
                setUser(data.user);
            } else {
                // Fetch user profile if not included in login response
                const meRes = await authAPI.getMe();
                setUser(meRes.data);
            }
            return data;
        } catch (err) {
            throw err;
        }
    };

    const register = async (email, password, full_name) => {
        try {
            const res = await authAPI.register({ email, password, full_name });
            const data = res.data;
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            if (data.user) {
                // If user is an ORM object, it may need re-fetching
                if (typeof data.user === 'object' && data.user.id) {
                    setUser(data.user);
                } else {
                    const meRes = await authAPI.getMe();
                    setUser(meRes.data);
                }
            } else {
                const meRes = await authAPI.getMe();
                setUser(meRes.data);
            }
            return data;
        } catch (err) {
            throw err;
        }
    };

    const logout = () => {
        localStorage.clear();
        setUser(null);
    };

    const updateUser = (data) => {
        setUser(prev => ({ ...prev, ...data }));
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
