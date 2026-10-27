import { Server } from 'socket.io';
import { q } from './db.js';
import { userFromToken } from './auth.js';
import { channelForUser, dmMemberIds, friendIds, serverIdsOf } from './access.js';

let io;
const online = new Map(); // userId -> Set(socketId)

// Voice: channelId -> Map(userId -> state)
const voice = new Map();
const userVoice = new Map(); // userId -> channelId

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    maxHttpBufferSize: 1e6,
    cors: { origin: true, credentials: true },
  });

  io.use((socket, next) => {
    const user = userFromToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`u:${userId}`);
    for (const sid of serverIdsOf(userId)) socket.join(`s:${sid}`);

    const wasOnline = online.has(userId);
    if (!wasOnline) online.set(userId, new Set());
    online.get(userId).add(socket.id);
    if (!wasOnline) broadcastPresence(userId);

    socket.on('typing', ({ channelId } = {}) => {
      const ch = channelForUser(channelId, userId);
      if (!ch) return;
      emitToChannel(ch, 'typing', { channelId, userId }, socket.id);
    });

    socket.on('voice:join', ({ channelId, state } = {}, ack) => {
      const ch = channelForUser(channelId, userId);
      if (!ch || (ch.server_id && ch.type !== 'voice')) return ack?.({ error: 'Kein Zugriff' });
      leaveVoice(userId);
      if (!voice.has(channelId)) voice.set(channelId, new Map());
      const vs = {
        userId,
        channelId,
        socketId: socket.id,
        muted: !!state?.muted,
        deafened: !!state?.deafened,
        video: false,
        screen: false,
        streams: {},
        joinedAt: Date.now(),
      };
      const room = voice.get(channelId);
      const others = [...room.values()].map(publicVoice);
      room.set(userId, vs);
      userVoice.set(userId, channelId);
      emitToChannel(ch, 'voice:update', { channelId, userId, state: publicVoice(vs) });
      if (!ch.server_id) {
        for (const uid of dmMemberIds(ch.id)) {
          if (uid !== userId && !room.has(uid)) io.to(`u:${uid}`).emit('call:ring', { channelId, from: userId });
        }
      }
      ack?.({ ok: true, peers: others });
    });

    socket.on('voice:leave', () => {
      if (voice.get(userVoice.get(userId))?.get(userId)?.socketId === socket.id) leaveVoice(userId);
    });

    socket.on('voice:state', (patch = {}) => {
      const channelId = userVoice.get(userId);
      const vs = voice.get(channelId)?.get(userId);
      if (!vs || vs.socketId !== socket.id) return;
      for (const k of ['muted', 'deafened', 'video', 'screen']) if (k in patch) vs[k] = !!patch[k];
      if (patch.streams && typeof patch.streams === 'object') {
        vs.streams = { cam: String(patch.streams.cam || ''), screen: String(patch.streams.screen || '') };
      }
      const ch = q.get('SELECT * FROM channels WHERE id = ?', channelId);
      if (ch) emitToChannel(ch, 'voice:update', { channelId, userId, state: publicVoice(vs) });
    });

    socket.on('rtc:signal', ({ to, data } = {}) => {
      const channelId = userVoice.get(userId);
      const room = voice.get(channelId);
      const target = room?.get(to);
      if (!room?.get(userId) || !target) return;
      io.to(target.socketId).emit('rtc:signal', { from: userId, data });
    });

    socket.on('call:decline', ({ channelId } = {}) => {
      const ch = channelForUser(channelId, userId);
      if (!ch || ch.server_id) return;
      for (const uid of dmMemberIds(ch.id)) io.to(`u:${uid}`).emit('call:declined', { channelId, userId });
    });

    socket.on('disconnect', () => {
      const set = online.get(userId);
      set?.delete(socket.id);
      const vs = voice.get(userVoice.get(userId))?.get(userId);
      if (vs?.socketId === socket.id) leaveVoice(userId);
      if (set && set.size === 0) {
        online.delete(userId);
        broadcastPresence(userId);
      }
    });
  });

  return io;
}

