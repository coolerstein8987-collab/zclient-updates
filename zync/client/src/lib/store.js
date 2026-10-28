import { create } from 'zustand';
import { io } from 'socket.io-client';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { useSettings } from './settings.js';
import { sounds, startRinging, stopRinging } from './sounds.js';

const VIEW_KEY = 'zync.view';
const LAST_CH_KEY = 'zync.lastChannels';

const readJson = (k, f) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; }
};
const writeJson = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ }
};

const initialUi = () => ({
  view: readJson(VIEW_KEY, { serverId: null, channelId: null }),
  modal: null,
  settings: null,
  popout: null,
  menu: null,
  lightbox: null,
  incomingCall: null,
  toasts: [],
  switcherOpen: false,
  membersOpen: true,
  mobilePane: 'nav',
  mobileTab: 'servers',
  isMobile: false,
  replyTo: {},
  editing: null,
  screenPicker: null,
});

export const useStore = create(() => ({
  token: getToken(),
  ready: false,
  connected: false,
  bootError: null,
  me: null,
  users: {},
  presences: {},
  relationships: {},
  servers: {},
  serverOrder: [],
  channels: {},
  messages: {},
  hasMore: {},
  readStates: {},
  lastMessages: {},
  mentions: {},
  typing: {},
  voice: {},
  stickers: [],
  sounds: [],
  stories: {},
  quests: null,
  claims: {},
  rtc: { iceServers: [] },
  ...initialUi(),
}));

const set = useStore.setState;
const get = useStore.getState;

let socket = null;
export const getSocket = () => socket;
const socketHooks = [];
/** Module (z. B. die Voice-Engine) können sich hier an jeden neuen Socket hängen. */
export const onSocket = (fn) => { socketHooks.push(fn); if (socket) fn(socket); };

// ---------- Helfer ----------
export const isUnread = (s, cid) => {
  const last = s.lastMessages[cid];
  return !!last && last > (s.readStates[cid] || '');
};

export const serverChannels = (s, serverId) =>
  Object.values(s.channels).filter((c) => c.serverId === serverId).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);

export const dmList = (s) =>
  Object.values(s.channels).filter((c) => c.type === 'dm').sort((a, b) => (s.lastMessages[b.id] || b.id).localeCompare(s.lastMessages[a.id] || a.id));

export const dmPartner = (s, channel) => s.users[channel?.recipients?.[0]];

/** Rollen eines Mitglieds, höchste zuerst. */
export const memberRoles = (s, serverId, userId) => {
  const srv = s.servers[serverId];
  const ids = srv?.members[userId]?.roles || [];
  return ids.map((id) => srv.roles?.[id]).filter(Boolean).sort((a, b) => b.position - a.position);
};
export const roleColor = (s, serverId, userId) => (serverId ? memberRoles(s, serverId, userId).find((r) => r.color && r.color !== '#99aab5')?.color : null) || null;

/** Stories gruppiert nach Nutzer (eigene zuerst, dann ungesehene). */
export function storyGroups(s) {
  const now = Date.now();
  const byUser = {};
  for (const st of Object.values(s.stories)) {
    if (st.expiresAt < now) continue;
    (byUser[st.userId] ||= []).push(st);
  }
  return Object.entries(byUser).map(([userId, list]) => {
    list.sort((a, b) => a.createdAt - b.createdAt);
    return { userId, stories: list, unseen: list.some((x) => !x.viewed), latest: list[list.length - 1].createdAt };
  }).sort((a, b) => (a.userId === s.me?.id ? -1 : b.userId === s.me?.id ? 1 : (b.unseen - a.unseen) || (b.latest - a.latest)));
}

export const displayName = (s, userId, serverId) => {
  const u = s.users[userId];
  const nick = serverId && s.servers[serverId]?.members[userId]?.nickname;
  return nick || u?.displayName || u?.username || 'Unbekannt';
};

