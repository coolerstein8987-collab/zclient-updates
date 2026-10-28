import { useEffect, useRef, useState } from 'react';
import { Home, Users, CircleUser, Settings, LogOut, Pencil, Hash, Gift } from 'lucide-react';
import {
  useStore, bootstrap, openModal, closeModal, closeSettings, showIncomingCall, openSettings, logout, openHome, isUnread, openRewards, SPECIAL_VIEWS,
} from './lib/store.js';
import { useBackHandler } from './lib/back.js';
import { MobileAppButton } from './components/GetApp.jsx';
import { api } from './lib/api.js';
import { playSoundboard } from './lib/sounds.js';
import { RewardsView } from './components/Rewards.jsx';
import { StoryViewer } from './components/Stories.jsx';
import { AiView } from './components/Ai.jsx';
import { handleDiscordReturn } from './components/Discord.jsx';
import { loadBirthdays, confetti } from './components/Extras.jsx';
import { useSettings, matchesShortcut, applySettings } from './lib/settings.js';
import { voice, useVoice } from './lib/voice.js';
import { unlockAudio } from './lib/sounds.js';
import { cx } from './lib/format.js';
import { Background } from './components/Background.jsx';
import { Auth } from './components/Auth.jsx';
import { ServerRail, HomeSidebar, ServerSidebar } from './components/Navigation.jsx';
import { ChatView } from './components/ChatView.jsx';
import { FriendsView } from './components/FriendsView.jsx';
import { DiscoverView } from './components/DiscoverView.jsx';
import { VoiceRoom } from './components/Call.jsx';
import { ModalHost } from './components/Modals.jsx';
import { ContextMenu, Lightbox, Toasts, IncomingCall, QuickSwitcher, ScreenPicker, TooltipLayer } from './components/Overlays.jsx';
import { ProfilePopout, ProfileCard } from './components/ProfileCard.jsx';
import { SettingsModal } from './components/settings/SettingsModal.jsx';
import { Logo } from './components/Logo.jsx';
import { Avatar } from './components/Avatar.jsx';
import { Spinner } from './components/ui.jsx';

function useIsMobile() {
  const layout = useSettings((s) => s.layout);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 820px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return layout === 'mobile' || (layout === 'auto' && narrow);
}

function MainContent() {
  const view = useStore((s) => s.view);
  const channel = useStore((s) => (view.channelId ? s.channels[view.channelId] : null));
  if (view.serverId === 'discover') return <DiscoverView />;
  if (view.serverId === 'rewards') return <RewardsView />;
  if (view.serverId === 'ai') return <AiView />;
  if (!view.serverId) return channel ? <ChatView key={channel.id} channel={channel} /> : <FriendsView />;
  if (!channel) {
    return (
      <div className="empty-main">
        <Hash size={48} />
        <h2>Kein Kanal ausgewählt</h2>
        <p className="muted">Wähle links einen Kanal aus oder erstelle einen neuen.</p>
      </div>
    );
  }
  if (channel.type === 'voice') return <VoiceRoom key={channel.id} channel={channel} />;
  return <ChatView key={channel.id} channel={channel} />;
}

function Sidebar() {
  const serverId = useStore((s) => s.view.serverId);
  return serverId && !SPECIAL_VIEWS.includes(serverId) ? <ServerSidebar serverId={serverId} /> : <HomeSidebar />;
}

function TitleBar() {
  const appIcon = useSettings((s) => s.appIcon);
  if (!window.zyncDesktop) return null;
  return <div className="titlebar"><Logo variant={appIcon} size={16} /><span>Zync</span></div>;
}

