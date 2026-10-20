# Seiten hinter der Anmeldung, aber OHNE den Kopf des Portals

Der Kopf hängt im Layout von `src/app/(portal)/`. Was hier liegt, bekommt ihn nicht – die
Adresse bleibt dieselbe (Ordner in runden Klammern erscheinen nicht in der Adresse).

- `vorlagen/vorschau/[id]` – Vorschau des Personalfragebogens. Sie zeigt den Fragebogen so, wie
  ihn die Person über ihren Link sieht; eine Portal-Navigation darüber verfälschte das Bild.
  Den Zugang regelt wie bisher die Middleware (`/vorlagen` nur für HR-Leitung und Super-Admin).

Eine neue Seite gehört nur hierher, wenn sie das Portal bewusst NICHT zeigen soll.
