// Punkte, tägliche Aufgaben, Cosmetics-Shop und Badges.
// Alles ist kostenlos erspielbar – kein Echtgeld, kein Pay2Win.
import { q, json } from './db.js';
import { OWNERS, dayKey } from './config.js';
import { emitToUser } from './realtime.js';

// ---------- Cosmetics-Katalog ----------
// price 0 = für alle frei. Werte entsprechen CSS-Klassen im Client.
export const CATALOG = [
  // Avatar-Dekorationen
  { id: 'deco:aurora', type: 'decoration', value: 'aurora', name: 'Aurora-Ring', price: 0 },
  { id: 'deco:neon', type: 'decoration', value: 'neon', name: 'Neon-Puls', price: 0 },
  { id: 'deco:halo', type: 'decoration', value: 'halo', name: 'Heiligenschein', price: 0 },
  { id: 'deco:orbit', type: 'decoration', value: 'orbit', name: 'Orbit', price: 150 },
  { id: 'deco:hearts', type: 'decoration', value: 'hearts', name: 'Herzen', price: 200 },
  { id: 'deco:catears', type: 'decoration', value: 'catears', name: 'Katzenohren', price: 250 },
  { id: 'deco:sakura', type: 'decoration', value: 'sakura', name: 'Sakura', price: 300 },
  { id: 'deco:fire', type: 'decoration', value: 'fire', name: 'Flammen', price: 400 },
  { id: 'deco:glitch', type: 'decoration', value: 'glitch', name: 'Glitch', price: 450 },
  { id: 'deco:crown', type: 'decoration', value: 'crown', name: 'Krone', price: 600 },
  { id: 'deco:lightning', type: 'decoration', value: 'lightning', name: 'Blitz', price: 650 },
  { id: 'deco:galaxy', type: 'decoration', value: 'galaxy', name: 'Galaxie', price: 800 },
  { id: 'deco:rainbow', type: 'decoration', value: 'rainbow', name: 'Regenbogen', price: 900 },
  // Profil-Effekte
  { id: 'fx:sparkles', type: 'effect', value: 'sparkles', name: 'Funkeln', price: 0 },
  { id: 'fx:snow', type: 'effect', value: 'snow', name: 'Schnee', price: 0 },
  { id: 'fx:bubbles', type: 'effect', value: 'bubbles', name: 'Blasen', price: 150 },
  { id: 'fx:hearts', type: 'effect', value: 'hearts', name: 'Herzen', price: 200 },
  { id: 'fx:stars', type: 'effect', value: 'stars', name: 'Sternenhimmel', price: 250 },
  { id: 'fx:petals', type: 'effect', value: 'petals', name: 'Kirschblüten', price: 300 },
  { id: 'fx:embers', type: 'effect', value: 'embers', name: 'Glut', price: 350 },
  { id: 'fx:confetti', type: 'effect', value: 'confetti', name: 'Konfetti', price: 400 },
  { id: 'fx:aurora', type: 'effect', value: 'aurora', name: 'Nordlicht', price: 600 },
  // Namens-Effekte
  { id: 'ne:glow', type: 'nameEffect', value: 'glow', name: 'Glühen', price: 0 },
  { id: 'ne:wave', type: 'nameEffect', value: 'wave', name: 'Welle', price: 0 },
  { id: 'ne:shimmer', type: 'nameEffect', value: 'shimmer', name: 'Schimmern', price: 200 },
  { id: 'ne:neon', type: 'nameEffect', value: 'neon', name: 'Neon-Röhre', price: 350 },
  { id: 'ne:rainbow', type: 'nameEffect', value: 'rainbow', name: 'Regenbogen', price: 500 },
  { id: 'ne:fire', type: 'nameEffect', value: 'fire', name: 'Feuer', price: 650 },
  // Namens-Schriften
  { id: 'nf:grotesk', type: 'nameFont', value: 'grotesk', name: 'Grotesk', price: 0 },
  { id: 'nf:serif', type: 'nameFont', value: 'serif', name: 'Elegant', price: 0 },
  { id: 'nf:mono', type: 'nameFont', value: 'mono', name: 'Mono', price: 0 },
  { id: 'nf:script', type: 'nameFont', value: 'script', name: 'Script', price: 150 },
  { id: 'nf:marker', type: 'nameFont', value: 'marker', name: 'Marker', price: 150 },
  { id: 'nf:pixel', type: 'nameFont', value: 'pixel', name: 'Pixel', price: 250 },
  // Namensschilder (Hintergrund in Mitglieder- und DM-Liste)
  { id: 'np:sunset', type: 'nameplate', value: 'sunset', name: 'Sunset', price: 200 },
  { id: 'np:ocean', type: 'nameplate', value: 'ocean', name: 'Ozean', price: 200 },
  { id: 'np:sakura', type: 'nameplate', value: 'sakura', name: 'Sakura', price: 300 },
  { id: 'np:matcha', type: 'nameplate', value: 'matcha', name: 'Matcha', price: 300 },
  { id: 'np:neon', type: 'nameplate', value: 'neon', name: 'Neon City', price: 450 },
  { id: 'np:gold', type: 'nameplate', value: 'gold', name: 'Gold', price: 700 },
  { id: 'np:galaxy', type: 'nameplate', value: 'galaxy', name: 'Galaxie', price: 900 },
  // Profilrahmen (Kartenrand)
  { id: 'pf:glass', type: 'frame', value: 'glass', name: 'Glas', price: 0 },
  { id: 'pf:pixel', type: 'frame', value: 'pixel', name: 'Pixel-Rand', price: 250 },
  { id: 'pf:lace', type: 'frame', value: 'lace', name: 'Spitze', price: 350 },
  { id: 'pf:wings', type: 'frame', value: 'wings', name: 'Engelsflügel', price: 600 },
  { id: 'pf:holo', type: 'frame', value: 'holo', name: 'Hologramm', price: 800 },
];