function publicVoice(vs) {
  const { socketId, ...rest } = vs;
  return rest;
}

export function leaveVoice(userId) {
  const channelId = userVoice.get(userId);
  if (!channelId) return;
  userVoice.delete(userId);
  const room = voice.get(channelId);
  room?.delete(userId);
  const ch = q.get('SELECT * FROM channels WHERE id = ?', channelId);
  if (room && room.size === 0) voice.delete(channelId);
  if (ch) {
    emitToChannel(ch, 'voice:update', { channelId, userId, state: null });
    if (!ch.server_id && (!room || room.size === 0)) emitToChannel(ch, 'call:ended', { channelId });
  }
}

/** Entfernt einen Nutzer aus allen Voice-Kanälen eines Servers (z. B. nach Kick). */
export function leaveServerVoice(userId, serverId) {
  const channelId = userVoice.get(userId);
  if (!channelId) return;
  const ch = q.get('SELECT server_id FROM channels WHERE id = ?', channelId);
  if (ch?.server_id === serverId) leaveVoice(userId);
}

export function dropVoiceChannel(channelId) {
  const room = voice.get(channelId);
  if (!room) return;
  for (const uid of [...room.keys()]) leaveVoice(uid);
}

export function voiceStatesFor(userId) {
  const result = {};
  for (const [channelId, room] of voice) {
    if (!channelForUser(channelId, userId)) continue;
    result[channelId] = Object.fromEntries([...room].map(([uid, vs]) => [uid, publicVoice(vs)]));
  }
  return result;
}

export function presenceOf(userId) {
  if (!online.has(userId)) return 'offline';
  const row = q.get('SELECT status FROM users WHERE id = ?', userId);
  if (!row || row.status === 'invisible') return 'offline';
  return row.status;
}

export function broadcastPresence(userId) {
  if (!io) return;
  const rooms = [
    ...friendIds(userId).map((id) => `u:${id}`),
    ...serverIdsOf(userId).map((id) => `s:${id}`),
    `u:${userId}`,
  ];
  io.to(rooms).emit('presence:update', { userId, status: presenceOf(userId) });
}

/** Sendet ein Event an alle, die einen Nutzer "sehen" (Freunde, Server-Mitglieder, DM-Partner). */
export function emitToRelated(userId, event, data) {
  if (!io) return;
  const dmPartners = q.all(
    `SELECT DISTINCT b.user_id FROM dm_members a JOIN dm_members b ON a.channel_id = b.channel_id WHERE a.user_id = ? AND b.user_id != ?`,
    userId, userId,
  ).map((r) => `u:${r.user_id}`);
  const rooms = [
    `u:${userId}`,
    ...friendIds(userId).map((id) => `u:${id}`),
    ...serverIdsOf(userId).map((id) => `s:${id}`),
    ...dmPartners,
  ];
  io.to(rooms).emit(event, data);
}

export function emitToUser(userId, event, data) {
  io?.to(`u:${userId}`).emit(event, data);
}

export function emitToServer(serverId, event, data) {
  io?.to(`s:${serverId}`).emit(event, data);
}

export function emitToChannel(ch, event, data, exceptSocketId) {
  if (!io) return;
  const rooms = ch.server_id ? [`s:${ch.server_id}`] : dmMemberIds(ch.id).map((id) => `u:${id}`);
  let target = io.to(rooms);
  if (exceptSocketId) target = target.except(exceptSocketId);
  target.emit(event, data);
}

export function joinServerRoom(userId, serverId) {
  io?.in(`u:${userId}`).socketsJoin(`s:${serverId}`);
}

export function leaveServerRoom(userId, serverId) {
  io?.in(`u:${userId}`).socketsLeave(`s:${serverId}`);
}
