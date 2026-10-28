import { useEffect, useMemo, useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, X, Check } from 'lucide-react';
import { useStore, run, toast, closeModal, openModal } from '../lib/store.js';
import { api } from '../lib/api.js';
import { PERM_INFO, PERMS } from '../lib/perm.js';
import { cx } from '../lib/format.js';
import { Field, Switch, Modal } from './ui.jsx';
import { Avatar, NameTag } from './Avatar.jsx';
import { ServerTagChip } from './Social.jsx';

const ROLE_COLORS = ['#99aab5', '#f43f5e', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ffffff'];

export function RolesSettings({ serverId }) {
  const server = useStore((s) => s.servers[serverId]);
  const me = useStore((s) => s.me);
  const users = useStore((s) => s.users);
  const roles = useMemo(() => Object.values(server?.roles || {}).sort((a, b) => b.position - a.position), [server]);
  const [selected, setSelected] = useState(roles[0]?.id || null);
  const role = server?.roles?.[selected];
  const [draft, setDraft] = useState(null);
  const [addUser, setAddUser] = useState('');
  useEffect(() => { setDraft(role ? { name: role.name, color: role.color || '#99aab5', icon: role.icon || '', hoist: role.hoist, permissions: role.permissions } : null); }, [role]);
  if (!server) return null;
  const isOwner = server.members[me.id]?.role === 'owner';
  const create = async () => {
    try {
      const r = await api(`/servers/${serverId}/roles`, { method: 'POST', body: { name: 'Neue Rolle', color: ROLE_COLORS[(roles.length * 3) % ROLE_COLORS.length] } });
      setSelected(r.id);
    } catch (e) { toast(e.message, 'error'); }
  };
  const dirty = role && draft && (draft.name !== role.name || draft.color !== (role.color || '#99aab5') || draft.icon !== (role.icon || '') || draft.hoist !== role.hoist || draft.permissions !== role.permissions);
  const save = () => run(() => api(`/roles/${role.id}`, { method: 'PATCH', body: draft }), 'Rolle gespeichert ✅').catch(() => {});
  const move = (idx, dir) => {
    const ids = roles.map((r) => r.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    run(() => api(`/servers/${serverId}/roles/reorder`, { method: 'POST', body: { ids } })).catch(() => {});
  };
  const holders = role ? Object.values(server.members).filter((m) => m.roles?.includes(role.id)) : [];
  const candidates = role ? Object.values(server.members).filter((m) => !m.roles?.includes(role.id) && m.role !== 'owner') : [];
  const togglePerm = (bit) => setDraft((d) => ({ ...d, permissions: d.permissions ^ bit }));

  return (
    <div className="roles-layout">
      <div className="roles-list">
        <button type="button" className="btn primary sm block" onClick={create}><Plus size={15} /> Rolle erstellen</button>
        {roles.length === 0 && <p className="muted roles-empty">Noch keine Rollen. Rollen geben Mitgliedern Farben, eigene Gruppen in der Mitgliederliste und Rechte.</p>}
        {roles.map((r, i) => (
          <div key={r.id} className={cx('role-item', selected === r.id && 'active')} onClick={() => setSelected(r.id)} role="button" tabIndex={0}>
            <i className="rp-dot" style={{ background: r.color || '#99aab5' }} />
            <span className="ri-name">{r.icon} {r.name}</span>
            <span className="ri-count">{Object.values(server.members).filter((m) => m.roles?.includes(r.id)).length}</span>
            <span className="ri-move">
              <button type="button" onClick={(e) => { e.stopPropagation(); move(i, -1); }} disabled={i === 0} aria-label="Höher"><ArrowUp size={13} /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); move(i, 1); }} disabled={i === roles.length - 1} aria-label="Tiefer"><ArrowDown size={13} /></button>
            </span>
          </div>
        ))}
      </div>
      {role && draft ? (
        <div className="role-editor">
          <div className="re-preview">
            <Avatar userId={me.id} size={36} decoration={false} />
            <div>
              <span className="re-name" style={{ color: draft.color }}>{users[me.id]?.displayName}</span>
              <span className="role-pill" style={{ '--rc': draft.color }}><i className="rp-dot" />{draft.icon && <span>{draft.icon}</span>}{draft.name || 'Rolle'}</span>
            </div>
          </div>
          <div className="grid-vibe">
            <Field label="Icon"><input className="input center" value={draft.icon} maxLength={4} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder="⭐" /></Field>
            <Field label="Rollenname"><input className="input" value={draft.name} maxLength={32} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          </div>
          <div className="sub-label">Farbe</div>
          <div className="role-colors">
            {ROLE_COLORS.map((c) => <button key={c} type="button" className={cx(draft.color === c && 'active')} style={{ background: c }} onClick={() => setDraft({ ...draft, color: c })} aria-label={c} />)}
            <label className="swatch-custom big"><input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
          </div>
          <Switch checked={draft.hoist} onChange={(v) => setDraft({ ...draft, hoist: v })} label="Separat in der Mitgliederliste anzeigen" desc="Mitglieder mit dieser Rolle bekommen eine eigene Gruppe." />
          <div className="sub-label">Rechte</div>
          {PERM_INFO.filter((p) => isOwner || p.bit !== PERMS.ADMIN).map((p) => (
            <Switch key={p.bit} checked={!!(draft.permissions & p.bit)} onChange={() => togglePerm(p.bit)} label={p.name} desc={p.desc} />
          ))}
          <div className="sub-label">Mitglieder mit dieser Rolle ({holders.length})</div>
          <div className="role-members">
            {holders.map((m) => (
              <span key={m.userId} className="rm-chip">
                <Avatar userId={m.userId} size={20} decoration={false} /><NameTag userId={m.userId} serverId={serverId} />
                <button type="button" onClick={() => run(() => api(`/roles/${role.id}/members/${m.userId}`, { method: 'DELETE' })).catch(() => {})} aria-label="Entfernen"><X size={12} /></button>
              </span>
            ))}
            {candidates.length > 0 && (
              <select className="input rm-add" value={addUser} onChange={(e) => { const v = e.target.value; setAddUser(''); if (v) run(() => api(`/roles/${role.id}/members/${v}`, { method: 'PUT' })).catch(() => {}); }}>
                <option value="">+ Mitglied hinzufügen</option>
                {candidates.map((m) => <option key={m.userId} value={m.userId}>{users[m.userId]?.displayName}</option>)}
              </select>
            )}
          </div>
          <div className="re-actions">
            <button type="button" className="btn danger-ghost sm" onClick={() => openModal('confirm', { title: `Rolle „${role.name}“ löschen?`, text: 'Alle Mitglieder verlieren diese Rolle.', confirm: 'Löschen', danger: true, onConfirm: () => run(() => api(`/roles/${role.id}`, { method: 'DELETE' }), 'Rolle gelöscht').then(() => setSelected(null)) })}><Trash2 size={14} /> Löschen</button>
          </div>
          {dirty && (
            <div className="save-bar">
              <span>Ungespeicherte Änderungen an der Rolle</span>
              <button type="button" className="btn ghost sm" onClick={() => setDraft({ name: role.name, color: role.color || '#99aab5', icon: role.icon || '', hoist: role.hoist, permissions: role.permissions })}>Zurücksetzen</button>
              <button type="button" className="btn success sm" onClick={save}>Speichern</button>
            </div>
          )}
        </div>
      ) : <div className="role-editor empty"><div className="empty-art">🏷️</div><p className="muted">Wähle links eine Rolle aus oder erstelle eine neue.</p></div>}
    </div>
  );
}

