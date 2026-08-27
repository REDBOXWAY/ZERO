const SIGNAL_URL = (() => {
  const qs = new URLSearchParams(location.search);
  if (qs.get('signal')) return qs.get('signal');
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return `ws://${location.hostname}:8080`;
  return `wss://${location.host}/ws`;
})();

const screens = {
  home: document.getElementById('homeScreen'),
  incoming: document.getElementById('incomingScreen'),
  active: document.getElementById('activeScreen'),
  setup: document.getElementById('setupScreen')
};
const myIdLabel = document.getElementById('myIdLabel');
const peerIdLabel = document.getElementById('peerIdLabel');
const peerStateLabel = document.getElementById('peerStateLabel');
const peerButton = document.getElementById('peerButton');
const incomingId = document.getElementById('incomingId');
const activeId = document.getElementById('activeId');
const activeStatus = document.getElementById('activeStatus');
const callTimer = document.getElementById('callTimer');
const answerButton = document.getElementById('answerButton');
const declineButton = document.getElementById('declineButton');
const endButton = document.getElementById('endButton');
const muteButton = document.getElementById('muteButton');
const speakerButton = document.getElementById('speakerButton');
const remoteAudio = document.getElementById('remoteAudio');
const ringtone = document.getElementById('ringtone');

let myId = localStorage.getItem('zero-test-id');
let peerId = null;
let ws = null;
let pc = null;
let localStream = null;
let currentPeer = null;
let pendingOffer = null;
let callStartedAt = null;
let timerHandle = null;
let isMuted = false;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function setIdentity(id) {
  myId = id;
  localStorage.setItem('zero-test-id', id);
  peerId = id === '1001' ? '1002' : '1001';
  myIdLabel.textContent = `MY ID: ${myId}`;
  peerIdLabel.textContent = `ID ${peerId}`;
  connectSignal();
  showScreen('home');
}

function send(type, payload = {}, to = currentPeer) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, from: myId, to, ...payload }));
}

function connectSignal() {
  if (ws) try { ws.close(); } catch {}
  ws = new WebSocket(SIGNAL_URL);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'register', id: myId }));
    peerStateLabel.textContent = 'TAP TO CALL';
  });
  ws.addEventListener('close', () => {
    peerStateLabel.textContent = 'RECONNECTING...';
    setTimeout(() => myId && connectSignal(), 1800);
  });
  ws.addEventListener('message', async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'incoming') {
      currentPeer = msg.from;
      pendingOffer = msg.offer;
      incomingId.textContent = `ID ${currentPeer}`;
      showScreen('incoming');
      ringtone.currentTime = 0;
      ringtone.play().catch(() => {});
    }
    if (msg.type === 'answer') {
      if (!pc) return;
      await pc.setRemoteDescription(msg.answer);
      activeStatus.textContent = 'CONNECTED';
      startTimer();
    }
    if (msg.type === 'ice') {
      if (pc && msg.candidate) {
        try { await pc.addIceCandidate(msg.candidate); } catch (e) { console.warn(e); }
      }
    }
    if (msg.type === 'decline') resetCall('DECLINED');
    if (msg.type === 'hangup') resetCall('CALL ENDED');
    if (msg.type === 'unavailable') resetCall('ID OFFLINE');
  });
}

async function getMic() {
  if (!localStream) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  }
  return localStream;
}

async function createPeer() {
  if (pc) pc.close();
  pc = new RTCPeerConnection(rtcConfig);
  const stream = await getMic();
  stream.getTracks().forEach(track => pc.addTrack(track, stream));
  pc.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch(() => {});
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) send('ice', { candidate: event.candidate });
  };
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === 'connected') {
      activeStatus.textContent = 'CONNECTED';
      startTimer();
    }
    if (['failed', 'closed'].includes(pc.connectionState)) resetCall('CALL ENDED');
  };
}

async function startCall() {
  if (!myId || !peerId) return;
  currentPeer = peerId;
  peerButton.classList.add('calling');
  peerStateLabel.textContent = 'CALLING...';
  activeId.textContent = `ID ${currentPeer}`;
  activeStatus.textContent = 'CALLING...';
  showScreen('active');
  try {
    await createPeer();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send('call', { offer }, currentPeer);
  } catch (err) {
    alert(`Microphone error: ${err.message}`);
    resetCall('MIC ERROR');
  }
}

async function answerCall() {
  ringtone.pause();
  activeId.textContent = `ID ${currentPeer}`;
  activeStatus.textContent = 'CONNECTING...';
  showScreen('active');
  try {
    await createPeer();
    await pc.setRemoteDescription(pendingOffer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send('answer', { answer });
  } catch (err) {
    alert(`Microphone error: ${err.message}`);
    send('decline');
    resetCall('MIC ERROR');
  }
}

function declineCall() {
  ringtone.pause();
  send('decline');
  resetCall('DECLINED');
}

function hangup() {
  send('hangup');
  resetCall('CALL ENDED');
}

function resetCall(label = 'TAP TO CALL') {
  ringtone.pause();
  ringtone.currentTime = 0;
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  callStartedAt = null;
  callTimer.textContent = '00:00';
  if (pc) { try { pc.close(); } catch {} }
  pc = null;
  currentPeer = null;
  pendingOffer = null;
  peerButton.classList.remove('calling');
  peerStateLabel.textContent = label;
  showScreen('home');
  setTimeout(() => { if (peerStateLabel.textContent === label) peerStateLabel.textContent = 'TAP TO CALL'; }, 1600);
}

function startTimer() {
  if (callStartedAt) return;
  callStartedAt = Date.now();
  timerHandle = setInterval(() => {
    const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    callTimer.textContent = `${m}:${s}`;
  }, 500);
}

function toggleMute() {
  isMuted = !isMuted;
  if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  muteButton.classList.toggle('on', isMuted);
  muteButton.lastChild.textContent = isMuted ? 'UNMUTE' : 'MUTE';
}

function toggleSpeaker() {
  const on = !speakerButton.classList.contains('on');
  speakerButton.classList.toggle('on', on);
  remoteAudio.muted = false;
}

peerButton.addEventListener('click', startCall);
answerButton.addEventListener('click', answerCall);
declineButton.addEventListener('click', declineCall);
endButton.addEventListener('click', hangup);
muteButton.addEventListener('click', toggleMute);
speakerButton.addEventListener('click', toggleSpeaker);
document.querySelectorAll('.setup-choice').forEach(btn => btn.addEventListener('click', () => setIdentity(btn.dataset.id)));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

if (myId === '1001' || myId === '1002') setIdentity(myId);
else showScreen('setup');
