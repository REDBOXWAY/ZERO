# ZERO Web v1 — 1001 ↔ 1002

First test build of ZERO internet telephony.

## What works
- Full-screen mobile UI
- Choose fixed ID 1001 or 1002
- Call 1001 ↔ 1002
- Incoming call screen
- ZERO ringtone
- Answer / Decline / End
- WebRTC microphone audio
- Mute
- Call timer
- PWA shell / add to home screen

## Important limitation of v1
The web page must be open for an incoming call. Reliable wake-up while the browser is fully closed requires Web Push/PWA push support and additional backend setup; that comes after the live 1001 ↔ 1002 call is confirmed.

## Run locally
1. Install Node.js 18+.
2. In the project folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:8080`.

Microphone access on phones requires HTTPS (localhost is the development exception). For two real phones, deploy this Node app to an HTTPS host that supports WebSockets.

## First phone test
- Phone A: select ID 1001.
- Phone B: select ID 1002.
- Keep ZERO open on both.
- Tap ID 1002 on phone A.
- Answer on phone B.

## Networking
This v1 uses public STUN only. A TURN server should be added after the basic test so calls work reliably across restrictive mobile/Wi-Fi networks.
