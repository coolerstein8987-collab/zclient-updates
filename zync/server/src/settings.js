// App-weite Einstellungen, die der Owner in Zync selbst setzt (Umgebungsvariablen haben Vorrang).
import { q } from './db.js';
import { OWNERS } from './config.js';

const ENV = {
  'ai.key': 'ANTHROPIC_API_KEY',
  'ai.model': 'ZYNC_AI_MODEL',
  'ai.limit': 'ZYNC_AI_DAILY_LIMIT',
  'discord.clientId': 'ZYNC_DISCORD_CLIENT_ID',
  'discord.clientSecret': 'ZYNC_DISCORD_CLIENT_SECRET',
  'discord.botToken': 'ZYNC_DISCORD_BOT_TOKEN',
};

export const fromEnv = (key) => !!(ENV[key] && process.env[ENV[key]]);

export function getSetting(key, fallback = '') {
  if (fromEnv(key)) return process.env[ENV[key]];
  return q.get('SELECT value FROM app_settings WHERE key = ?', key)?.value ?? fallback;
}

export function setSetting(key, value) {
  if (value === null || value === undefined || value === '') q.run('DELETE FROM app_settings WHERE key = ?', key);
  else q.run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}

export const isOwner = (user) => !!user && !user.bot && OWNERS.includes(String(user.username).toLowerCase());

/** Geheimnis nur angedeutet zurückgeben (…abcd). */
export const hint = (secret) => (secret ? `…${String(secret).slice(-4)}` : '');
