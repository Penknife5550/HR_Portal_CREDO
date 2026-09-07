import type { Config } from "jest";

const config: Config = {
  // KEIN `preset: "ts-jest"`. Das Preset besteht ausschliesslich aus einem
  // einzigen Transform-Eintrag `"^.+\\.tsx?$": ["ts-jest", {}]` — und genau der
  // stand dem Umbau im Weg: Jest legt die Preset-Eintraege VOR die eigenen und
  // nimmt den ersten passenden Treffer. Das Preset-Muster erfasst mit `tsx?`
  // auch `.tsx`, also uebersetzte es die Komponententests weiter mit der
  // App-tsconfig (`"jsx": "preserve"`), waehrend der eigene `.tsx`-Eintrag
  // unten wirkungslos blieb. Ergebnis: unuebersetztes JSX im Jest-Lauf und ein
  // "SyntaxError: Unexpected token '<'".
  //
  // Die beiden Eintraege unter `transform` ersetzen das Preset vollstaendig —
  // es steuerte nichts anderes bei.
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  transform: {
    // GENAU EIN Eintrag fuer .ts und .tsx. Das ist die Lehre aus zwei
    // Fehlversuchen und gehoert deshalb aufgeschrieben:
    //
    // Zuerst standen hier zwei Eintraege — ".ts" mit der App-tsconfig, ".tsx"
    // mit einer eigenen tsconfig.jest.json, die nur "jsx" ueberschrieb. Der
    // Gedanke: Der bestehende .ts-Zweig bleibt woertlich, wie er war. Das
    // Ergebnis: Im vollen Lauf (73 Suiten) fiel bei KALTEM Cache reproduzierbar
    // eine der beiden .tsx-Suiten mit "SyntaxError: Unexpected token '<'" um —
    // unuebersetztes JSX. Dieselbe Datei einzeln aufgerufen: gruen. Derselbe
    // Lauf mit warmem Cache: gruen. Also genau die Sorte Fehler, die auf dem
    // Entwicklerrechner nie auftritt und in CI (immer kalter Cache) jedes Mal.
    //
    // Der zweite Versuch — dieselben zwei Eintraege, die JSX-Option nur inline
    // statt in einer Datei — half NICHT. Damit war die naheliegende Erklaerung
    // (der Dateiverweis fehlt im Cache-Schluessel) widerlegt. Was tatsaechlich
    // half, war, den zweiten Eintrag ganz aufzugeben: Sobald ts-jest in einem
    // Lauf nur noch EINE Konfiguration sieht, uebersetzt es alles gleich.
    // Warum zwei Konfigurationen fuer denselben Transformer sich beissen, ist
    // damit nicht erklaert — belegt ist nur, dass sie es tun. Wer hier wieder
    // aufteilt, holt sich den Fehler zurueck; er zeigt sich erst nach
    // "npx jest --clearCache" im VOLLEN Lauf.
    //
    // "jsx": "react-jsx" schadet den Server-Tests nicht: .ts-Dateien enthalten
    // kein JSX, die Option laeuft dort ins Leere. Die App selbst bleibt
    // unberuehrt auf "jsx": "preserve" (tsconfig.json) — dort uebersetzt der
    // Next-Compiler das JSX selbst, und genau deshalb reichte ts-jest es
    // ungewandelt an Jest durch, solange nichts es hier ueberschrieb.
    //
    // SO BEGINNT EIN KOMPONENTENTEST. Die Umgebung wird je Datei im Docblock
    // gewaehlt, nicht global — deshalb bleibt testEnvironment oben auf "node",
    // und alle Server-Tests laufen unveraendert weiter:
    //
    //   /**
    //    * @jest-environment jsdom
    //    */
    //   import { render, screen } from "@testing-library/react";
    //   import { MeineKomponente } from "@/components/meine-komponente";
    //
    // Die Pakete dafuer (@testing-library/react, jest-environment-jsdom)
    // liegen bereits in den devDependencies. @testing-library/jest-dom ist
    // bewusst NICHT eingebunden: Das braeuchte ein setupFilesAfterEnv in
    // dieser geteilten Datei und wuerde auf ALLE Suiten wirken. Bis dahin
    // kommen Zusicherungen mit textContent, queryByText(...) === null und
    // den nativen DOM-Eigenschaften aus.
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
};

export default config;
