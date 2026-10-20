# Sketchle

Sketchle ist ein browserbasiertes Zeichenspiel. Erstelle einen Spielraum, lade andere ein und zeichne gemeinsam zu vorgegebenen Begriffen.

## Lokal starten

Voraussetzungen: Node.js, npm und PostgreSQL.

1. Erstelle im Projektverzeichnis eine `.env`-Datei mit den nötigen Einstellungen:

   ```env
   DATABASE_URL=postgresql://benutzer:passwort@localhost:5432/sketchle
   JWT_SECRET=ein-geheimer-schluessel
   OPENAI_API_KEY=dein-openai-api-schluessel
   ```

2. Installiere die Abhängigkeiten und initialisiere die Datenbank:

   ```bash
   npm install
   npm run db:init
   ```

3. Starte Weboberfläche und Server:

   ```bash
   npm run dev:full
   ```

Die Weboberfläche läuft lokal mit Vite. Der Server verwendet standardmässig Port `4000`.

## Weitere Befehle

- `npm run dev` – nur die Weboberfläche starten
- `npm start` – nur den Server starten
- `npm run build` – Produktionsversion erstellen
- `npm run preview` – Produktionsversion lokal ansehen