export const COSMETIC_TYPES = ['decoration', 'effect', 'nameEffect', 'nameFont', 'nameplate', 'frame'];

export function catalogItem(type, value) {
  return CATALOG.find((i) => i.type === type && i.value === value) || null;
}

export function ownedIds(userRow) {
  return new Set([...json(userRow.owned, []), ...CATALOG.filter((i) => i.price === 0).map((i) => i.id)]);
}

export function owns(userRow, type, value) {
  if (!value) return true;
  const it = catalogItem(type, value);
  if (!it) return false;
  return ownedIds(userRow).has(it.id);
}

// ---------- Tägliche Aufgaben ----------
export const QUESTS = [
  { id: 'login', icon: '👋', name: 'Täglicher Check-in', desc: 'Öffne Zync heute', goal: 1, points: 10 },
  { id: 'messages', icon: '💬', name: 'Plaudertasche', desc: 'Sende 15 Nachrichten', goal: 15, points: 25 },
  { id: 'react', icon: '😂', name: 'Reaktions-Profi', desc: 'Reagiere 5× auf Nachrichten', goal: 5, points: 15 },
  { id: 'voice', icon: '🎙️', name: 'Ab in den Call', desc: 'Verbringe 15 Minuten im Call', goal: 15, points: 35 },
  { id: 'streak', icon: '🔥', name: 'Feuer am Leben', desc: 'Halte eine Flamme mit jemandem am Leben', goal: 1, points: 20 },
  { id: 'story', icon: '📸', name: 'Story-Time', desc: 'Poste eine Story', goal: 1, points: 20 },
  { id: 'sticker', icon: '🧸', name: 'Sticker-Laune', desc: 'Sende 3 Sticker', goal: 3, points: 10 },
  { id: 'voicemsg', icon: '🎤', name: 'Sprachnachricht', desc: 'Sende eine Sprachnachricht', goal: 1, points: 15 },
];
export const ALL_DONE_BONUS = 50;