export function toast(text, type = 'info', ms = 3500) {
  const id = Math.random().toString(36).slice(2);
  set((s) => ({ toasts: [...s.toasts, { id, text, type }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export const openModal = (type, props = {}) => set({ modal: { type, props } });
export const closeModal = () => set({ modal: null });
export const openSettings = (section = 'account') => set({ settings: section, popout: null, menu: null });
export const closeSettings = () => set({ settings: null });
export const openPopout = (userId, e, serverId) => {
  const r = e?.currentTarget?.getBoundingClientRect?.();
  set({ popout: { userId, serverId, rect: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null }, menu: null });
};
export const openMenu = (e, items) => {
  e.preventDefault();
  e.stopPropagation();
  set({ menu: { x: e.clientX, y: e.clientY, items }, popout: null });
};

// ---------- Auth & Bootstrap ----------
export async function login(username, password, register = false, displayName) {
  const { token } = await api(register ? '/auth/register' : '/auth/login', {
    method: 'POST',
    body: { username, password, displayName },
  });
  setToken(token);
  set({ token });
  await bootstrap();
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* egal */ }
  hardLogout();
}

function hardLogout() {
  setToken(null);
  socket?.disconnect();
  socket = null;
  window.dispatchEvent(new Event('zync:logout'));
  set({ token: null, ready: false, me: null, users: {}, servers: {}, channels: {}, messages: {}, ...initialUi() });
}
setUnauthorizedHandler(hardLogout);

export const SPECIAL_VIEWS = ['discover', 'rewards', 'ai'];

function normalizeServer(srv) {
  const { members = [], roles = [], ...rest } = srv;
  return {
    ...rest,
    members: Object.fromEntries(members.map((m) => [m.userId, { ...m, roles: m.roles || [] }])),
    roles: Object.fromEntries(roles.map((r) => [r.id, r])),
  };
}

export async function loadStories() {
  try {
    const d = await api('/stories');
    set((s) => ({ stories: Object.fromEntries(d.stories.map((x) => [x.id, x])), users: { ...d.users, ...s.users } }));
  } catch { /* egal */ }
}

export async function loadQuests() {
  try {
    const d = await api('/quests');
    set({ quests: { ...d, loadedAt: Date.now() } });
  } catch { /* egal */ }
}

export async function bootstrap() {
  try {
    const d = await api('/bootstrap');
    const servers = {};
    const channels = {};
    for (const s of d.servers) {
      const { channels: chs, ...rest } = s;
      servers[s.id] = normalizeServer(rest);
      chs.forEach((c) => { channels[c.id] = c; });
    }
    d.dms.forEach((c) => { channels[c.id] = c; });
    const relationships = Object.fromEntries(d.relationships.map((r) => [r.id, r]));
    let { view } = get();
    if (view.serverId && !SPECIAL_VIEWS.includes(view.serverId) && !servers[view.serverId]) view = { serverId: null, channelId: null };
    if (view.channelId && !channels[view.channelId]) view = { ...view, channelId: null };
    set({
      ready: true,
      bootError: null,
      me: d.user,
      users: { ...d.users, [d.user.id]: d.user },
      presences: d.presences,
      relationships,
      servers,
      serverOrder: d.servers.map((s) => s.id),
      channels,
      readStates: d.readStates,
      lastMessages: d.lastMessages,
      mentions: d.mentions,
      voice: d.voice,
      stickers: d.stickers,
      sounds: d.sounds || [],
      claims: Object.fromEntries((d.claims || []).map((c) => [c.id, c])),
      rtc: d.rtc,
      ai: d.ai || { enabled: false },
      isOwner: !!d.isOwner,
      discordLogin: !!d.discordLogin,
      discordBridge: !!d.discordBridge,
      view,
      messages: {},
      hasMore: {},
    });
    if (view.serverId && !SPECIAL_VIEWS.includes(view.serverId) && !view.channelId) openServer(view.serverId);
    connectSocket();
    loadStories();
    loadQuests();
  } catch (e) {
    if (e.status !== 401) set({ bootError: e.message });
    throw e;
  }
}

// ---------- Navigation ----------
function setView(view) {
  writeJson(VIEW_KEY, view);
  set({ view, popout: null, menu: null });
  if (view.channelId) {
    set({ mobilePane: 'chat' });
    ack(view.channelId);
  }
}

export const openHome = () => setView({ serverId: null, channelId: null });
export const openRewards = (tab = 'quests') => {
  setView({ serverId: 'rewards', channelId: null, tab });
  set({ mobilePane: 'chat' });
};
export const openAi = () => {
  setView({ serverId: 'ai', channelId: null });
  set({ mobilePane: 'chat' });
};
export const openDiscover = () => {
  setView({ serverId: 'discover', channelId: null });
  set({ mobilePane: 'chat' });
};
export const openDm = (channelId) => setView({ serverId: null, channelId });

export function openServer(serverId) {
  const s = get();
  const last = readJson(LAST_CH_KEY, {})[serverId];
  const chs = serverChannels(s, serverId);
  const ch = (last && s.channels[last]?.serverId === serverId && last) || chs.find((c) => c.type === 'text')?.id || chs[0]?.id || null;
  writeJson(VIEW_KEY, { serverId, channelId: ch });
  set({ view: { serverId, channelId: ch }, popout: null, menu: null, mobilePane: 'nav' });
  if (ch) ack(ch);
}

export function openChannel(serverId, channelId) {
  const last = readJson(LAST_CH_KEY, {});
  last[serverId] = channelId;
  writeJson(LAST_CH_KEY, last);
  setView({ serverId, channelId });
}

export async function openDmWith(userId) {
  const existing = dmList(get()).find((c) => c.recipients?.[0] === userId);
  if (existing) return openDm(existing.id);
  try {
    const ch = await api('/dms', { method: 'POST', body: { userId } });
    set((s) => ({ channels: { ...s.channels, [ch.id]: { ...s.channels[ch.id], ...ch } } }));
    openDm(ch.id);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---------- Nachrichten ----------
export async function loadMessages(channelId, { older = false } = {}) {
  const s = get();
  const list = s.messages[channelId];
  if (older && (!list?.length || s.hasMore[channelId] === false)) return;
  const before = older ? list.find((m) => !m.pending)?.id : undefined;
  const d = await api(`/channels/${channelId}/messages?limit=50${before ? `&before=${before}` : ''}`);
  set((st) => {
    const prev = older ? st.messages[channelId] || [] : (st.messages[channelId] || []).filter((m) => m.pending);
    const ids = new Set(prev.map((m) => m.id));
    const merged = older ? [...d.messages.filter((m) => !ids.has(m.id)), ...prev] : [...d.messages, ...prev.filter((m) => !d.messages.some((x) => x.id === m.id))];
    return {
      messages: { ...st.messages, [channelId]: merged },
      hasMore: { ...st.hasMore, [channelId]: d.hasMore },
      users: { ...d.users, ...st.users },
    };
  });
}

let nonceSeq = 0;
export async function sendMessage(channelId, { content = '', attachments = [], sticker = null, replyTo = null }) {
  const me = get().me;
  const nonce = `n${Date.now()}${nonceSeq++}`;
  const pending = {
    id: `~${nonce}`, nonce, pending: true, channelId, authorId: me.id, content, attachments, sticker,
    replyTo: replyTo ? { id: replyTo.id, authorId: replyTo.authorId, content: replyTo.content } : null,
    reactions: [], createdAt: Date.now(), type: 'default',
  };
  set((s) => (s.messages[channelId] ? { messages: { ...s.messages, [channelId]: [...s.messages[channelId], pending] } } : {}));
  try {
    const msg = await api(`/channels/${channelId}/messages`, { method: 'POST', body: { content, attachments, sticker, replyTo: replyTo?.id, nonce } });
    upsertMessage({ ...msg, nonce });
    set((s) => ({ readStates: { ...s.readStates, [channelId]: msg.id }, lastMessages: { ...s.lastMessages, [channelId]: msg.id } }));
  } catch (e) {
    set((s) => ({ messages: { ...s.messages, [channelId]: (s.messages[channelId] || []).map((m) => (m.nonce === nonce && m.pending ? { ...m, failed: true } : m)) } }));
    toast(e.message, 'error');
  }
}

export function discardFailed(channelId, nonce) {
  set((s) => ({ messages: { ...s.messages, [channelId]: (s.messages[channelId] || []).filter((m) => m.nonce !== nonce) } }));
}

function upsertMessage(msg) {
  set((s) => {
    const list = s.messages[msg.channelId];
    if (!list) return {};
    const idx = list.findIndex((m) => m.id === msg.id || (msg.nonce && m.nonce === msg.nonce && m.pending));
    let next;
    if (idx >= 0) {
      next = [...list];
      next[idx] = { ...msg, nonce: undefined, pending: false };
    } else {
      next = [...list, msg].sort((a, b) => (!!a.pending === !!b.pending ? a.id.localeCompare(b.id) : a.pending ? 1 : -1));
    }
    return { messages: { ...s.messages, [msg.channelId]: next } };
  });
}

const ackTimers = {};
export function ack(channelId) {
  const s = get();
  const last = s.lastMessages[channelId];
  if (s.mentions[channelId]) set((st) => ({ mentions: { ...st.mentions, [channelId]: 0 } }));
  if (!last || last <= (s.readStates[channelId] || '')) return;
  set((st) => ({ readStates: { ...st.readStates, [channelId]: last } }));
  clearTimeout(ackTimers[channelId]);
  ackTimers[channelId] = setTimeout(() => api(`/channels/${channelId}/ack`, { method: 'POST', body: { messageId: last } }).catch(() => {}), 400);
}

// ---------- Socket ----------
const isActiveChannel = (cid) => get().view.channelId === cid && document.visibilityState === 'visible' && document.hasFocus();

function notify(msg, ch) {
  const s = get();
  const st = useSettings.getState();
  const author = s.users[msg.authorId];
  const isDm = ch.type === 'dm';
  const mentioned = !isDm && (msg.content.includes(`@${s.me.username}`) || msg.content.includes('@everyone'));
  if (!(isDm && st.notifDMs) && !(mentioned && st.notifMentions) && !st.notifAllMessages) return;
  if (s.me.status === 'dnd') return;
  const claim = s.users[s.me.id]?.claim;
  if (claim?.active && msg.authorId !== claim.fromId && msg.authorId !== claim.toId) return;
  if (mentioned) sounds.mention(); else sounds.message();
  const title = isDm ? displayName(s, msg.authorId) : `${displayName(s, msg.authorId, ch.serverId)} in #${ch.name}`;
  const body = msg.content || (msg.sticker ? 'hat einen Sticker gesendet' : 'hat eine Datei gesendet');
  if (st.notifDesktop && 'Notification' in window && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
    try {
      const n = new Notification(title, { body: body.slice(0, 180), icon: author?.avatar || '/icons/icon-192.png', tag: ch.id });
      n.onclick = () => {
        window.focus();
        if (ch.serverId) openChannel(ch.serverId, ch.id); else openDm(ch.id);
        n.close();
      };
    } catch { /* manche Plattformen erlauben nur SW-Notifications */ }
  } else if (!document.hidden && get().view.channelId !== ch.id) {
    toast(`💬 ${title}: ${body.slice(0, 80)}`, 'message');
  }
}

export function connectSocket() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token: get().token }, transports: ['websocket', 'polling'] });
  let first = true;
  socketHooks.forEach((fn) => fn(socket));

  socket.on('connect', () => {
    set({ connected: true });
    if (!first) bootstrap().catch(() => {});
    first = false;
    window.dispatchEvent(new Event('zync:socket-connect'));
  });
  socket.on('disconnect', () => set({ connected: false }));
  socket.on('connect_error', (e) => {
    if (e.message === 'unauthorized') hardLogout();
  });

  socket.on('message:create', (msg) => {
    const s = get();
    const ch = s.channels[msg.channelId];
    upsertMessage(msg);
    set((st) => {
      const typing = { ...st.typing };
      if (typing[msg.channelId]?.[msg.authorId]) {
        typing[msg.channelId] = { ...typing[msg.channelId] };
        delete typing[msg.channelId][msg.authorId];
      }
      return { lastMessages: { ...st.lastMessages, [msg.channelId]: msg.id }, typing };
    });
    if (msg.authorId === s.me.id) {
      set((st) => ({ readStates: { ...st.readStates, [msg.channelId]: msg.id } }));
      return;
    }
    if (!ch) return;
    if (isActiveChannel(msg.channelId)) {
      ack(msg.channelId);
      return;
    }
    const isDm = ch.type === 'dm';
    const mentioned = msg.content.includes(`@${s.me.username}`) || msg.content.includes('@everyone');
    if (isDm || mentioned) set((st) => ({ mentions: { ...st.mentions, [msg.channelId]: (st.mentions[msg.channelId] || 0) + 1 } }));
    if (msg.type === 'default') notify(msg, ch);
  });

  socket.on('message:update', (msg) => {
    set((s) => {
      const list = s.messages[msg.channelId];
      if (!list) return {};
      return { messages: { ...s.messages, [msg.channelId]: list.map((m) => (m.id === msg.id ? msg : m)) } };
    });
  });

  socket.on('message:delete', ({ id, channelId }) => {
    set((s) => {
      const list = s.messages[channelId];
      if (!list) return {};
      return {
        messages: {
          ...s.messages,
          [channelId]: list.filter((m) => m.id !== id).map((m) => (m.replyTo?.id === id ? { ...m, replyTo: { id, deleted: true } } : m)),
        },
      };
    });
  });

  socket.on('reaction:update', ({ id, channelId, reactions }) => {
    set((s) => {
      const list = s.messages[channelId];
      if (!list) return {};
      return { messages: { ...s.messages, [channelId]: list.map((m) => (m.id === id ? { ...m, reactions } : m)) } };
    });
  });

  socket.on('read:update', ({ channelId, messageId }) => {
    set((s) => ({
      readStates: { ...s.readStates, [channelId]: messageId > (s.readStates[channelId] || '') ? messageId : s.readStates[channelId] },
      mentions: { ...s.mentions, [channelId]: 0 },
    }));
  });

  socket.on('typing', ({ channelId, userId }) => {
    set((s) => ({ typing: { ...s.typing, [channelId]: { ...s.typing[channelId], [userId]: Date.now() + 8000 } } }));
  });

  socket.on('presence:update', ({ userId, status }) => {
    set((s) => ({ presences: { ...s.presences, [userId]: userId === s.me?.id && s.me.status === 'invisible' ? 'invisible' : status } }));
  });

  socket.on('user:update', (u) => set((s) => ({ users: { ...s.users, [u.id]: { ...s.users[u.id], ...u } } })));
  socket.on('me:update', (me) => set((s) => ({ me, users: { ...s.users, [me.id]: { ...s.users[me.id], ...me } } })));

  socket.on('relationship:update', ({ id, type, since, user, status }) => {
    const prev = get().relationships[id]?.type;
    set((s) => ({
      relationships: { ...s.relationships, [id]: { id, type, since } },
      users: { ...s.users, [id]: user },
      presences: { ...s.presences, [id]: status },
    }));
    if (type === 3 && prev !== 3) {
      sounds.friend();
      toast(`👋 ${user.displayName} möchte mit dir befreundet sein`, 'friend', 5000);
    }
    if (type === 1 && prev === 4) {
      sounds.friend();
      toast(`🎉 ${user.displayName} hat deine Anfrage angenommen`, 'friend', 5000);
    }
  });
  socket.on('relationship:remove', ({ id }) => set((s) => {
    const relationships = { ...s.relationships };
    delete relationships[id];
    return { relationships };
  }));

  socket.on('dm:create', (ch) => {
    const { user, status, ...channel } = ch;
    set((s) => ({
      channels: { ...s.channels, [channel.id]: channel },
      users: { ...s.users, [user.id]: user },
      presences: { ...s.presences, [user.id]: status },
    }));
  });

  socket.on('server:create', ({ server, users, presences, voice }) => {
    const { channels: chs, ...rest } = server;
    set((s) => {
      const channels = { ...s.channels };
      chs.forEach((c) => { channels[c.id] = c; });
      return {
        servers: { ...s.servers, [server.id]: normalizeServer(rest) },
        serverOrder: s.serverOrder.includes(server.id) ? s.serverOrder : [...s.serverOrder, server.id],
        channels,
        users: { ...users, ...s.users },
        presences: { ...s.presences, ...presences },
        voice: { ...s.voice, ...(voice || {}) },
      };
    });
  });

  socket.on('server:update', (srv) => set((s) => (s.servers[srv.id] ? { servers: { ...s.servers, [srv.id]: { ...s.servers[srv.id], ...srv } } } : {})));

  socket.on('role:update', (role) => set((s) => {
    const srv = s.servers[role.serverId];
    if (!srv) return {};
    return { servers: { ...s.servers, [srv.id]: { ...srv, roles: { ...srv.roles, [role.id]: role } } } };
  }));
  socket.on('role:delete', ({ id, serverId }) => set((s) => {
    const srv = s.servers[serverId];
    if (!srv) return {};
    const roles = { ...srv.roles };
    delete roles[id];
    return { servers: { ...s.servers, [serverId]: { ...srv, roles } } };
  }));

  socket.on('streak:update', ({ channelId, streak }) => set((s) => (s.channels[channelId] ? { channels: { ...s.channels, [channelId]: { ...s.channels[channelId], streak } } } : {})));

  socket.on('story:create', ({ story, user }) => set((s) => ({ stories: { ...s.stories, [story.id]: story }, users: { ...s.users, [user.id]: user } })));
  socket.on('story:delete', ({ id }) => set((s) => {
    const stories = { ...s.stories };
    delete stories[id];
    return { stories };
  }));
  socket.on('story:view', ({ storyId }) => set((s) => (s.stories[storyId] ? { stories: { ...s.stories, [storyId]: { ...s.stories[storyId], viewCount: (s.stories[storyId].viewCount || 0) + 1 } } } : {})));

  socket.on('quests:update', (q) => set((s) => ({ quests: { ...s.quests, ...q, loadedAt: Date.now() } })));

  socket.on('claim:update', ({ claim, user }) => {
    const prev = get().claims[claim.id];
    set((s) => ({ claims: { ...s.claims, [claim.id]: claim }, users: { ...s.users, [user.id]: user } }));
    const me = get().me.id;
    if (!prev && claim.status === 'pending' && claim.toId === me) {
      sounds.friend();
      toast(`🔒 ${user.displayName} möchte dich claimen – schau in „Freunde → Ausstehend“`, 'friend', 6000);
    }
    if (prev?.status === 'pending' && claim.status === 'active') toast(`🔒 Claim mit ${user.displayName} ist aktiv!`, 'success');
  });
  socket.on('claim:remove', ({ id, by, status }) => {
    const c = get().claims[id];
    set((s) => {
      const claims = { ...s.claims };
      delete claims[id];
      return { claims };
    });
    if (c && by !== get().me.id) toast(status === 'active' ? '🔓 Der Claim wurde beendet' : '🔓 Claim-Anfrage abgelehnt', 'info');
  });

  socket.on('channel:ai', ({ channelId, ai }) => set((s) => (s.channels[channelId] ? { channels: { ...s.channels, [channelId]: { ...s.channels[channelId], ai } } } : {})));
  socket.on('ai:notice', ({ text }) => toast(text, 'info', 6000));
  socket.on('app:config', ({ aiEnabled, aiModel, discordLogin, discordBridge }) => {
    set((s) => ({ ai: { ...s.ai, enabled: aiEnabled, model: aiModel }, discordLogin, discordBridge }));
    api('/ai/status').then((ai) => set({ ai })).catch(() => {});
  });
  socket.on('sound:create', (snd) => set((s) => (s.sounds.some((x) => x.id === snd.id) ? {} : { sounds: [...s.sounds, snd] })));
  socket.on('sound:delete', ({ id }) => set((s) => ({ sounds: s.sounds.filter((x) => x.id !== id) })));
  socket.on('sound:play', (p) => window.dispatchEvent(new CustomEvent('zync:sound', { detail: p })));

  socket.on('server:delete', ({ id }) => {
    const wasViewing = get().view.serverId === id;
    set((s) => {
      const servers = { ...s.servers };
      delete servers[id];
      const channels = Object.fromEntries(Object.entries(s.channels).filter(([, c]) => c.serverId !== id));
      return { servers, channels, serverOrder: s.serverOrder.filter((x) => x !== id) };
    });
    if (wasViewing) openHome();
  });

  socket.on('member:add', ({ member, user, status }) => set((s) => {
    const srv = s.servers[member.serverId];
    if (!srv) return {};
    return {
      servers: { ...s.servers, [srv.id]: { ...srv, members: { ...srv.members, [member.userId]: member } } },
      users: { ...s.users, [user.id]: user },
      presences: { ...s.presences, [user.id]: status },
    };
  }));
  socket.on('member:update', (member) => set((s) => {
    const srv = s.servers[member.serverId];
    if (!srv) return {};
    return { servers: { ...s.servers, [srv.id]: { ...srv, members: { ...srv.members, [member.userId]: member } } } };
  }));
  socket.on('member:remove', ({ serverId, userId }) => set((s) => {
    const srv = s.servers[serverId];
    if (!srv) return {};
    const members = { ...srv.members };
    delete members[userId];
    return { servers: { ...s.servers, [serverId]: { ...srv, members } } };
  }));

  socket.on('channel:create', (c) => set((s) => ({ channels: { ...s.channels, [c.id]: c } })));
  socket.on('channel:update', (c) => set((s) => ({ channels: { ...s.channels, [c.id]: { ...s.channels[c.id], ...c } } })));
  socket.on('channel:delete', ({ id, serverId }) => {
    set((s) => {
      const channels = { ...s.channels };
      delete channels[id];
      return { channels };
    });
    if (get().view.channelId === id) openServer(serverId);
  });

  socket.on('voice:update', ({ channelId, userId, state }) => {
    set((s) => {
      const room = { ...(s.voice[channelId] || {}) };
      if (state) room[userId] = state; else delete room[userId];
      const voice = { ...s.voice };
      if (Object.keys(room).length) voice[channelId] = room; else delete voice[channelId];
      return { voice };
    });
  });

  socket.on('sticker:create', (st) => set((s) => (s.stickers.some((x) => x.id === st.id) ? {} : { stickers: [...s.stickers, st] })));
  socket.on('sticker:delete', ({ id }) => set((s) => ({ stickers: s.stickers.filter((x) => x.id !== id) })));

  socket.on('call:ring', ({ channelId, from }) => {
    if (get().me.status === 'dnd') return;
    window.dispatchEvent(new CustomEvent('zync:ring', { detail: { channelId, from } }));
  });
  socket.on('call:ended', ({ channelId }) => {
    if (get().incomingCall?.channelId === channelId) {
      stopRinging();
      set({ incomingCall: null });
    }
  });
  socket.on('call:declined', ({ channelId, userId }) => {
    const s = get();
    if (userId === s.me.id) {
      if (s.incomingCall?.channelId === channelId) { stopRinging(); set({ incomingCall: null }); }
      return;
    }
    toast(`📵 ${displayName(s, userId)} hat den Anruf abgelehnt`, 'info');
  });
}

export function showIncomingCall(channelId, from) {
  set({ incomingCall: { channelId, from } });
  startRinging();
}
export function dismissIncomingCall(decline = true) {
  const call = get().incomingCall;
  stopRinging();
  set({ incomingCall: null });
  if (decline && call) socket?.emit('call:decline', { channelId: call.channelId });
}

let lastTypingSent = 0;
export function sendTyping(channelId) {
  if (!useSettings.getState().sendTyping) return;
  const now = Date.now();
  if (now - lastTypingSent < 5000) return;
  lastTypingSent = now;
  socket?.emit('typing', { channelId });
}
export const resetTypingThrottle = () => { lastTypingSent = 0; };

setInterval(() => {
  const s = get();
  const now = Date.now();
  let changed = false;
  const typing = {};
  for (const [cid, users] of Object.entries(s.typing)) {
    const keep = Object.fromEntries(Object.entries(users).filter(([, exp]) => exp > now));
    if (Object.keys(keep).length !== Object.keys(users).length) changed = true;
    if (Object.keys(keep).length) typing[cid] = keep;
  }
  if (changed) set({ typing });
}, 1000);

// ---------- Aktionen mit Feedback ----------
export async function run(fn, success) {
  try {
    const r = await fn();
    if (success) toast(success, 'success');
    return r;
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

export const meId = () => get().me?.id;
