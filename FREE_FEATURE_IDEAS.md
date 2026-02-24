# 🚀 60+ Free & "No-Gemini" Feature Ideas
These features rely on standard web technologies, local browser capabilities (WebRTC, Web Audio API), or simple logic. They do **not** require paid AI API calls like Gemini.

## 🤝 Collaboration & Interaction (Real-time WebSocket)
1.  **Interactive Polls**: Create and vote on polls live. (Standard DB + WebSocket)
2.  **Q&A Board**: Upvote/downvote questions. (Standard DB)
3.  **Breakout Rooms**: Split users into sub-meetings. (Signaling logic)
4.  **Shared Notepad**: Collaborative text editing (like Etherpad).
5.  **Infinite Whiteboard**: Extends your current whiteboard with shapes/stickies.
6.  **Cursor Chat**: Show participant cursors with name tags.
7.  **Private "Whisper" Chat**: 1-on-1 text messaging during meetings.
8.  **Reactions Overlay**: Floating emojis (❤️, 👍) on video feeds.
9.  **Hand Raising Queue**: Auto-sort users by who raised hand first.
10. **Focus Mode**: Button to hide all videos and show only shared screen.
11. **Remote Control**: Request control of another user's shared screen (via input mirroring).
12. **Presentation Timer**: A countdown clock visible to the speaker.
13. **Music Mode**: Disable audio processing/echo cancellation for high-fidelity music.
14. **Laser Pointer**: Virtual pointer on shared screens.

## 🎥 Video & Audio (Client-Side Libraries)
*Uses libraries like MediaPipe, TensorFlow.js (runs in browser, free), or CSS.*
15. **Virtual Backgrounds**: Blur or image replacement (MediaPipe).
16. **Center Stage (Auto-Crop)**: Detect face position and crop video to center (SmartCrop.js).
17. **Push-to-Talk**: Hold 'Space' to unmute.
18. **Volume Mixer**: Adjust individual user volume on your end.
19. **Video Filters**: CSS filters (Grayscale, Sepia, High Contrast).
20. **Voice Activity Detection (VAD)**: Visual indicator of who is speaking (Web Audio API).
21. **Network Quality Indicator**: Show "Weak Connection" icon based on ping/packet loss.
22. **Local Recording**: Record video/audio directly in the browser (MediaRecorder API).
23. **Screenshot Button**: Capture the current slide/video frame instantly.
24. **Picture-in-Picture**: Pop the video out to float over other windows.

## 📊 Analytics (Deterministic Math)
25. **Talk-Time Distribution**: Simple timer tracking how long each user's mic was active.
26. **Punctuality Report**: Track who joined before/after the start time.
27. **Attendance Tracker**: List of who joined and for how long.
28. **Cost Ticker**: "This meeting costs $X/min" (based on manual hourly rate input).
29. **Interruption Counter**: Count overlapping speech segments (mic activity).
30. **Meeting Duration**: Simple timer and alerts when running overtime.

## 🔗 Integrations (Standard APIs)
31. **Google Calendar Sync**: Fetch and display upcoming meetings.
32. **Slack/Teams Notifications**: Webhook to post "Meeting Started" in a channel.
33. **Email Invites**: Send SMTP emails with join links.
34. **Export to PDF**: Save the text transcript/whiteboard to PDF.
35. **GitHub Linker**: Paste a GitHub issue URL to see a preview card.

## 🛡️ Security & Admin
36. **Waiting Room**: Host manually admits users.
37. **Meeting Lock**: Prevent new joins after N minutes.
38. **Password Protection**: Require a pin code to enter.
39. **Guest links**: Temporary, one-time-use links.
40. **Role Management**: Assign 'Host', 'Presenter', 'Viewer' permissions.
41. **Kick/Ban User**: Remove disruptive participants.
42. **Watermarking**: Overlay participant's name on video to discourage leaks.

## 📱 Accessibility & Mobile
43. **Dark/Light Mode**: CSS themes.
44. **Keyboard Shortcuts**: Hotkeys for Mute (M), Video (V), Hand (H).
45. **Dyslexia Friendly Font**: Toggle font settings.
46. **High Contrast UI**: For visual impairments.
47. **Reduce Motion**: Disable animations for sensitive users.
48. **Text-Only Mode**: Disable video receiving to save bandwidth.

## 🎨 Fun & Engagement
49. **Confetti Cannon**: CSS animation button.
50. **Soundboard**: Play local audio files (claps, drums) into the audio stream.
51. **Icebreaker Wheel**: Randomly pick a question from a pre-defined JSON list.
52. **Participant Randomizer**: "Who goes next?" spinner.
53. **Meeting Timer/Stopwatch**: Generic utility tools.
54. **Custom Themes**: Allow users to change app colors (CSS Variables).
55. **GIF Search**: Search GIPHY API (Free tier) and send to chat.
56. **Selfie Booth**: Capture the video grid canvas to an image.
57. **Zen Mode**: 1-minute breathing exercise (CSS animation).

## 🧠 "Poor Man's AI" (Logic/Regex)
*Features that mimic AI but just use simple code.*
58. **Keyword Highlighter**: Highlight words like "Urgent", "Budget" in the transcript array.
59. **Profanity Filter**: Replace bad words in chat with asterisks (List matching).
60. **"Active Listener" Award**: Awarded to the person who was unmuted the least (but present).