export function TagSettings({ serverId }) {
  const server = useStore((s) => s.servers[serverId]);
  const me = useStore((s) => s.users[s.me.id]);
  const [form, setForm] = useState(() => ({ on: !!server?.tag, text: server?.tag?.text || (server?.name || '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 4).toUpperCase(), emoji: server?.tag?.emoji || '✨', color: server?.tag?.color || server?.accent || '#7c5cff' }));
  if (!server) return null;
  const preview = { text: form.text.toUpperCase() || 'TAG', emoji: form.emoji, color: form.color, serverName: server.name };
  const save = () => run(() => api(`/servers/${serverId}`, { method: 'PATCH', body: { tag: form.on ? { text: form.text, emoji: form.emoji, color: form.color } : null } }), form.on ? 'Server-Tag gespeichert 🏷️' : 'Server-Tag deaktiviert').catch(() => {});
  const wear = () => run(() => api('/me', { method: 'PATCH', body: { tagServer: serverId } }), 'Du trägst jetzt den Tag ✨').catch(() => {});
  return (
    <div className="tag-settings">
      <p className="section-desc">Mit einem Server-Tag zeigen Mitglieder auf ihrem Profil und neben ihrem Namen, zu welcher Community sie gehören. Andere können auf den Tag klicken, den Server ansehen und – wenn er öffentlich ist – direkt beitreten.</p>
      <Switch checked={form.on} onChange={(v) => setForm({ ...form, on: v })} label="Server-Tag aktivieren" />
      {form.on && (
        <>
          <div className="grid-vibe">
            <Field label="Emoji"><input className="input center" value={form.emoji} maxLength={4} onChange={(e) => setForm({ ...form, emoji: e.target.value })} /></Field>
            <Field label="Tag (2–4 Zeichen)"><input className="input" value={form.text} maxLength={4} onChange={(e) => setForm({ ...form, text: e.target.value.toUpperCase() })} placeholder="HXH" /></Field>
          </div>
          <div className="sub-label">Farbe</div>
          <div className="role-colors">
            {ROLE_COLORS.slice(1).map((c) => <button key={c} type="button" className={cx(form.color === c && 'active')} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={c} />)}
            <label className="swatch-custom big"><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
          </div>
          <div className="tag-preview">
            <span className="muted">Vorschau</span>
            <div className="tp-line"><Avatar userId={me.id} size={32} decoration={false} /><b>{me.displayName}</b><ServerTagChip tag={preview} interactive={false} /></div>
          </div>
        </>
      )}
      <div className="modal-actions">
        {server.tag && me.serverTag?.serverId !== serverId && <button type="button" className="btn secondary" onClick={wear}><Check size={15} /> Tag selbst tragen</button>}
        <button type="button" className="btn primary" onClick={save}>Speichern</button>
      </div>
    </div>
  );
}

export function MemberRolesModal({ serverId, userId }) {
  const server = useStore((s) => s.servers[serverId]);
  const user = useStore((s) => s.users[userId]);
  if (!server) return null;
  const member = server.members[userId];
  const roles = Object.values(server.roles || {}).sort((a, b) => b.position - a.position);
  const toggle = (r) => run(() => api(`/roles/${r.id}/members/${userId}`, { method: member.roles?.includes(r.id) ? 'DELETE' : 'PUT' })).catch(() => {});
  return (
    <Modal onClose={closeModal} title="Rollen verwalten" subtitle={user?.displayName} width={400}>
      <div className="member-roles">
        {roles.map((r) => {
          const has = member?.roles?.includes(r.id);
          return (
            <button key={r.id} type="button" className={cx('mr-role', has && 'on')} onClick={() => toggle(r)} style={{ '--rc': r.color || '#99aab5' }}>
              <i className="rp-dot" />
              <span>{r.icon} {r.name}</span>
              <span className="mr-check">{has && <Check size={14} />}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
