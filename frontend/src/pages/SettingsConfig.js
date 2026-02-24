export const PRODUCTIVITY_SETTINGS = [
    {
        id: 'performance',
        label: '🚀 Performance',
        icon: 'Zap',
        items: [
            { id: 'low_bandwidth', label: 'Low Bandwidth Mode', desc: 'Disable incoming video to save data.', default: false },
            { id: 'reduce_motion', label: 'Reduce Motion', desc: 'Disable animations for a snappier feel.', default: false },
            { id: 'hd_video', label: 'HD Video', desc: 'Send 720p video (uses more CPU).', default: true },
            { id: 'active_speaker_view', label: 'Active Speaker Only', desc: 'Hide non-speaking participants.', default: false }
        ]
    },
    {
        id: 'interface',
        label: '🎨 Interface',
        icon: 'Layout',
        items: [
            { id: 'dark_mode', label: 'Dark Mode', desc: 'Easier on the eyes at night.', default: false },
            { id: 'compact_mode', label: 'Compact Chat', desc: 'Show more messages in less space.', default: false },
            { id: 'show_timestamps', label: 'Show Timestamps', desc: 'Display time next to chat messages.', default: true },
            { id: 'hide_self_view', label: 'Hide Self View', desc: 'Don\'t show my own video in the grid.', default: false }
        ]
    },
    {
        id: 'audio',
        label: '🔊 Audio & Voice',
        icon: 'Mic',
        items: [
            { id: 'noise_suppression', label: 'Noise Suppression', desc: 'Filter out background noise.', default: true },
            { id: 'push_to_talk', label: 'Push to Talk', desc: 'Spacebar to unmute temporarily.', default: true },
            { id: 'echo_cancellation', label: 'Echo Cancellation', desc: 'Prevent audio feedback.', default: true },
            { id: 'music_mode', label: 'Music Mode', desc: 'High fidelity audio (disables processing).', default: false }
        ]
    },
    {
        id: 'notifications',
        label: '🔔 Notifications',
        icon: 'Bell',
        items: [
            { id: 'chat_sound', label: 'Chat Sounds', desc: 'Play a sound on new message.', default: true },
            { id: 'join_leave_sound', label: 'Join/Leave Sounds', desc: 'Play Ding/Dong when users enter.', default: true },
            { id: 'desktop_notifs', label: 'Desktop Notifications', desc: 'Show browser toasts when minimized.', default: false },
            { id: 'hand_raise_alert', label: 'Hand Raise Alert', desc: 'Sound when someone raises hand.', default: true }
        ]
    },
    {
        id: 'privacy',
        label: '🔒 Privacy',
        icon: 'Shield',
        items: [
            { id: 'blur_background', label: 'Auto-Blur Background', desc: 'Always join with blurred video.', default: false },
            { id: 'watermark', label: 'Show Watermark', desc: 'Overlay confidential text on video.', default: true },
            { id: 'incognito', label: 'Incognito Name', desc: 'Join as "Anonymous" by default.', default: false }
        ]
    }
];
