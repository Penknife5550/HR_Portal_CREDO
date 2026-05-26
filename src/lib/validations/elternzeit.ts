/**
 * Mutterschutz & Elternzeit – Zod-Validierungsschemas
 *
 * Phase 1 MVP — Anlage, Update, Public-Form (Token 1).
 */

import { z } from "zod";

// =============================================
// Mutterschutz
// =============================================

export const createMutterschutzSchema = z.object({
  employeeFirstName: z.string().min(1, "Vorname ist erforderlich").max(100),
  employeeLastName: z.string().min(1, "Nachname ist erforderlich").max(100),
  employeeEmail: z.string().email("Ungueltige E-Mail-Adresse"),
  employeePersonalNr: z.string().max(50).optional(),
  employeeId: z.string().uuid("Ungueltige Mitarbeiter-ID").optional(),
  organizationId: z.string().uuid("Ungueltige Einrichtungs-ID"),

  voraussGeburt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Datum im Format YYYY-MM-DD erforderlich"),
  einrichtungstyp: z.enum(["SCHULE", "KITA", "VERWALTUNG"]),
  badErforderlich: z.boolean().optional(),

  // Personalgruppe noetig für Checklisten-Filterung
  personalgruppe: z.enum(["TARIF_TV_L", "BEAMTER", "PLANSTELLENINHABER"]),
});