function MobileMe() {
  const me = useStore((s) => s.me);
  return (
    <div className="mobile-me">
      <ProfileCard userId={me.id} actions={false} />
      <div className="mm-actions">
        <button type="button" className="mm-btn" onClick={() => openModal('customStatus')}><Pencil size={20} /> Status festlegen</button>
        <button type="button" className="mm-btn" onClick={() => openSettings('profile')}><CircleUser size={20} /> Profil bearbeiten</button>
        <button type="button" className="mm-btn" onClick={() => openRewards()}><Gift size={20} /> Belohnungen <span className="mm-points">🪙 {me.points}</span></button>
        <button type="button" className="mm-btn" onClick={() => openSettings('appearance')}><Settings size={20} /> Einstellungen</button>
        <MobileAppButton />
        <button type="button" className="mm-btn danger" onClick={() => openModal('confirm', { title: 'Abmelden?', text: 'Bis bald! 👋', confirm: 'Abmelden', danger: true, onConfirm: logout })}><LogOut size={20} /> Abmelden</button>
      </div>
    </div>
  );
}

function MobileLayout() {
  const pane = useStore((s) => s.mobilePane);
  const tab = useStore((s) => s.mobileTab);
  const me = useStore((s) => s.me);
  const pending = useStore((s) => Object.values(s.relationships).filter((r) => r.type === 3).length);
  const unreadDm = useStore((s) => Object.values(s.channels).some((c) => c.type === 'dm' && (s.mentions[c.id] || 0) > 0 && isUnread(s, c.id)));
  const setTab = (t) => useStore.setState({ mobileTab: t });
  const swipe = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    swipe.current = t.clientX < 32 ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (t.clientX - start.x > 80 && Math.abs(t.clientY - start.y) < 60) useStore.setState({ mobilePane: 'nav' });
  };
  return (
    <div className={cx('app-shell mobile', `pane-${pane}`)}>
      <div className="m-nav">
        <div className="m-nav-content">
          {tab === 'servers' && <div className="m-servers"><ServerRail /><Sidebar /></div>}
          {tab === 'friends' && <FriendsView />}
          {tab === 'me' && <MobileMe />}
        </div>
        <nav className="m-tabbar">
          <button type="button" className={cx(tab === 'servers' && 'active')} onClick={() => setTab('servers')}><Home size={22} /><span>Server</span>{unreadDm && <i className="m-dot" />}</button>
          <button type="button" className={cx(tab === 'friends' && 'active')} onClick={() => { setTab('friends'); openHome(); useStore.setState({ mobilePane: 'nav' }); }}><Users size={22} /><span>Freunde</span>{pending > 0 && <i className="m-dot" />}</button>
          <button type="button" className={cx(tab === 'me' && 'active')} onClick={() => setTab('me')}><Avatar userId={me.id} size={24} decoration={false} /><span>Ich</span></button>
        </nav>
      </div>
      <div className="m-main" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}><MainContent /></div>
    </div>
  );
}

/** Zurück-Taste am Handy: zuerst Overlays schließen, dann zurück zur Übersicht. */
function BackHandlers() {
  const otherTab = useStore((s) => s.mobilePane === 'nav' && s.mobileTab !== 'servers');
  const inMain = useStore((s) => s.mobilePane !== 'nav');
  const settings = useStore((s) => !!s.settings);
  const modal = useStore((s) => !!s.modal);
  const lightbox = useStore((s) => !!s.lightbox);
  const overlay = useStore((s) => !!(s.popout || s.menu));
  useBackHandler(otherTab, () => useStore.setState({ mobileTab: 'servers' }));
  useBackHandler(inMain, () => useStore.setState({ mobilePane: 'nav' }));
  useBackHandler(settings, closeSettings);
  useBackHandler(modal, closeModal);
  useBackHandler(lightbox, () => useStore.setState({ lightbox: null }));
  useBackHandler(overlay, () => useStore.setState({ popout: null, menu: null }));
  return null;
}

function DesktopLayout() {
  return (
    <div className="app-shell desktop">
      <ServerRail />
      <Sidebar />
      <main className="main-panel"><MainContent /></main>
    </div>
  );
}

