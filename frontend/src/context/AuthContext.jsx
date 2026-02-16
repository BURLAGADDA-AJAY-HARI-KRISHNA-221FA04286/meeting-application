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
        const res = await authAPI.login({ email, password });
        localStorage.setItem('access_token', res.data.access_token);
        localStorage.setItem('refresh_token', res.data.refresh_token);
        setUser(res.data.user);
        return res.data;
    };

    const register = async (email, password, full_name) => {
        const res = await authAPI.register({ email, password, full_name });
        localStorage.setItem('access_token', res.data.access_token);
        localStorage.setItem('refresh_token', res.data.refresh_token);
        setUser(res.data.user);
        return res.data;
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
