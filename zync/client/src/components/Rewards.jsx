import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Gift, ShoppingBag, Backpack, Check, Lock, Sparkles, Clock, Coins } from 'lucide-react';
import { useStore, toast, loadQuests } from '../lib/store.js';
import { api } from '../lib/api.js';
import { cx } from '../lib/format.js';
import { sounds } from '../lib/sounds.js';
import { Avatar, NameTag } from './Avatar.jsx';
import { EffectLayer } from './ProfileCard.jsx';
import { Spinner } from './ui.jsx';

export const CATEGORY = {
  decoration: { name: 'Avatar-Dekos', icon: '💫' },
  effect: { name: 'Profil-Effekte', icon: '✨' },
  nameEffect: { name: 'Namens-Effekte', icon: '🌈' },
  nameFont: { name: 'Schriften', icon: '🔤' },
  nameplate: { name: 'Namensschilder', icon: '🏷️' },
  frame: { name: 'Profilrahmen', icon: '🖼️' },
};

let shopCache = null;
export async function loadShop(force = false) {
  if (shopCache && !force) return shopCache;
  shopCache = await api('/shop');
  return shopCache;
}

export function PointsChip({ onClick, large }) {
  const points = useStore((s) => s.me?.points ?? 0);
  return (
    <button type="button" className={cx('points-chip', large && 'large')} onClick={onClick} data-tip="Deine Zync-Punkte">
      <span className="coin">🪙</span>
      <b>{points.toLocaleString('de-DE')}</b>
    </button>
  );
}

export function claimableCount(quests) {
  if (!quests) return 0;
  return quests.quests.filter((q) => q.progress >= q.goal && !q.claimed).length + (quests.quests.every((q) => q.claimed) && !quests.bonusClaimed ? 1 : 0);
}

export function ItemPreview({ item, user }) {
  const u = { ...user, style: { ...user.style, nameColor: user.style?.nameColor || '#ffffff' } };
  switch (item.type) {
    case 'decoration': return <Avatar user={{ ...u, style: { ...u.style, decoration: item.value } }} size={64} />;
    case 'effect': return <div className="ip-effect" style={{ '--p1': u.style.accent1 || '#7c5cff', '--p2': u.style.accent2 || '#00d4ff' }}><EffectLayer effect={item.value} /></div>;
    case 'nameEffect': return <NameTag user={{ ...u, style: { ...u.style, nameEffect: item.value } }} className="ip-name" />;
    case 'nameFont': return <NameTag user={{ ...u, style: { ...u.style, nameFont: item.value } }} className="ip-name" />;
    case 'nameplate': return <div className={cx('ip-plate np', `np-${item.value}`)}><Avatar user={user} size={28} decoration={false} /><span>{user.displayName}</span></div>;
    case 'frame': return <div className={cx('ip-frame profile-card', `frame-${item.value}`)} style={{ '--p1': u.style.accent1 || '#7c5cff', '--p2': u.style.accent2 || '#00d4ff' }}><div className="pc-inner"><Avatar user={user} size={34} decoration={false} /></div>{item.value === 'wings' && <><span className="wing left" /><span className="wing right" /></>}</div>;
    default: return null;
  }
}

