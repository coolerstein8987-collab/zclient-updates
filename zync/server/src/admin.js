// Zync-Verwaltung: nur der Owner trägt hier KI-Schlüssel und Discord-Zugangsdaten ein.
import express from 'express';
import { getSetting, setSetting, fromEnv, isOwner, hint } from './settings.js';
import { AI_MODELS, aiConfig } from './ai.js';
import { fail, wrap, text } from './http.js';
import { emitToAll } from './realtime.js';
import { bus } from './bus.js';

export const admin = express.Router();

// Rechte, die der Discord-Bot für die Brücke braucht:
// Kanäle sehen, Nachrichten senden/lesen, Links & Dateien einbetten, Webhooks verwalten
export const DISCORD_BOT_PERMS = (1n << 10n) | (1n << 11n) | (1n << 14n) | (1n << 15n) | (1n << 16n) | (1n << 29n);

export const publicBase = (req) => (process.env.ZYNC_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

function view(req) {
  const ai = aiConfig();
  const clientId = getSetting('discord.clientId');
  return {
    ai: {
      hasKey: !!ai.key,
      keyHint: hint(ai.key),
      keyFromEnv: fromEnv('ai.key'),
      model: ai.model,
      models: AI_MODELS,
      limit: ai.limit,
      enabled: getSetting('ai.enabled', '1') !== '0',
    },
    discord: {
      clientId,
      hasSecret: !!getSetting('discord.clientSecret'),
      secretFromEnv: fromEnv('discord.clientSecret'),
      hasBotToken: !!getSetting('discord.botToken'),
      botFromEnv: fromEnv('discord.botToken'),
      redirectUri: `${publicBase(req)}/api/auth/discord/callback`,
      botInvite: clientId ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${DISCORD_BOT_PERMS}&scope=bot` : '',
    },
  };
}

admin.use('/admin', (req, res, next) => (isOwner(req.user) ? next() : next(Object.assign(new Error('Nur für den Owner von Zync'), { status: 403 }))));

admin.get('/admin/settings', wrap((req) => view(req)));

admin.patch('/admin/settings', wrap((req) => {
  const { ai = {}, discord = {} } = req.body || {};
  if (ai.key !== undefined) {
    const key = ai.key === null ? '' : text(ai.key, 300);
    if (key && !/^sk-ant-[\w-]{10,}$/.test(key)) fail(400, 'Das sieht nicht wie ein Anthropic-Schlüssel aus (beginnt mit „sk-ant-“).');
    setSetting('ai.key', key);
  }
  if (ai.model !== undefined) {
    if (!AI_MODELS.some((m) => m.id === ai.model)) fail(400, 'Unbekanntes Modell');
    setSetting('ai.model', ai.model);
  }
  if (ai.limit !== undefined) setSetting('ai.limit', String(Math.min(10_000, Math.max(0, Math.round(Number(ai.limit) || 0)))));
  if (ai.enabled !== undefined) setSetting('ai.enabled', ai.enabled ? '1' : '0');
  if (discord.clientId !== undefined) {
    const id = text(discord.clientId || '', 30);
    if (id && !/^\d{15,25}$/.test(id)) fail(400, 'Die Discord Client-ID besteht nur aus Ziffern');
    setSetting('discord.clientId', id);
  }
  if (discord.clientSecret !== undefined) setSetting('discord.clientSecret', discord.clientSecret === null ? '' : text(discord.clientSecret, 200));
  if (discord.botToken !== undefined) setSetting('discord.botToken', discord.botToken === null ? '' : text(discord.botToken, 200));
  // Alle offenen Zync-Fenster sofort informieren (KI an/aus, Discord-Login verfügbar)
  const cfg = aiConfig();
  emitToAll('app:config', {
    aiEnabled: cfg.enabled,
    aiModel: AI_MODELS.find((m) => m.id === cfg.model)?.label || cfg.model,
    discordLogin: !!(getSetting('discord.clientId') && getSetting('discord.clientSecret')),
    discordBridge: !!getSetting('discord.botToken'),
  });
  bus.emit('config');
  return view(req);
}));
