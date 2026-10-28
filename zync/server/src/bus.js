// Interner Ereignis-Bus: entkoppelt Nachrichten-Logik von KI, Zync-Helfer und Discord-Brücke.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);