export const updateMutterschutzSchema = z
  .object({
    status: z
      .enum(["GEMELDET", "BAD_BEAUFTRAGT", "BAD_ABGESCHLOSSEN", "AKTIV", "BEENDET"])
      .optional(),
    voraussGeburt: z.string().optional(),
    tatsGeburt: z.string().optional().nullable(),
    fruehgeburt: z.boolean().optional(),
    mehrlinge: z.boolean().optional(),
    badBeauftragtAm: z.string().optional().nullable(),
    badAbgeschlossenAm: z.string().optional().nullable(),
    badErgebnis: z.string().max(2000).optional().nullable(),
    beschaeftigungsverbot: z.boolean().optional(),
    alternativeTaetigkeit: z.string().max(2000).optional().nullable(),
    lohnbeschKkErstelltAm: z.string().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, "Mindestens ein Feld erforderlich");

// =============================================
// Elternzeit
// =============================================

export const createElternzeitSchema = z.object({
  employeeFirstName: z.string().min(1, "Vorname ist erforderlich").max(100),
  employeeLastName: z.string().min(1, "Nachname ist erforderlich").max(100),
  employeeEmail: z.string().email("Ungueltige E-Mail-Adresse"),
  employeePersonalNr: z.string().max(50).optional(),
  employeeId: z.string().uuid().optional(),
  organizationId: z.string().uuid("Ungueltige Einrichtungs-ID"),

  personalgruppe: z.enum(["TARIF_TV_L", "BEAMTER", "PLANSTELLENINHABER"]),
  geschlecht: z.enum(["MUTTER", "VATER"]),
  kvTyp: z.enum(["GKV_PFLICHT", "GKV_FREIWILLIG", "PKV"]),
  kindNummer: z.number().int().min(1).max(10),

  mutterschutzId: z.string().uuid().optional(),
  einrichtungsleiterName: z.string().max(200).optional(),
  einrichtungsleiterEmail: z.string().email().optional(),
});

export const updateElternzeitSchema = z
  .object({
    status: z
      .enum([
        "ANGELEGT",
        "ANTRAG_VORL_VERSANDT",
        "ANTRAG_VORL_EINGEREICHT",
        "VORLAEUFIG_GENEHMIGT",
        "VORLAEUFIG_ABGELEHNT",
        "ANTRAG_ENDG_VERSANDT",
        "ANTRAG_ENDG_EINGEREICHT",
        "GENEHMIGT",
        "AKTIV",
        "UNTERBROCHEN",
        "RUECKKEHR_GEPLANT",
        "BEENDET",
        "ABGELEHNT",
      ])
      .optional(),
    kindName: z.string().max(200).optional().nullable(),
    kindGeburtsdatum: z.string().optional().nullable(),
    kindGeschlecht: z.enum(["TOCHTER", "SOHN"]).optional().nullable(),
    einrichtungsleiterName: z.string().max(200).optional().nullable(),
    einrichtungsleiterEmail: z.string().email().optional().nullable(),
    ablehnungGrund: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, "Mindestens ein Feld erforderlich");

// =============================================
// Notizen + Checkliste
// =============================================

export const noteSchema = z.object({
  text: z.string().min(1, "Text ist erforderlich").max(5000),
});

export const checklistUpdateSchema = z.object({
  erledigt: z.boolean(),
});

// =============================================
// Magic Link Token 1 (vorläufiger Antrag)
// =============================================

export const generateAntragLinkSchema = z.object({
  recipientEmail: z.string().email("Ungueltige E-Mail-Adresse"),
  recipientName: z.string().max(200).optional(),
});

// =============================================
// Public Form — Vorläufiger Antrag (Magic Link)
// =============================================

const abschnittSchema = z
  .object({
    abschnittNr: z.number().int().min(1).max(3),
    von: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Datum YYYY-MM-DD"),
    bis: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Datum YYYY-MM-DD"),
    uebertragung3bis8: z.boolean().default(false),
    teilzeit: z.boolean().default(false),
    teilzeitStunden: z
      .number()
      .min(0)
      .max(32, "Teilzeit max. 32 Stunden/Woche (§ 15 Abs. 7 BEEG)")
      .optional()
      .nullable(),
    ferienBegruendung: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => new Date(d.bis) >= new Date(d.von), {
    message: "Bis-Datum muss nach Von-Datum liegen",
  });

export const publicAntragVorlSchema = z.object({
  // Schritt 1
  adresseStrasse: z.string().min(1, "Strasse erforderlich").max(200),
  adressePlz: z.string().regex(/^\d{5}$/, "PLZ muss 5 Ziffern haben"),
  adresseOrt: z.string().min(1, "Ort erforderlich").max(100),
  dienstbezeichnung: z.string().min(1).max(200),
  schulnummer: z.string().max(50).optional().nullable(),

  // Schritt 2
  betreuungsabsicht: z
    .string()
    .min(10, "Bitte erlaeutern Sie die Betreuungsabsicht (mind. 10 Zeichen)")
    .max(2000),
  gleichzeitigeEZ: z.boolean(),

  // Schritt 3 — Abschnitte (mind. 1, max. 3)
  abschnitte: z
    .array(abschnittSchema)
    .min(1, "Mindestens ein Elternzeit-Abschnitt erforderlich")
    .max(3, "Maximal 3 Abschnitte erlaubt"),

  // Schritt 5
  dsgvoEinwilligung: z
    .boolean()
    .refine((v) => v === true, "DSGVO-Einwilligung erforderlich"),
});

export type PublicAntragVorlInput = z.infer<typeof publicAntragVorlSchema>;

// =============================================
// Magic Link Token 2 (endgültiger Antrag) — Phase 2
// =============================================

export const generateAntragLinkEndgSchema = z.object({
  recipientEmail: z.string().email("Ungueltige E-Mail-Adresse"),
  recipientName: z.string().max(200).optional(),
});

export const publicAntragEndgSchema = z.object({
  // Schritt 1: Kind-Daten
  kindName: z.string().min(1, "Name des Kindes erforderlich").max(200),
  kindGeburtsdatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Datum im Format YYYY-MM-DD"),
  kindGeschlecht: z.enum(["TOCHTER", "SOHN"]),
  fruehgeburt: z.boolean().default(false),
  mehrlinge: z.boolean().default(false),

  // Schritt 2: Geburtsurkunde — wird separat per FormData hochgeladen.
  // Hier nur Vermerk, ob Upload erfolgte (clientseitig).
  geburtsurkundeHochgeladen: z.boolean().refine((v) => v === true, {
    message: "Geburtsurkunde muss hochgeladen werden",
  }),

  // Schritt 3: Bestaetigung & DSGVO
  dsgvoEinwilligung: z
    .boolean()
    .refine((v) => v === true, "DSGVO-Einwilligung erforderlich"),
  bestaetigungAngabenKorrekt: z
    .boolean()
    .refine((v) => v === true, "Bestaetigung erforderlich"),
});

export type PublicAntragEndgInput = z.infer<typeof publicAntragEndgSchema>;

// =============================================
// HR-Aktion: endg. Genehmigung / Ablehnung (Phase 2)
// =============================================

export const genehmigenEndgSchema = z.object({
  genehmigungVon: z.string().min(1, "Unterzeichner erforderlich").max(200),
});

export const ablehnenEndgSchema = z.object({
  ablehnungGrund: z.string().min(10, "Begruendung erforderlich").max(2000),
});
