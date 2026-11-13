# Covermaker Optimierungen – Design

Datum: 2026-11-12
Status: Vom Auftraggeber zur Umsetzung freigegeben

## Ziel und Rahmen

Der Covermaker soll Entwürfe zuverlässig lokal sichern, Layout-Probleme vor dem
Export zeigen, wiederholte Exporte beschleunigen und einen lokalen Handoff an
`../postprod/postprod.sh` ermöglichen. Die App bleibt vollständig statisch,
backendfrei und deterministisch. Bestehende Seeds und Artwork-Geometrie bleiben
unverändert.

## Gewählte Ansätze

1. **Zusammenpassende Modularisierung statt Framework-Wechsel.**
   Reine Daten-, Layout-, Speicher-, Export- und Handoff-Funktionen erhalten
   fokussierte TypeScript-Module und Tests. React rendert weiterhin die SVGs;
   kein serverseitiger Renderer und keine neue Runtime-Dependency.
2. **Vollständiger lokaler Draft statt getrennter, unbemerkter Teilzustände.**
   Episode und aktiver Preset werden versioniert gemeinsam gespeichert. Ältere
   Drafts und Presets bleiben lesbar. Fehler werden sichtbar gemeldet; vor
   der Wiederherstellung überschreibt kein Effekt den gespeicherten Draft.
3. **Messbasierte Hinweise statt harter Export-Sperre.**
   Titel, Untertitel und Tag werden anhand der tatsächlich geladenen Fonts
   vermessen. Formatbedingte Umbrüche und Kollisionen erzeugen Warnungen;
   der Nutzer behält die Exportkontrolle.
4. **Browser-Handoff statt Scheinausführung.**
   Die statische App kann das lokale Bash-Skript nicht starten. Sie erzeugt
   deshalb einen kopierbaren Befehl samt Cover-Dateinamen und übernimmt
   `ep`/`episode` sowie `titel`/`title` als vorbelegende Queryparameter.

## Umsetzung

- Hochgeladene Bilder als JPEG oder PNG mit maximal 1024 × 1024 Pixeln
  normalisieren; vorhandene Base64-Bilder beim ersten Speichern komprimieren,
  damit alte Drafts wieder unter die lokale Speicherquote passen können.
- Draft-Schema v5 mit Episode und aktivem Preset, gespeichertem At-Zeitstempel
  und normalisierten, validierten Werten. Legacy-v4-Episode migrieren.
- Speichern erst nach Hydratation; eine Meldung unterscheidet „gespeichert“
  und „nicht speicherbar“. Ungültige Inhalte und Quota-Fehler sind sichtbar.
- Ein gemeinsamer Layout-Prüfer verwendet Canvas-Textmessung mit den realen
  Fontfamilien. Er prüft alle fünf Formate, Untertitelbreite, Tagbreite und
  den verfügbaren vertikalen Bereich. Ergebnis pro Format: Hinweise, keine
  stillschweigende Eingabeabschneidung. Lange Wörter werden umgebrochen.
- Export: eingebettete Ressourcen pro Sitzung cachen, Klicks während eines
  Exports sperren, Fehler differenzieren. Ein Batch-Export lädt die fünf
  Artworks nacheinander herunter und meldet fehlgeschlagene Formate separat.
- TypeScript-Konfiguration von Cloudflare-Resten befreien; `npm run check`
  bündelt Tests, Typecheck, Lint und Build; CI führt diesen Check aus.
  Vorschau ausschließlich über einen echten statischen Server aus
  `dist/client/`, nicht über die dynamische Vite/vinext-Renderpipeline.
- Vorhandene Beispiel-/Hostfotos verlustarm dimensionieren und als WebP
  ausliefern; nur Einstiegsbilder preloaden. Rendering gemäßigt memoizieren
  und experimentelle Browser-Toolregistrierung entkoppeln.
- Handoff-Panel mit Anleitung, kopierbarem Befehl und Pfad-Hinweis:
  `./postprod.sh 217 /pfad/zum/video.mp4 --titel '…' --cover /pfad/zum/allesokai-ep217-square-preset-v2.png`.
  Query-Werte werden auf bestehende Episode-Grenzen validiert; fehlende
  Queryparameter lassen den Draft unverändert.

## Nicht-Ziele

- Kein Backend, keine Netzwerkübertragung von Draft/Bildern/Metadaten.
- Kein automatisches Starten von Postprod im Browser, kein Dateisystemzugriff.
- Kein neues Cover-Design und keine Modell-/Metadatausführung im Covermaker.
- Kein Upgrade von vinext oder sonstigen Plattform-Dependencies.

## Verifikation

Unit-Tests für deterministische Seeds, Migration, Speicher-/Bildfehler,
Textgrenzen, Ressourcen-Cache, Exportfehlerkorrelation, URL- und Shell-Handoff.
Browser-Smoke-Tests über localStorage/Reload, Query-Vorausfüllung, reale PNG-
Exporte sowie Desktop-/Mobil-Darstellung. Abschließend `npm run check`.