export function questState(userId) {
  const day = dayKey();
  const rows = Object.fromEntries(q.all('SELECT quest, progress, claimed FROM quests WHERE user_id = ? AND day = ?', userId, day).map((r) => [r.quest, r]));
  const quests = QUESTS.map((d) => ({ ...d, progress: Math.min(d.goal, rows[d.id]?.progress || 0), claimed: !!rows[d.id]?.claimed }));
  const bonus = rows._bonus ? !!rows._bonus.claimed : false;
  return { day, quests, bonusClaimed: bonus, bonus: ALL_DONE_BONUS };
}

export function progressQuest(userId, questId, amount = 1) {
  const def = QUESTS.find((d) => d.id === questId);
  if (!def || !userId) return;
  const day = dayKey();
  const row = q.get('SELECT progress FROM quests WHERE user_id = ? AND day = ? AND quest = ?', userId, day, questId);
  if (row && row.progress >= def.goal) return;
  q.run(
    `INSERT INTO quests (user_id, day, quest, progress) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day, quest) DO UPDATE SET progress = MIN(?, progress + ?)`,
    userId, day, questId, Math.min(def.goal, amount), def.goal, amount,
  );
  emitToUser(userId, 'quests:update', questState(userId));
}

export function addPoints(userId, amount) {
  q.run('UPDATE users SET points = points + ? WHERE id = ?', amount, userId);
}

