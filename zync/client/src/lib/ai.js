// Zync KI im Client: Antworten streamen, private KI-Chats nur auf diesem Gerät speichern.
import { create } from 'zustand';
import { getToken, api } from './api.js';
import { useStore } from './store.js';

/** Fragt die KI und liefert den Text Stück für Stück an `onDelta`. */
export async function askAi(body, { onDelta, signal } = {}) {
  let res;
  try {
    res = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Keine Verbindung zum Server');
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    refreshAiStatus();
    throw new Error(d.error || `Fehler ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: '));
      buf = buf.slice(i + 2);
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.t === 'delta') {
        full += ev.text;
        onDelta?.(ev.text, full);
      } else if (ev.t === 'done') {
        if (ev.status) useStore.setState({ ai: ev.status });
        return { text: full, truncated: ev.truncated };
      } else if (ev.t === 'refusal') {
        throw Object.assign(new Error(ev.message), { refusal: true });
      } else if (ev.t === 'error') {
        refreshAiStatus();
        throw new Error(ev.message);
      }
    }
  }
  return { text: full };
}

export function refreshAiStatus() {
  api('/ai/status').then((ai) => useStore.setState({ ai })).catch(() => {});
}

// ---------- Private KI-Chats (nur lokal) ----------
const keyFor = (uid) => `zync.ai.${uid}`;
const PREFS = 'zync.ai.prefs';
const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* voll oder privat */ } };

export const useAiChats = create(() => ({ uid: null, chats: [], activeId: null, prefs: read(PREFS, { keepHistory: true }) }));

export function loadAiChats(uid) {
  if (useAiChats.getState().uid === uid) return;
  const { keepHistory } = useAiChats.getState().prefs;
  const chats = keepHistory ? read(keyFor(uid), []) : [];
  useAiChats.setState({ uid, chats, activeId: chats[0]?.id || null });
}

function persist() {
  const { uid, chats, prefs } = useAiChats.getState();
  if (!uid) return;
  if (prefs.keepHistory) write(keyFor(uid), chats.slice(0, 50));
  else { try { localStorage.removeItem(keyFor(uid)); } catch { /* egal */ } }
}

export function setAiPrefs(p) {
  useAiChats.setState((s) => ({ prefs: { ...s.prefs, ...p } }));
  write(PREFS, useAiChats.getState().prefs);
  persist();
}

export function newAiChat() {
  const chat = { id: Math.random().toString(36).slice(2, 10), title: 'Neuer Chat', messages: [], updatedAt: Date.now() };
  useAiChats.setState((s) => ({ chats: [chat, ...s.chats.filter((c) => c.messages.length)], activeId: chat.id }));
  return chat.id;
}

export function updateAiChat(id, fn) {
  useAiChats.setState((s) => ({
    chats: s.chats.map((c) => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c)).sort((a, b) => b.updatedAt - a.updatedAt),
  }));
  persist();
}

export function deleteAiChat(id) {
  useAiChats.setState((s) => {
    const chats = s.chats.filter((c) => c.id !== id);
    return { chats, activeId: s.activeId === id ? chats[0]?.id || null : s.activeId };
  });
  persist();
}

export function clearAiChats() {
  useAiChats.setState({ chats: [], activeId: null });
  persist();
}

/** Nachricht an die KI schicken und die Antwort live in den Chat schreiben. */
export async function sendAiMessage(chatId, content, { voice = false, signal, onDelta } = {}) {
  updateAiChat(chatId, (c) => ({
    ...c,
    title: c.messages.length ? c.title : content.slice(0, 48),
    messages: [...c.messages, { role: 'user', content, at: Date.now() }, { role: 'assistant', content: '', at: Date.now(), streaming: true }],
  }));
  const history = useAiChats.getState().chats.find((c) => c.id === chatId).messages
    .filter((m) => !m.streaming && !m.error)
    .map(({ role, content: text }) => ({ role, content: text }));
  const setLast = (patch) => updateAiChat(chatId, (c) => ({ ...c, messages: [...c.messages.slice(0, -1), { ...c.messages.at(-1), ...patch }] }));
  try {
    const { text } = await askAi({ mode: 'chat', messages: history, voice }, {
      signal,
      onDelta: (d, full) => { setLast({ content: full }); onDelta?.(d, full); },
    });
    setLast({ content: text, streaming: false });
    return text;
  } catch (e) {
    if (e.name === 'AbortError') {
      setLast({ streaming: false });
      return null;
    }
    setLast({ content: e.message, streaming: false, error: true });
    throw e;
  }
}

// ---------- Übersetzungen von Chat-Nachrichten (nur im Speicher) ----------
export const useTranslations = create(() => ({}));

export async function translateMessage(msg, to = 'Deutsch') {
  const cur = useTranslations.getState()[msg.id];
  if (cur?.text) {
    useTranslations.setState({ [msg.id]: { ...cur, hidden: !cur.hidden } });
    return;
  }
  useTranslations.setState({ [msg.id]: { loading: true, text: '' } });
  try {
    const { text } = await askAi({ mode: 'translate', text: msg.content, to }, {
      onDelta: (d, full) => useTranslations.setState({ [msg.id]: { loading: true, text: full } }),
    });
    useTranslations.setState({ [msg.id]: { text, to } });
  } catch (e) {
    useTranslations.setState({ [msg.id]: { error: e.message } });
  }
}

/** Nachrichten eines Kanals als Auszug für die KI (Name + Text). */
export function excerptOf(channelId, untilId, count = 10) {
  const s = useStore.getState();
  const list = s.messages[channelId] || [];
  const idx = untilId ? list.findIndex((m) => m.id === untilId) : list.length - 1;
  return list.slice(Math.max(0, idx - count + 1), idx + 1)
    .filter((m) => m.type === 'default' || !m.type)
    .map((m) => ({
      name: m.meta?.name || s.users[m.authorId]?.displayName || 'Jemand',
      text: [m.content, m.sticker && '[Sticker]', ...(m.attachments || []).map((a) => (a.voice ? `[Sprachnachricht${a.transcript ? `: „${a.transcript}“` : ''}]` : `[Datei: ${a.name}]`))].filter(Boolean).join(' '),
      time: new Date(m.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    }));
}
