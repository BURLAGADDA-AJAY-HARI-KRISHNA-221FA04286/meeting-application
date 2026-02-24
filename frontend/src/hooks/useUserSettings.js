import { useEffect, useState } from 'react';
import { PRODUCTIVITY_SETTINGS } from '../pages/SettingsConfig';

export function useUserSettings() {
    const defaultSettings = PRODUCTIVITY_SETTINGS.reduce((acc, category) => {
        category.items.forEach(item => {
            acc[item.id] = item.default;
        });
        return acc;
    }, {});

    const [settings, setSettings] = useState(() => {
        const stored = localStorage.getItem('meetingAppSettings');
        if (stored) return JSON.parse(stored);
        return defaultSettings;
    });

    const updateSettings = (newSettings) => {
        setSettings(newSettings);
        localStorage.setItem('meetingAppSettings', JSON.stringify(newSettings));
    };

    return [settings, updateSettings];
}
