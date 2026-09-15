# Hausplaner+

Installierbare Mobile-PWA zum Planen von Anschaffungen (Wunschliste) und
wiederkehrenden Fixkosten (Kredit, Versicherung, Strom, Wasser, Müllgebühren, …)
für zuhause. Kein Server, keine Build-Pipeline – reines HTML/CSS/JS.

## Wichtig: Datenspeicherung

Alle Daten liegen **ausschließlich lokal im Browser** des jeweiligen Geräts
(`localStorage`). Es gibt keine Cloud-Synchronisation. Um Daten zwischen
Geräten zu übertragen oder ein Backup zu erstellen, nutzt die App unter
**Einstellungen → Daten** den JSON-Export/-Import.

## Lokal testen

Service Worker (Offline-Fähigkeit) benötigen `http://` oder `https://` –
`file://` funktioniert nicht zuverlässig. Am einfachsten lokal mit einem
kleinen Webserver, z. B.:

```bash
npx serve .
```

oder mit Python:

```bash
python -m http.server 8080
```

Danach im Browser `http://localhost:8080` öffnen. Auf dem Handy über
"Zum Startbildschirm hinzufügen" installieren.

## Auf GitHub Pages veröffentlichen

1. Neues GitHub-Repository anlegen (oder bestehendes verwenden).
2. Inhalt dieses Ordners in das Repository pushen (Dateien liegen im Root,
   kein Build-Schritt nötig).
3. Im Repo unter **Settings → Pages** als Quelle den Branch (z. B. `main`)
   und Ordner `/ (root)` wählen.
4. Nach ein paar Minuten ist die App unter
   `https://<benutzername>.github.io/<repo-name>/` erreichbar und auf dem
   Handy installierbar.

> Falls das Repo nicht im Root von `github.io` liegt, ist `start_url` und
> `scope` in `manifest.webmanifest` (aktuell `./`) bereits relativ gesetzt
> und funktioniert automatisch mit dem Unterpfad.

## Icons

`icons/icon.svg` ist ein einfaches Platzhalter-Icon. Für optimale Darstellung
auf allen Plattformen (insbesondere ältere iOS-Versionen, die SVG-App-Icons
nicht unterstützen) empfiehlt es sich, zusätzlich PNG-Icons (192×192, 512×512)
zu erzeugen, z. B. über https://realfavicongenerator.net, und in
`manifest.webmanifest` sowie im `<link rel="apple-touch-icon">` zu ergänzen.

## Struktur

```
index.html            Markup, vier Bereiche + Bottom-Nav + Formular-Dialog
css/styles.css         Design-Tokens (Hell/Dunkel), WCAG-Fokus-/Kontraststile
js/store.js            Datenschicht: localStorage, CRUD, Export/Import
js/ui.js                Rendering der Listen/Dashboards
js/main.js              Navigation, Formular-Logik, Event-Wiring
manifest.webmanifest    PWA-Manifest
service-worker.js       Offline-Caching des App-Shells
icons/icon.svg          App-Icon
```

## Anpassbarkeit

- Kategorien (Name, Icon, Farbe) für Wunschliste und Fixkosten sind unter
  **Einstellungen** frei anlegbar, umbenennbar und löschbar.
- Jeder Wunschliste-Eintrag und jeder Fixkosten-Posten lässt sich über das
  Stift-Icon jederzeit nachträglich bearbeiten (Name, Beträge, Kategorie,
  Notiz, Priorität, Link).
- Ein Fixkosten-Posten kann optional als „Ratenzahlung/Kredit“ markiert
  werden (Gesamtsumme + bereits bezahlt) und zeigt dann einen
  Fortschrittsbalken.

## Barrierefreiheit (WCAG)

- Semantisches Markup, Landmarks, „Zum Inhalt springen“-Link.
- Alle Formularfelder mit `<label>`, Fehler mit `role="alert"`.
- Sichtbare Fokusringe (`:focus-visible`), Mindest-Touch-Ziel 44×44px.
- Farben in Hell/Dunkel auf AA-Kontrast geprüft; Priorität/Status nie nur
  über Farbe, sondern zusätzlich als Text/Badge codiert.
- `prefers-reduced-motion` wird respektiert.
- Native `<dialog>`-Elemente für Formulare (eingebauter Fokus-Trap, ESC
  schließt den Dialog).

## App-Version

Die aktuelle Version steht unter **Einstellungen → Über die App** und im
Quellcode in `js/store.js` (`APP_VERSION`). Bei Änderungen dort hochzählen.