// ---------- Statistiken & Badges ----------
const HOUR_STEPS = [1, 10, 50, 100, 250, 500, 1000, 2000, 4000];
const TIER_BY_STEP = ['bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'diamond', 'diamond', 'legend'];

function tierFor(value, steps = HOUR_STEPS) {
  let idx = -1;
  steps.forEach((s, i) => { if (value >= s) idx = i; });
  if (idx < 0) return { tier: null, next: steps[0] };
  const tiers = steps === HOUR_STEPS ? TIER_BY_STEP : ['bronze', 'silver', 'gold', 'diamond', 'legend', 'legend', 'legend'];
  return { tier: tiers[Math.min(idx, tiers.length - 1)], next: steps[idx + 1] ?? null, prev: steps[idx] };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function statsFor(u) {
  const play = q.get('SELECT COALESCE(SUM(seconds), 0) AS s, COUNT(*) AS n FROM playtime WHERE user_id = ?', u.id);
  return {
    days: Math.floor((Date.now() - u.created_at) / 86_400_000),
    voiceHours: Math.floor(u.voice_seconds / 360) / 10,
    playHours: Math.floor(play.s / 360) / 10,
    games: play.n,
    messages: u.msg_count,
    bestStreak: u.best_streak,
    questsDone: u.quests_done,
    stories: u.stories_posted,
    serversOwned: q.get('SELECT COUNT(*) AS n FROM servers WHERE owner_id = ?', u.id).n,
    cosmetics: json(u.owned, []).length,
    topGames: q.all('SELECT game, seconds FROM playtime WHERE user_id = ? ORDER BY seconds DESC LIMIT 6', u.id)
      .map((g) => ({ name: g.game, hours: Math.floor(g.seconds / 360) / 10 })),
  };
}

/** Alle Badge-Kategorien – erreichte mit Stufe, offene mit Fortschritt zum nächsten Ziel. */
export function badgesFor(u, stats = statsFor(u)) {
  const list = [];
  const push = (b) => list.push(b);
  if (OWNERS.includes(u.username.toLowerCase())) {
    push({ id: 'owner', icon: '👑', name: 'Zync Owner', desc: 'Gründer & Owner von Zync', tier: 'owner', earned: true });
  }
  const d = stats.days;
  const memberName = d < 1 ? 'Neu bei Zync' : d < 7 ? `Seit ${plural(d, 'Tag', 'Tagen')} dabei`
    : d < 30 ? `Seit ${plural(Math.floor(d / 7), 'Woche', 'Wochen')} dabei`
      : d < 365 ? `Seit ${plural(Math.floor(d / 30), 'Monat', 'Monaten')} dabei`
        : `Seit ${plural(Math.floor(d / 365), 'Jahr', 'Jahren')} dabei`;
  const mt = tierFor(d, [0, 7, 30, 182, 365, 730]);
  push({ id: 'member', icon: d >= 365 ? '🏆' : d >= 30 ? '🌳' : d >= 7 ? '🌿' : '🌱', name: memberName, desc: `Mitglied seit ${d} Tagen`, tier: mt.tier, earned: true, value: d, next: mt.next });

  const hourBadge = (id, icon, value, label, lockedName, desc) => {
    const t = tierFor(value);
    push({ id, icon, name: t.tier ? `${Math.floor(value).toLocaleString('de-DE')}h ${label}` : lockedName, desc, tier: t.tier, earned: !!t.tier, value, next: t.next });
  };
  hourBadge('voice', '🎙️', stats.voiceHours, 'im Call', 'Call-Veteran', 'Gesamtzeit in Sprachkanälen und Anrufen');
  hourBadge('play', '🎮', stats.playHours, 'gezockt', 'Gamer', 'Gesamte Spielzeit (Desktop-App oder Aktivität)');

  const gt = tierFor(stats.games, [1, 5, 10, 25, 67, 100]);
  push({ id: 'games', icon: '🧭', name: gt.tier ? `${stats.games} ${stats.games === 1 ? 'Spiel' : 'Spiele'} entdeckt` : 'Spiele-Entdecker', desc: 'Verschiedene Spiele gespielt', tier: gt.tier, earned: !!gt.tier, value: stats.games, next: gt.next });

  const msg = tierFor(stats.messages, [100, 1000, 5000, 10000, 50000]);
  push({ id: 'messages', icon: '💬', name: msg.tier ? `${stats.messages.toLocaleString('de-DE')} Nachrichten` : 'Plaudertasche', desc: 'Gesendete Nachrichten', tier: msg.tier, earned: !!msg.tier, value: stats.messages, next: msg.next });

  const st = tierFor(stats.bestStreak, [3, 7, 30, 100, 365]);
  push({ id: 'streak', icon: '🔥', name: st.tier ? `${stats.bestStreak}er-Flamme` : 'Flammenhüter', desc: 'Längste Flamme mit jemandem', tier: st.tier, earned: !!st.tier, value: stats.bestStreak, next: st.next });

  const qt = tierFor(stats.questsDone, [10, 50, 150, 365, 1000]);
  push({ id: 'quests', icon: '🎯', name: qt.tier ? `${stats.questsDone} Aufgaben erledigt` : 'Aufgaben-Jäger', desc: 'Erledigte tägliche Aufgaben', tier: qt.tier, earned: !!qt.tier, value: stats.questsDone, next: qt.next });

  const sv = tierFor(stats.stories, [1, 10, 50, 200]);
  push({ id: 'stories', icon: '📸', name: sv.tier ? `${stats.stories} Stories` : 'Storyteller', desc: 'Gepostete Stories', tier: sv.tier, earned: !!sv.tier, value: stats.stories, next: sv.next });

  const cs = tierFor(stats.cosmetics, [1, 5, 15, 30]);
  push({ id: 'collector', icon: '🛍️', name: cs.tier ? `${stats.cosmetics} Cosmetics` : 'Sammler', desc: 'Freigeschaltete Cosmetics', tier: cs.tier, earned: !!cs.tier, value: stats.cosmetics, next: cs.next });

  if (stats.serversOwned > 0) push({ id: 'founder', icon: '🏰', name: 'Server-Gründer', desc: `Besitzt ${plural(stats.serversOwned, 'Server', 'Server')}`, tier: 'gold', earned: true, value: stats.serversOwned });
  if (u.created_at < Date.UTC(2027, 0, 1)) push({ id: 'pioneer', icon: '🚀', name: 'Zync-Pionier', desc: 'War von Anfang an dabei', tier: 'diamond', earned: true });
  return list;
}

/** Kurze Liste für Profilkarten: nur erreichte Badges, wichtigste zuerst. */
export function topBadges(u) {
  return badgesFor(u).filter((b) => b.earned).map(({ id, icon, name, tier }) => ({ id, icon, name, tier }));
}
