// Startpunkt: erst ggf. den letzten Stand aus der Sicherung holen, dann Zync starten
// (die Datenbank wird beim Import von db.js geöffnet, deshalb der dynamische Import).
import { restoreBackup } from './backup.js';

await restoreBackup();
await import('./server.js');
