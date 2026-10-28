import { useEffect, useRef } from 'react';
import { useStore } from './store.js';

/*
 * Zurück-Taste/-Geste am Handy (Android-App, PWA, Browser): schließt die oberste
 * offene Ebene (Fenster, Profil, Chat …), statt die App zu verlassen.
 * Solange etwas offen ist, liegt genau ein Platzhalter-Eintrag in der History.
 */
const stack = [];
let guard = false;
let skipPop = 0;
let queued = false;

function sync() {
  queued = false;
  const want = stack.length > 0 && useStore.getState().isMobile;
  if (want && !guard) {
    history.pushState({ zyncBack: true }, '');
    guard = true;
  } else if (!want && guard) {
    guard = false;
    skipPop++;
    history.back();
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  setTimeout(sync, 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (skipPop) { skipPop--; return; }
    guard = false;
    stack[stack.length - 1]?.current();
    schedule();
  });
}

/** Solange `active` wahr ist, schließt die Zurück-Taste diese Ebene über `onBack`. */
export function useBackHandler(active, onBack) {
  const ref = useRef(onBack);
  useEffect(() => { ref.current = onBack; });
  useEffect(() => {
    if (!active) return undefined;
    stack.push(ref);
    schedule();
    return () => {
      const i = stack.lastIndexOf(ref);
      if (i >= 0) stack.splice(i, 1);
      schedule();
    };
  }, [active]);
}