function Quests() {
  const quests = useStore((s) => s.quests);
  const [busy, setBusy] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    loadQuests();
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!quests) return <div className="msg-loading"><Spinner size={28} /></div>;
  const claim = async (id) => {
    setBusy(id);
    try {
      const d = await api(`/quests/${id}/claim`, { method: 'POST' });
      useStore.setState({ quests: { ...d, loadedAt: Date.now() } });
      sounds.friend();
      const pts = id === 'bonus' ? d.bonus : quests.quests.find((q) => q.id === id)?.points;
      toast(`+${pts} Punkte 🪙`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const left = Math.max(0, quests.resetIn - (Date.now() - quests.loadedAt));
  const hours = Math.floor(left / 3_600_000);
  const mins = Math.floor((left % 3_600_000) / 60_000);
  const done = quests.quests.filter((q) => q.claimed).length;
  const allClaimed = quests.quests.every((q) => q.claimed);
  return (
    <div className="quests">
      <div className="quests-head">
        <div>
          <h3>Tägliche Aufgaben</h3>
          <span className="muted"><Clock size={13} /> Neue Aufgaben in {hours} Std. {mins} Min.</span>
        </div>
        <div className="q-ring" style={{ '--pct': `${(done / quests.quests.length) * 100}%` }}><span>{done}/{quests.quests.length}</span></div>
      </div>
      <div className="quest-list">
        {quests.quests.map((q) => {
          const ready = q.progress >= q.goal && !q.claimed;
          return (
            <div key={q.id} className={cx('quest', q.claimed && 'claimed', ready && 'ready')}>
              <div className="q-icon">{q.icon}</div>
              <div className="q-main">
                <div className="q-title"><b>{q.name}</b><span className="q-pts">🪙 {q.points}</span></div>
                <span className="q-desc">{q.desc}</span>
                <div className="q-bar"><i style={{ width: `${(q.progress / q.goal) * 100}%` }} /></div>
                <span className="q-count">{q.progress}/{q.goal}</span>
              </div>
              {q.claimed ? <span className="q-done"><Check size={18} /></span>
                : <button type="button" className={cx('btn sm', ready ? 'primary' : 'secondary')} disabled={!ready || busy === q.id} onClick={() => claim(q.id)}>{busy === q.id ? <Spinner size={14} /> : 'Einsammeln'}</button>}
            </div>
          );
        })}
        <div className={cx('quest bonus', allClaimed && !quests.bonusClaimed && 'ready', quests.bonusClaimed && 'claimed')}>
          <div className="q-icon">🏆</div>
          <div className="q-main">
            <div className="q-title"><b>Alles erledigt!</b><span className="q-pts">🪙 {quests.bonus}</span></div>
            <span className="q-desc">Bonus, wenn du alle Aufgaben des Tages eingesammelt hast</span>
          </div>
          {quests.bonusClaimed ? <span className="q-done"><Check size={18} /></span>
            : <button type="button" className={cx('btn sm', allClaimed ? 'primary' : 'secondary')} disabled={!allClaimed || busy === 'bonus'} onClick={() => claim('bonus')}>Bonus holen</button>}
        </div>
      </div>
    </div>
  );
}

function Shop({ inventory }) {
  const me = useStore((s) => s.me);
  const [shop, setShop] = useState(null);
  const [cat, setCat] = useState('all');
  const [busy, setBusy] = useState(null);
  useEffect(() => { loadShop(true).then(setShop).catch((e) => toast(e.message, 'error')); }, []);
  const owned = useMemo(() => new Set(me.owned || shop?.owned || []), [me.owned, shop]);
  if (!shop) return <div className="msg-loading"><Spinner size={28} /></div>;
  const items = shop.catalog.filter((i) => (cat === 'all' || i.type === cat) && (!inventory || owned.has(i.id)) && (inventory || i.price > 0 || cat !== 'all'));
  const buy = async (item) => {
    setBusy(item.id);
    try {
      await api(`/shop/${item.id}/buy`, { method: 'POST' });
      sounds.streamStart();
      toast(`${CATEGORY[item.type].icon} „${item.name}“ freigeschaltet!`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const equip = async (item, on) => {
    setBusy(item.id);
    try {
      await api('/me', { method: 'PATCH', body: { style: { ...me.style, [item.type]: on ? item.value : '' } } });
      toast(on ? `„${item.name}“ angelegt ✨` : 'Abgelegt', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  return (
    <div className="shop">
      <div className="chip-row shop-cats">
        <button type="button" className={cx('chip', cat === 'all' && 'active')} onClick={() => setCat('all')}>{inventory ? 'Alles' : '⭐ Highlights'}</button>
        {Object.entries(CATEGORY).map(([id, c]) => <button key={id} type="button" className={cx('chip', cat === id && 'active')} onClick={() => setCat(id)}>{c.icon} {c.name}</button>)}
      </div>
      {items.length === 0 && <div className="empty-state small">{inventory ? 'Hier ist noch nichts – sammle Punkte und hol dir was im Shop! 🛍️' : 'Nichts gefunden'}</div>}
      <div className="shop-grid">
        {items.map((item) => {
          const has = owned.has(item.id);
          const equipped = me.style?.[item.type] === item.value;
          const affordable = me.points >= item.price;
          return (
            <div key={item.id} className={cx('shop-item', has && 'owned', equipped && 'equipped', `cat-${item.type}`)}>
              <div className="si-preview"><ItemPreview item={item} user={me} /></div>
              <div className="si-info">
                <span className="si-cat">{CATEGORY[item.type].icon} {CATEGORY[item.type].name}</span>
                <b>{item.name}</b>
              </div>
              {has ? (
                <button type="button" className={cx('btn sm block', equipped ? 'ghost' : 'secondary')} disabled={busy === item.id} onClick={() => equip(item, !equipped)}>
                  {equipped ? <><Check size={14} /> Angelegt</> : 'Anlegen'}
                </button>
              ) : (
                <button type="button" className={cx('btn sm block', affordable ? 'primary' : 'secondary')} disabled={!affordable || busy === item.id} onClick={() => buy(item)}>
                  {affordable ? <>🪙 {item.price} · Kaufen</> : <><Lock size={13} /> 🪙 {item.price}</>}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RewardsView() {
  const view = useStore((s) => s.view);
  const tab = view.tab || 'quests';
  const setTab = (t) => useStore.setState((s) => ({ view: { ...s.view, tab: t } }));
  return (
    <div className="rewards-view">
      <header className="chat-header">
        <button type="button" className="icon-btn mobile-only" onClick={() => useStore.setState({ mobilePane: 'nav' })} aria-label="Zurück"><ArrowLeft size={22} /></button>
        <div className="ch-title"><Gift size={22} /><div className="ch-name">Belohnungen</div></div>
        <PointsChip />
      </header>
      <div className="rewards-scroll">
        <div className="rewards-hero">
          <div>
            <h1><Sparkles size={26} /> Spiel dich frei</h1>
            <p>Erledige tägliche Aufgaben, sammle 🪙 Punkte und schalte Cosmetics frei. <b>Alles ist kostenlos erspielbar – kein Echtgeld, kein Pay2Win.</b></p>
          </div>
          <div className="rh-coin"><Coins size={54} /></div>
        </div>
        <div className="segmented rewards-tabs">
          <button type="button" className={cx(tab === 'quests' && 'active')} onClick={() => setTab('quests')}><Gift size={15} /> Aufgaben</button>
          <button type="button" className={cx(tab === 'shop' && 'active')} onClick={() => setTab('shop')}><ShoppingBag size={15} /> Shop</button>
          <button type="button" className={cx(tab === 'inventory' && 'active')} onClick={() => setTab('inventory')}><Backpack size={15} /> Inventar</button>
        </div>
        {tab === 'quests' && <Quests />}
        {tab === 'shop' && <Shop key="shop" />}
        {tab === 'inventory' && <Shop key="inv" inventory />}
      </div>
    </div>
  );
}
