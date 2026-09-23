/**
 * Real-time layer for video meetings (socket.io):
 *   - WebRTC signalling (offers/answers/ICE candidates relayed between peers of the same room; media is peer-to-peer)
 *   - chat (persisted), shared whiteboard (kept in memory while the room is active), media state (mic/camera/screen)
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const MeetingMessage = require('../models/MeetingMessage');

const MAX_WHITEBOARD_SEGMENTS = 20000;
const rooms = new Map(); // code -> { meetingId, hostId, peers: Map<socketId, peer>, whiteboard: [] }

const publicPeer = (id, p) => ({ id, userId: p.userId, name: p.name, media: p.media });

function cleanMedia(m = {}) {
  return { audio: !!m.audio, video: !!m.video, screen: !!m.screen };
}

async function authenticate(socket, next) {
  try {
    const { id } = jwt.verify(socket.handshake.auth?.token || '', config.jwtSecret);
    const user = await User.findById(id);
    if (!user || user.status !== 'Active') return next(new Error('unauthorized'));
    socket.data.user = { _id: String(user._id), name: user.name, username: user.username, role: user.role };
    return next();
  } catch {
    return next(new Error('unauthorized'));
  }
}

module.exports = function attachMeetings(io) {
  const nsp = io.of('/meetings');
  nsp.use(authenticate);

  nsp.on('connection', (socket) => {
    const { user } = socket.data;
    let room = null; // the room this socket is in
    let code = null;
    // False once the host has ended the meeting (the room object is then detached from `rooms`).
    const inRoom = () => !!room && rooms.get(code) === room;

    const leave = async () => {
      if (!room) return;
      const active = inRoom();
      room.peers.delete(socket.id);
      socket.to(code).emit('room:peer-left', { id: socket.id });
      socket.leave(code);
      if (active && !room.peers.size) {
        rooms.delete(code);
        await Meeting.updateOne({ _id: room.meetingId, status: 'Live' }, { status: 'Scheduled' }).catch(() => {});
      }
      room = null;
      code = null;
    };

    socket.on('room:join', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        await leave();
        const wanted = String(payload?.code || '').toLowerCase().trim();
        const meeting = await Meeting.findOne({ code: wanted });
        if (!meeting) return reply({ error: 'Meeting not found' });
        if (meeting.status === 'Ended') return reply({ error: 'This meeting has ended' });

        code = wanted;
        room = rooms.get(code);
        if (!room) {
          room = { meetingId: meeting._id, hostId: String(meeting.host), peers: new Map(), whiteboard: [] };
          rooms.set(code, room);
        }
        const others = [...room.peers.entries()].map(([id, p]) => publicPeer(id, p));
        const peer = { userId: user._id, name: user.name, media: cleanMedia(payload?.media) };
        room.peers.set(socket.id, peer);
        socket.join(code);
        socket.to(code).emit('room:peer-joined', publicPeer(socket.id, peer));

        if (meeting.status !== 'Live') {
          meeting.status = 'Live';
          meeting.startedAt = meeting.startedAt || new Date();
          await meeting.save();
        }
        const chat = await MeetingMessage.find({ meeting: meeting._id }).sort({ createdAt: -1 }).limit(100).lean();

        return reply({
          self: socket.id,
          meeting: { title: meeting.title, code: meeting.code, hostId: room.hostId },
          peers: others,
          chat: chat.reverse(),
          whiteboard: room.whiteboard,
          iceServers: config.iceServers,
        });
      } catch (err) {
        console.error('[meetings] join failed:', err.message);
        return reply({ error: 'Could not join the meeting' });
      }
    });

    // WebRTC signalling: only relayed between sockets of the same room.
    socket.on('signal', ({ to, data } = {}) => {
      if (inRoom() && room.peers.has(to)) nsp.to(to).emit('signal', { from: socket.id, data });
    });

    socket.on('media', (media) => {
      const peer = inRoom() && room.peers.get(socket.id);
      if (!peer) return;
      peer.media = cleanMedia(media);
      socket.to(code).emit('peer:media', { id: socket.id, media: peer.media });
    });

    socket.on('chat:send', async ({ text } = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const body = String(text || '').trim().slice(0, 2000);
      if (!inRoom() || !body) return reply({ error: 'Nothing to send' });
      const msg = await MeetingMessage.create({ meeting: room.meetingId, user: user._id, name: user.name, text: body });
      nsp.to(code).emit('chat:message', msg.toJSON());
      return reply({ ok: true });
    });

    // Whiteboard segments use 0..1 coordinates so every screen size draws the same picture.
    socket.on('wb:segment', (seg) => {
      if (!inRoom() || !seg || !Array.isArray(seg.from) || !Array.isArray(seg.to)) return;
      const clean = {
        from: seg.from.slice(0, 2).map(Number),
        to: seg.to.slice(0, 2).map(Number),
        color: String(seg.color || '#1d2b53').slice(0, 16),
        width: Math.min(Math.max(Number(seg.width) || 3, 1), 60),
        erase: !!seg.erase,
      };
      room.whiteboard.push(clean);
      if (room.whiteboard.length > MAX_WHITEBOARD_SEGMENTS) room.whiteboard.splice(0, room.whiteboard.length - MAX_WHITEBOARD_SEGMENTS);
      socket.to(code).emit('wb:segment', clean);
    });

    socket.on('wb:clear', () => {
      if (!inRoom()) return;
      room.whiteboard = [];
      nsp.to(code).emit('wb:clear', { by: user.name });
    });

    // Host (or an admin) ends the meeting for everyone.
    socket.on('room:end', async () => {
      if (!inRoom() || (room.hostId !== user._id && user.role !== 'admin')) return;
      const endedCode = code;
      const { meetingId } = room;
      await Meeting.updateOne({ _id: meetingId }, { status: 'Ended', endedAt: new Date() });
      nsp.to(endedCode).emit('room:ended', { by: user.name });
      rooms.delete(endedCode);
      nsp.in(endedCode).socketsLeave(endedCode);
      room = null;
      code = null;
    });

    socket.on('room:leave', leave);
    socket.on('disconnect', leave);
  });
};

/** Number of people currently in each meeting room, by code. */
module.exports.liveCounts = () => Object.fromEntries([...rooms.entries()].map(([c, r]) => [c, r.peers.size]));
