# Sketchle

Sketchle ist ein browserbasiertes Zeichenspiel für private Gruppen. Die Spielleitung erstellt einen Spielraum mit einem sechsstelligen Code. Eine Partie kann mit **1 bis 10 angemeldeten Personen** gespielt werden. In drei Runden zeichnen alle dasselbe Stichwort jeweils 45 Sekunden lang. Die Zeichnungen werden nach Ablauf der Zeit automatisch abgegeben, von der OpenAI-Bild-KI bewertet und anschliessend gemeinsam mit den Rundenergebnissen und der Schlussrangliste angezeigt.

## Umfang der ersten Version

Enthalten:

- Registrierung und Anmeldung mit Benutzername und Passwort
- Spielraum-Codes mit sechs Zeichen, maximal zehn Personen und Start durch die Spielleitung
- Drei vom Server gesteuerte Runden mit je 45 Sekunden
- Touchfreundliche Zeichenfläche mit acht Farben, Radierer und einstellbarer Strichstärke
- Rückgängig- und Leeren-Funktion
- Manuelle und automatische Abgabe als PNG, KI-Punktzahl und kurze Rückmeldung
- Auswertung jeder Runde und Schlussrangliste

Nicht enthalten sind Profile, Zeichen- oder Spielverlauf, eine globale Rangliste und tägliche Herausforderungen.

## Voraussetzungen und lokale Einrichtung

- Node.js und npm
- PostgreSQL
- Ein OpenAI-API-Schlüssel mit Zugriff auf die Bildauswertung

1. `.env.example` nach `.env` kopieren und `DATABASE_URL`, `JWT_SECRET` sowie `OPENAI_API_KEY` eintragen.
2. Abhängigkeiten mit `npm install` installieren.
3. Datenbanktabellen mit `npm run db:init` anlegen.
4. Weboberfläche und Server gemeinsam mit `npm run dev:full` starten.

Die Weboberfläche wird lokal von Vite bereitgestellt. Die API und Socket.IO laufen standardmässig auf Port `4000`. Die Weboberfläche verwendet `VITE_API_URL` und `VITE_SOCKET_URL` aus `.env`, um den Server zu erreichen. Für eine gehostete Anwendung müssen diese Variablen auf die öffentlich erreichbare Serveradresse zeigen; danach muss die Weboberfläche neu gebaut werden.

## Befehle

- `npm run dev` — nur die Weboberfläche starten
- `npm run dev:full` — Weboberfläche und Server gemeinsam starten
- `npm run build` — Weboberfläche für die Veröffentlichung bauen
- `npm run preview` — den fertigen Build lokal ansehen
- `npm start` — den Server starten
- `npm run db:init` — PostgreSQL-Tabellen anlegen

Aktive Spielräume und Zeitmesser werden vorübergehend im Arbeitsspeicher des Servers gehalten. Daher zunächst nur eine Serverinstanz betreiben. PostgreSQL speichert Benutzer, Spielräume, Runden und abgegebene Zeichnungen. Für die KI-Bewertung wird der konfigurierte OpenAI-Schlüssel benötigt.
