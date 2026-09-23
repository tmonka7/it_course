import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { TOKEN_KEY } from '../api';
import { t } from '../i18n';

/**
 * Mesh WebRTC meeting over socket.io signalling.
 *
 * Negotiation: the participant who joins later sends the offer to everyone already in the room, so the two
 * sides never offer at the same time. Every connection gets one audio and one video transceiver up front;
 * switching camera/screen/mute then only swaps or disables tracks (replaceTrack) and never renegotiates.
 */
export default function useMeeting(code) {
  const socketRef = useRef(null);
  const peersRef = useRef(new Map()); // id -> { pc, stream, name, userId, media }
  const queuesRef = useRef(new Map()); // id -> promise chain, so signals for one peer run in order
  const localRef = useRef(null); // camera + microphone stream
  const screenRef = useRef(null); // screen-share video track
  const iceRef = useRef([]);
  const mediaRef = useRef({ audio: false, video: false, screen: false });
  const previewRef = useRef(null); // pending getUserMedia, so the preview starts only once
  const disposedRef = useRef(false);

  const [phase, setPhase] = useState('lobby'); // lobby | joining | in | ended | error
  const [error, setError] = useState(null);
  const [self, setSelf] = useState(null);
  const [meeting, setMeeting] = useState(null);
  const [peers, setPeers] = useState([]);
  const [messages, setMessages] = useState([]);
  const whiteboardRef = useRef([]); // all strokes, kept even while the whiteboard panel is closed
  const [boardActivity, setBoardActivity] = useState(0); // bumps when someone else draws
  const [media, setMedia] = useState(mediaRef.current);
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);

  const publishPeers = useCallback(() => {
    setPeers([...peersRef.current.entries()].map(([id, p]) => ({ id, name: p.name, userId: p.userId, media: p.media, stream: p.stream })));
  }, []);

  const updateMedia = useCallback((patch) => {
    mediaRef.current = { ...mediaRef.current, ...patch };
    setMedia(mediaRef.current);
    socketRef.current?.emit('media', mediaRef.current);
  }, []);

  const audioTrack = () => localRef.current?.getAudioTracks()[0] || null;
  const cameraTrack = () => localRef.current?.getVideoTracks()[0] || null;
  const outgoingVideo = () => screenRef.current || cameraTrack();

  const enqueue = (id, task) => {
    const next = (queuesRef.current.get(id) || Promise.resolve()).then(task).catch((err) => console.warn('[meeting]', err));
    queuesRef.current.set(id, next);
    return next;
  };

  const replaceOutgoing = useCallback(async (kind, track) => {
    const jobs = [];
    peersRef.current.forEach(({ pc }) => {
      pc.getTransceivers().forEach((t) => {
        if (t.receiver.track?.kind === kind) jobs.push(t.sender.replaceTrack(track).catch(() => {}));
      });
    });
    await Promise.all(jobs);
  }, []);

  const createPeer = useCallback(
    (id, info) => {
      const pc = new RTCPeerConnection({ iceServers: iceRef.current });
      const entry = { pc, stream: new MediaStream(), name: info.name, userId: info.userId, media: info.media || {}, pending: [] };
      pc.onicecandidate = (e) => {
        if (e.candidate) socketRef.current?.emit('signal', { to: id, data: { candidate: e.candidate } });
      };
      pc.ontrack = (e) => {
        entry.stream.addTrack(e.track);
        // A new MediaStream object makes React/video elements pick up the added track.
        entry.stream = new MediaStream(entry.stream.getTracks());
        publishPeers();
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') pc.restartIce?.();
      };
      peersRef.current.set(id, entry);
      publishPeers();
      return entry;
    },
    [publishPeers]
  );

  const removePeer = useCallback(
    (id) => {
      const entry = peersRef.current.get(id);
      if (!entry) return;
      entry.pc.close();
      peersRef.current.delete(id);
      queuesRef.current.delete(id);
      publishPeers();
    },
    [publishPeers]
  );

  const flushCandidates = async (entry) => {
    const list = entry.pending.splice(0);
    for (const c of list) await entry.pc.addIceCandidate(c).catch(() => {});
  };

  // Newcomer side: offer to a peer that was already in the room.
  const callPeer = useCallback(
    (info) =>
      enqueue(info.id, async () => {
        const entry = createPeer(info.id, info);
        const audio = entry.pc.addTransceiver('audio', { direction: 'sendrecv' });
        const video = entry.pc.addTransceiver('video', { direction: 'sendrecv' });
        await audio.sender.replaceTrack(audioTrack());
        await video.sender.replaceTrack(outgoingVideo());
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        socketRef.current.emit('signal', { to: info.id, data: { sdp: entry.pc.localDescription } });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createPeer]
  );

  const onSignal = useCallback(
    ({ from, data }) =>
      enqueue(from, async () => {
        let entry = peersRef.current.get(from);
        if (data.sdp?.type === 'offer') {
          if (!entry) entry = createPeer(from, { name: t('Participant') });
          await entry.pc.setRemoteDescription(data.sdp);
          for (const t of entry.pc.getTransceivers()) {
            t.direction = 'sendrecv';
            const kind = t.receiver.track?.kind;
            await t.sender.replaceTrack(kind === 'audio' ? audioTrack() : outgoingVideo());
          }
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          socketRef.current.emit('signal', { to: from, data: { sdp: entry.pc.localDescription } });
          await flushCandidates(entry);
        } else if (data.sdp?.type === 'answer' && entry) {
          await entry.pc.setRemoteDescription(data.sdp);
          await flushCandidates(entry);
        } else if (data.candidate && entry) {
          if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(data.candidate).catch(() => {});
          else entry.pending.push(data.candidate);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createPeer]
  );

  /** Camera/microphone for the lobby preview. Missing devices are fine: you can still join to watch and chat. */
  const startPreview = useCallback(() => {
    previewRef.current = previewRef.current || acquireMedia();
    return previewRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acquireMedia = async () => {
    const tryGet = async (constraints) => {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        return null;
      }
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('Camera and microphone need a secure (HTTPS) connection.'));
      return;
    }
    const stream =
      (await tryGet({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } })) ||
      (await tryGet({ audio: true })) ||
      (await tryGet({ video: true }));
    if (disposedRef.current) {
      stream?.getTracks().forEach((t) => t.stop()); // page closed while the browser was asking
      return;
    }
    localRef.current = stream || new MediaStream();
    setLocalStream(localRef.current);
    mediaRef.current = { audio: !!audioTrack(), video: !!cameraTrack(), screen: false };
    setMedia(mediaRef.current);
  };

  const join = useCallback(() => {
    setPhase('joining');
    const socket = io('/meetings', { auth: { token: localStorage.getItem(TOKEN_KEY) }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect_error', () => {
      setError(t('Could not connect to the meeting server.'));
      setPhase('error');
      socket.disconnect();
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return; // we left on purpose
      setError(t('Connection to the meeting was lost. Rejoin to continue.'));
      setPhase('error');
      socket.disconnect();
    });
    socket.on('signal', onSignal);
    socket.on('room:peer-joined', (p) => {
      // They will send us an offer; register their name now so the tile is labelled.
      const existing = peersRef.current.get(p.id);
      if (existing) Object.assign(existing, { name: p.name, userId: p.userId, media: p.media });
      else enqueue(p.id, () => createPeer(p.id, p));
      publishPeers();
    });
    socket.on('room:peer-left', ({ id }) => removePeer(id));
    socket.on('peer:media', ({ id, media: m }) => {
      const entry = peersRef.current.get(id);
      if (entry) {
        entry.media = m;
        publishPeers();
      }
    });
    socket.on('chat:message', (m) => setMessages((list) => [...list, m]));
    socket.on('wb:segment', (seg) => {
      whiteboardRef.current.push(seg);
      setBoardActivity((n) => n + 1);
    });
    socket.on('wb:clear', () => {
      whiteboardRef.current = [];
    });
    socket.on('room:ended', () => {
      setPhase('ended');
      socketRef.current = null;
      socket.disconnect();
      peersRef.current.forEach(({ pc }) => pc.close());
      peersRef.current.clear();
      publishPeers();
    });

    socket.emit('room:join', { code, media: mediaRef.current }, (res) => {
      if (res?.error) {
        setError(t(res.error)); // fixed server messages are in the dictionary
        setPhase('error');
        socket.disconnect();
        return;
      }
      iceRef.current = res.iceServers;
      setSelf(res.self);
      setMeeting(res.meeting);
      setMessages(res.chat);
      whiteboardRef.current = [...res.whiteboard];
      if (res.whiteboard.length) setBoardActivity((n) => n + 1);
      setPhase('in');
      res.peers.forEach((p) => callPeer(p));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, onSignal, callPeer, createPeer, removePeer, publishPeers]);

  const toggleMic = useCallback(() => {
    const track = audioTrack();
    if (!track) return;
    track.enabled = !track.enabled;
    updateMedia({ audio: track.enabled });
  }, [updateMedia]);

  const toggleCamera = useCallback(async () => {
    let track = cameraTrack();
    if (!track) {
      // No camera yet (denied or unplugged at start): try again now.
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        [track] = s.getVideoTracks();
        localRef.current.addTrack(track);
        setLocalStream(new MediaStream(localRef.current.getTracks()));
        if (!screenRef.current) await replaceOutgoing('video', track);
        updateMedia({ video: true });
      } catch {
        /* still no camera */
      }
      return;
    }
    track.enabled = !track.enabled; // disabled tracks send black frames; peers show an avatar instead
    updateMedia({ video: track.enabled });
  }, [replaceOutgoing, updateMedia]);

  const stopScreenShare = useCallback(async () => {
    const track = screenRef.current;
    if (!track) return;
    screenRef.current = null;
    track.stop();
    setScreenStream(null);
    await replaceOutgoing('video', cameraTrack());
    updateMedia({ screen: false });
  }, [replaceOutgoing, updateMedia]);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) return false;
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false });
      const [track] = s.getVideoTracks();
      track.contentHint = 'detail';
      track.onended = () => stopScreenShare(); // the browser's own "Stop sharing" button
      screenRef.current = track;
      setScreenStream(s);
      await replaceOutgoing('video', track);
      updateMedia({ screen: true });
      return true;
    } catch {
      return false; // user cancelled the picker
    }
  }, [replaceOutgoing, stopScreenShare, updateMedia]);

  const sendChat = useCallback(
    (text) =>
      new Promise((resolve) => {
        socketRef.current?.emit('chat:send', { text }, (res) => resolve(!res?.error));
      }),
    []
  );

  const endForAll = useCallback(() => socketRef.current?.emit('room:end'), []);

  const cleanup = useCallback(() => {
    socketRef.current?.emit('room:leave');
    socketRef.current?.disconnect();
    socketRef.current = null;
    peersRef.current.forEach(({ pc }) => pc.close());
    peersRef.current.clear();
    queuesRef.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.stop();
    screenRef.current = null;
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return {
    phase,
    error,
    self,
    meeting,
    peers,
    messages,
    whiteboardRef,
    boardActivity,
    media,
    localStream,
    screenStream,
    socket: socketRef,
    startPreview,
    join,
    leave: cleanup,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    sendChat,
    endForAll,
  };
}