function useGlobalEffects() {
  const ready = useStore((s) => s.ready);
  useEffect(() => {
    applySettings();
    const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
    const m = /^\/invite\/([\w-]+)/.exec(location.pathname);
    if (m) {
      sessionStorage.setItem('zync.pendingInvite', m[1]);
      history.replaceState(null, '', '/');
    }
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
    handleDiscordReturn();
    const party = () => confetti();
    window.addEventListener('zync:confetti', party);
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    loadBirthdays({ greet: true });
    const code = sessionStorage.getItem('zync.pendingInvite');
    if (code) {
      sessionStorage.removeItem('zync.pendingInvite');
      openModal('joinInvite', { code });
    }
    const onKey = (e) => {
      const s = useSettings.getState();
      if (matchesShortcut(e, s.keySwitcher)) { e.preventDefault(); useStore.setState((st) => ({ switcherOpen: !st.switcherOpen })); }
      else if (matchesShortcut(e, s.keyMute)) { e.preventDefault(); voice.toggleMute(); }
      else if (matchesShortcut(e, s.keyDeafen)) { e.preventDefault(); voice.toggleDeafen(); }
    };
    const onSound = (e) => {
      const st = useSettings.getState();
      if (!st.soundboardEnabled || useVoice.getState().deafened) return;
      playSoundboard(e.detail.sound, (st.soundboardVolume / 100) * (st.outputVolume / 100));
    };
    window.addEventListener('zync:sound', onSound);
    // Desktop-App: erkannte Spiele als Aktivität melden
    const offGame = window.zyncDesktop?.onGame?.((name) => {
      if (!useSettings.getState().detectGames) return;
      api('/me/activity', { method: 'PATCH', body: { name: name || '', source: 'desktop' } }).catch(() => {});
    });
    const onRing = (e) => {
      const { channelId, from } = e.detail;
      if (useVoice.getState().channelId !== channelId) showIncomingCall(channelId, from);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('zync:ring', onRing);
    window.zyncDesktop?.onShortcut?.((name) => (name === 'mute' ? voice.toggleMute() : name === 'deafen' ? voice.toggleDeafen() : null));
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('zync:ring', onRing);
      window.removeEventListener('zync:sound', onSound);
      offGame?.();
    };
  }, [ready]);

  // Ungelesen-Zähler im Titel
  useEffect(() => useStore.subscribe((s) => {
    if (!s.ready) { document.title = 'Zync'; return; }
    const n = Object.values(s.mentions).reduce((a, b) => a + (b || 0), 0) + Object.values(s.relationships).filter((r) => r.type === 3).length;
    document.title = useSettings.getState().titleBadge && n ? `(${n}) Zync` : 'Zync';
    window.zyncDesktop?.setBadge?.(n);
  }), []);
}

export default function App() {
  const token = useStore((s) => s.token);
  const ready = useStore((s) => s.ready);
  const bootError = useStore((s) => s.bootError);
  const mobile = useIsMobile();
  useEffect(() => { useStore.setState({ isMobile: mobile }); }, [mobile]);
  const appIcon = useSettings((s) => s.appIcon);
  useGlobalEffects();

  useEffect(() => {
    if (token && !ready) bootstrap().catch(() => {});
  }, [token, ready]);

  return (
    <>
      <Background />
      <TitleBar />
      {!token ? <Auth /> : !ready ? (
        <div className="splash">
          <Logo variant={appIcon} size={88} className="splash-logo" />
          {bootError ? (
            <>
              <p>{bootError}</p>
              <button type="button" className="btn primary" onClick={() => bootstrap().catch(() => {})}>Erneut versuchen</button>
            </>
          ) : <><Spinner size={22} /><p className="muted">Zync lädt …</p></>}
        </div>
      ) : (
        <>
          {mobile ? <MobileLayout /> : <DesktopLayout />}
          <BackHandlers />
          <ModalHost />
          <SettingsModal />
          <ProfilePopout />
          <ContextMenu />
          <Lightbox />
          <IncomingCall />
          <QuickSwitcher />
          <ScreenPicker />
          <StoryViewer />
        </>
      )}
      <Toasts />
      <TooltipLayer />
    </>
  );
}
