// Nachrichten im Namen eines Accounts (auch System-Accounts) speichern und an alle verteilen.
import { q, newId, serializeMessages } from './db.js';
import { emitToChannel } from './realtime.js';
import { bus } from './bus.js';

/**
 * @param {object} ch Kanal-Zeile aus der Datenbank
 * @param {string} authorId
 * @param {{ content?: string, type?: string, meta?: object, attachments?: object[], replyTo?: string, sticker?: string, attach?: (id: string) => void }} m
 */
export function postMessage(ch, authorId, { content = '', type = 'default', meta = null, attachments = [], replyTo = null, sticker = null, attach = null } = {}) {
  const id = newId();
  q.run(
    'INSERT INTO messages (id, channel_id, author_id, content, attachments, sticker, reply_to, type, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, ch.id, authorId, content.slice(0, 4000), JSON.stringify(attachments), sticker, replyTo, type, meta ? JSON.stringify(meta) : null, Date.now(),
  );
  // z. B. Umfrage-Daten speichern, bevor die Nachricht verteilt wird
  attach?.(id);
  const msg = serializeMessages([q.get('SELECT * FROM messages WHERE id = ?', id)])[0];
  emitToChannel(ch, 'message:create', msg);
  bus.emit('message', { ch, msg, authorId });
  return msg;
}

/** Nachricht aktualisieren (z. B. Umfrage-Stand) und neu verteilen. */
export function refreshMessage(ch, id) {
  const row = q.get('SELECT * FROM messages WHERE id = ?', id);
  if (!row) return null;
  const msg = serializeMessages([row])[0];
  emitToChannel(ch, 'message:update', msg);
  return msg;
}
