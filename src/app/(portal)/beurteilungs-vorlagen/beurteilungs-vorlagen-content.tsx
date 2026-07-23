"use client";

/**
 * Beurteilungs-Vorlagen — Admin-Verwaltung (Client Component)
 *
 * Verwaltet rechtlich konforme Beurteilungs-Vorlagen nach BRL NRW
 * (BASS 21-02 Nr. 2). Globale Vorlagen + optionale Mandanten-Overrides.
 *
 * Features:
 * - Tab-Filter: Global / pro Mandant
 * - Skala konfigurierbar (BRL_1_5 oder SCHULNOTEN_1_6)
 * - Kategorien + Kriterien mit Add/Delete/Move
 * - Rechtsgrundlage pro Kategorie (Auto-Vervollständigung aus legal-references.ts)
 * - Pflichtmerkmal-Toggle
 * - Als Standard setzen, Soft-Delete
 * - Neue Vorlage als Modal anlegen
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { PortalHeader } from "@/components/portal-header";
import {
  ALL_LEGAL_REFERENCES,
  type LegalReference,
} from "@/lib/legal-references";
import {
  BRL_SCALE_LABELS,
  SCHULNOTEN_SCALE_LABELS,
} from "@/lib/beurteilung-defaults";

// =============================================
// Types
// =============================================

interface User {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

interface Criterion {
  id?: string;
  name: string;
  description: string | null;
  weight: number;
  orderIndex: number;
}

interface Category {
  id?: string;
  name: string;
  description: string | null;
  weight: number;
  orderIndex: number;
  isMandatory: boolean;
  legalReference: string | null;
  criteria: Criterion[];
}

type ScaleType = "BRL_1_5" | "SCHULNOTEN_1_6";

interface Template {
  id: string;
  name: string;
  description: string | null;
  scaleType: ScaleType;
  scaleLabels: Record<string, string>;
  organizationId: string | null;
  organization: { id: string; name: string; mandantNumber: string } | null;
  isActive: boolean;
  isDefault: boolean;
  version: number;
  categories: Category[];
  createdAt: string;
  updatedAt: string;
}

interface Organization {
  id: string;
  name: string;
  mandantNumber: string;
  shortName: string | null;
  isActive: boolean;
}

interface EditState {
  name: string;
  description: string;
  scaleType: ScaleType;
  scaleLabels: Record<string, string>;
  isDefault: boolean;
  categories: Category[];
  dirty: boolean;
}

// =============================================
// Konstanten
// =============================================

const SCALE_OPTIONS: { value: ScaleType; label: string; description: string }[] = [
  {
    value: "BRL_1_5",
    label: "BRL 1–5 (rechtskonform NRW)",
    description: "5 Stufen nach BASS 21-02 Nr. 2 Nr. 7.3 — 5 = übertrifft besonders",
  },
  {
    value: "SCHULNOTEN_1_6",
    label: "Schulnoten 1–6",
    description: "Klassische Schulnoten — 1 = sehr gut, 6 = ungenügend",
  },
];

// Globaler-Tab als Pseudo-Mandant
const GLOBAL_TAB_KEY = "__global__";

function defaultLabelsForScale(scaleType: ScaleType): Record<string, string> {
  return scaleType === "BRL_1_5" ? { ...BRL_SCALE_LABELS } : { ...SCHULNOTEN_SCALE_LABELS };
}

function emptyCategory(orderIndex: number): Category {
  return {
    name: "",
    description: null,
    weight: 1.0,
    orderIndex,
    isMandatory: false,
    legalReference: null,
    criteria: [
      { name: "", description: null, weight: 1.0, orderIndex: 0 },
    ],
  };
}

function templateToEditState(t: Template): EditState {
  return {
    name: t.name,
    description: t.description ?? "",
    scaleType: t.scaleType,
    scaleLabels: { ...t.scaleLabels },
    isDefault: t.isDefault,
    categories: t.categories.map((c) => ({
      ...c,
      criteria: c.criteria.map((cr) => ({ ...cr })),
    })),
    dirty: false,
  };
}

// =============================================
// Component
// =============================================

export function BeurteilungsVorlagenContent({ user }: { user: User }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(GLOBAL_TAB_KEY);
  const [editState, setEditState] = useState<Record<string, EditState>>({});
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, Set<number>>
  >({});
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLegalRefForCat, setShowLegalRefForCat] = useState<string | null>(null);

  // =============================================
  // Daten laden
  // =============================================
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [tmplRes, orgRes] = await Promise.all([
        fetch("/api/beurteilung-templates?includeInactive=false"),
        fetch("/api/organizations"),
      ]);
      if (!tmplRes.ok) throw new Error("Beurteilungs-Vorlagen konnten nicht geladen werden");
      if (!orgRes.ok) throw new Error("Mandanten konnten nicht geladen werden");
      const tmplJson = await tmplRes.json();
      const orgJson = await orgRes.json();

      const tmpls: Template[] = tmplJson.data;
      setTemplates(tmpls);
      setOrganizations(orgJson.data.filter((o: Organization) => o.isActive));

      // Edit-State initialisieren
      const newEdit: Record<string, EditState> = {};
      for (const t of tmpls) newEdit[t.id] = templateToEditState(t);
      setEditState(newEdit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Erfolgs-/Fehlermeldungen auto-clear
  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 4000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // =============================================
  // Aktiver Scope: Welche Vorlagen in diesem Tab?
  // =============================================
  const visibleTemplates = useMemo(() => {
    if (activeTab === GLOBAL_TAB_KEY) {
      return templates.filter((t) => t.organizationId === null);
    }
    return templates.filter((t) => t.organizationId === activeTab);
  }, [templates, activeTab]);

  const activeOrgName = useMemo(() => {
    if (activeTab === GLOBAL_TAB_KEY) return "Global";
    return organizations.find((o) => o.id === activeTab)?.name ?? "Mandant";
  }, [activeTab, organizations]);

  // =============================================
  // Edit-Helper
  // =============================================

  function updateEdit(
    templateId: string,
    updater: (prev: EditState) => EditState,
  ) {
    setEditState((prev) => {
      const cur = prev[templateId];
      if (!cur) return prev;
      return { ...prev, [templateId]: { ...updater(cur), dirty: true } };
    });
  }

  function handleNameChange(id: string, name: string) {
    updateEdit(id, (p) => ({ ...p, name }));
  }
  function handleDescriptionChange(id: string, description: string) {
    updateEdit(id, (p) => ({ ...p, description }));
  }
  function handleScaleTypeChange(id: string, scaleType: ScaleType) {
    updateEdit(id, (p) => ({
      ...p,
      scaleType,
      scaleLabels: defaultLabelsForScale(scaleType),
    }));
  }
  function handleScaleLabelChange(id: string, key: string, label: string) {
    updateEdit(id, (p) => ({
      ...p,
      scaleLabels: { ...p.scaleLabels, [key]: label },
    }));
  }

  // Kategorien
  function handleCategoryChange<K extends keyof Category>(
    id: string,
    catIdx: number,
    field: K,
    value: Category[K],
  ) {
    updateEdit(id, (p) => {
      const categories = [...p.categories];
      categories[catIdx] = { ...categories[catIdx], [field]: value };
      return { ...p, categories };
    });
  }

  function handleAddCategory(id: string) {
    updateEdit(id, (p) => ({
      ...p,
      categories: [...p.categories, emptyCategory(p.categories.length)],
    }));
    setExpandedCategories((prev) => {
      const cur = prev[id] || new Set<number>();
      const next = new Set(cur);
      const idx = (editState[id]?.categories.length ?? 0);
      next.add(idx);
      return { ...prev, [id]: next };
    });
  }

  function handleDeleteCategory(id: string, catIdx: number) {
    if (!window.confirm("Kategorie wirklich löschen?")) return;
    updateEdit(id, (p) => ({
      ...p,
      categories: p.categories
        .filter((_, i) => i !== catIdx)
        .map((c, i) => ({ ...c, orderIndex: i })),
    }));
  }

  function handleMoveCategory(id: string, catIdx: number, dir: -1 | 1) {
    updateEdit(id, (p) => {
      const target = catIdx + dir;
      if (target < 0 || target >= p.categories.length) return p;
      const categories = [...p.categories];
      [categories[catIdx], categories[target]] = [categories[target], categories[catIdx]];
      return { ...p, categories: categories.map((c, i) => ({ ...c, orderIndex: i })) };
    });
  }

  // Kriterien
  function handleCriterionChange<K extends keyof Criterion>(
    id: string,
    catIdx: number,
    critIdx: number,
    field: K,
    value: Criterion[K],
  ) {
    updateEdit(id, (p) => {
      const categories = [...p.categories];
      const criteria = [...categories[catIdx].criteria];
      criteria[critIdx] = { ...criteria[critIdx], [field]: value };
      categories[catIdx] = { ...categories[catIdx], criteria };
      return { ...p, categories };
    });
  }

  function handleAddCriterion(id: string, catIdx: number) {
    updateEdit(id, (p) => {
      const categories = [...p.categories];
      const criteria = [
        ...categories[catIdx].criteria,
        {
          name: "",
          description: null,
          weight: 1.0,
          orderIndex: categories[catIdx].criteria.length,
        },
      ];
      categories[catIdx] = { ...categories[catIdx], criteria };
      return { ...p, categories };
    });
  }

  function handleDeleteCriterion(id: string, catIdx: number, critIdx: number) {
    updateEdit(id, (p) => {
      const categories = [...p.categories];
      const criteria = categories[catIdx].criteria
        .filter((_, i) => i !== critIdx)
        .map((cr, i) => ({ ...cr, orderIndex: i }));
      categories[catIdx] = { ...categories[catIdx], criteria };
      return { ...p, categories };
    });
  }

  function handleMoveCriterion(
    id: string,
    catIdx: number,
    critIdx: number,
    dir: -1 | 1,
  ) {
    updateEdit(id, (p) => {
      const categories = [...p.categories];
      const criteria = [...categories[catIdx].criteria];
      const target = critIdx + dir;
      if (target < 0 || target >= criteria.length) return p;
      [criteria[critIdx], criteria[target]] = [criteria[target], criteria[critIdx]];
      categories[catIdx] = {
        ...categories[catIdx],
        criteria: criteria.map((cr, i) => ({ ...cr, orderIndex: i })),
      };
      return { ...p, categories };
    });
  }

  // Aufklappen
  function toggleCategory(id: string, catIdx: number) {
    setExpandedCategories((prev) => {
      const cur = prev[id] || new Set<number>();
      const next = new Set(cur);
      if (next.has(catIdx)) next.delete(catIdx);
      else next.add(catIdx);
      return { ...prev, [id]: next };
    });
  }

  function isCategoryExpanded(id: string, catIdx: number): boolean {
    return expandedCategories[id]?.has(catIdx) ?? false;
  }

  // =============================================
  // Speichern
  // =============================================

  async function handleSave(template: Template) {
    const edit = editState[template.id];
    if (!edit) return;

    if (!edit.name.trim()) {
      setError("Der Vorlagenname darf nicht leer sein.");
      return;
    }
    if (edit.categories.length === 0) {
      setError("Mindestens eine Kategorie ist erforderlich.");
      return;
    }
    for (const cat of edit.categories) {
      if (!cat.name.trim()) {
        setError("Jede Kategorie muss einen Namen haben.");
        return;
      }
      if (cat.criteria.length === 0) {
        setError(`Kategorie "${cat.name}" braucht mindestens ein Kriterium.`);
        return;
      }
      for (const crit of cat.criteria) {
        if (!crit.name.trim()) {
          setError("Jedes Kriterium muss einen Namen haben.");
          return;
        }
      }
    }

    try {
      setSavingId(template.id);
      setError(null);
      setSuccessMessage(null);

      const res = await fetch(`/api/beurteilung-templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name,
          description: edit.description || null,
          scaleType: edit.scaleType,
          scaleLabels: edit.scaleLabels,
          organizationId: template.organizationId, // unveränderlich nach Anlegen
          isActive: true,
          isDefault: edit.isDefault,
          categories: edit.categories.map((c, ci) => ({
            name: c.name,
            description: c.description,
            weight: c.weight,
            orderIndex: ci,
            isMandatory: c.isMandatory,
            legalReference: c.legalReference,
            criteria: c.criteria.map((cr, cri) => ({
              name: cr.name,
              description: cr.description,
              weight: cr.weight,
              orderIndex: cri,
            })),
          })),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Speichern");
      }

      setSuccessMessage(`Vorlage "${edit.name}" gespeichert.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSavingId(null);
    }
  }

  async function handleSetDefault(template: Template) {
    try {
      setError(null);
      const res = await fetch(
        `/api/beurteilung-templates/${template.id}/set-default`,
        { method: "POST" },
      );
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler");
      }
      setSuccessMessage(`"${template.name}" ist jetzt Standard.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  async function handleDelete(template: Template) {
    if (
      !window.confirm(
        `Vorlage "${template.name}" deaktivieren? (Bestehende Beurteilungen bleiben unverändert.)`,
      )
    )
      return;
    try {
      setError(null);
      const res = await fetch(`/api/beurteilung-templates/${template.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler");
      }
      setSuccessMessage(`"${template.name}" wurde deaktiviert.`);
      setExpandedTemplate(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  function handleResetEdit(template: Template) {
    setEditState((prev) => ({
      ...prev,
      [template.id]: templateToEditState(template),
    }));
    setError(null);
  }

  // =============================================
  // Render
  // =============================================

  return (
    <div className="min-h-screen bg-muted">
      <PortalHeader user={user} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Seitentitel */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Beurteilungs-Vorlagen
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Konfigurierbare Vorlagen für die dienstliche Beurteilung im Rahmen der
              Verbeamtung. Globale Vorlagen gelten für alle Mandanten — Mandanten können
              optional eine eigene Vorlage als Override anlegen.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Rechtsgrundlage: Art. 33 Abs. 2 GG • § 9 BeamtStG • § 92 LBG NRW •
              BASS 21-02 Nr. 2 (BRL Nr. 6.1, 7.3, 7.5, 8.3, 10.1)
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + Neue Vorlage
          </button>
        </div>

        {/* Tab-Filter: Global + Mandanten */}
        <div className="mb-6 flex border-b border-border overflow-x-auto">
          <TabButton
            label="Global"
            active={activeTab === GLOBAL_TAB_KEY}
            onClick={() => setActiveTab(GLOBAL_TAB_KEY)}
            badge={
              templates.filter((t) => t.organizationId === null).length || undefined
            }
          />
          {organizations.map((org) => (
            <TabButton
              key={org.id}
              label={`${org.mandantNumber} ${org.shortName ?? org.name}`}
              active={activeTab === org.id}
              onClick={() => setActiveTab(org.id)}
              badge={
                templates.filter((t) => t.organizationId === org.id).length || undefined
              }
            />
          ))}
        </div>

        {/* Erfolgs-/Fehlermeldungen */}
        {successMessage && (
          <div className="mb-4 rounded-lg border border-credo-gruen/30 bg-credo-gruen/10 p-3 text-sm text-credo-gruen">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-credo-rot/30 bg-credo-rot/10 p-3 text-sm text-credo-rot">
            {error}
          </div>
        )}

        {/* Ladezustand */}
        {loading && (
          <div className="py-12 text-center text-muted-foreground">
            Lade Beurteilungs-Vorlagen…
          </div>
        )}

        {/* Leerzustand */}
        {!loading && visibleTemplates.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              Keine Beurteilungs-Vorlagen für <strong>{activeOrgName}</strong>.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Lege oben rechts eine neue Vorlage an
              {activeTab !== GLOBAL_TAB_KEY && " — sie überschreibt dann den globalen Default für diesen Mandanten."}
              .
            </p>
          </div>
        )}

        {/* Template-Liste */}
        {!loading && visibleTemplates.length > 0 && (
          <div className="space-y-4">
            {visibleTemplates.map((template) => {
              const edit = editState[template.id];
              const isOpen = expandedTemplate === template.id;
              if (!edit) return null;

              return (
                <div
                  key={template.id}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  {/* Header */}
                  <button
                    type="button"
                    onClick={() => setExpandedTemplate(isOpen ? null : template.id)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">
                          {template.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {template.categories.length} Kategorien •{" "}
                          {template.categories.reduce(
                            (s, c) => s + c.criteria.length,
                            0,
                          )}{" "}
                          Kriterien • Version {template.version}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                            template.scaleType === "BRL_1_5"
                              ? "bg-credo-gruen/15 text-credo-gruen"
                              : "bg-credo-blau/15 text-credo-blau"
                          }`}
                        >
                          {template.scaleType === "BRL_1_5"
                            ? "BRL 1–5"
                            : "Schulnoten 1–6"}
                        </span>
                        {template.isDefault && (
                          <span className="inline-flex rounded-full bg-credo-gelb/15 px-2.5 py-0.5 text-[11px] font-medium text-credo-gelb">
                            Standard
                          </span>
                        )}
                        {edit.dirty && (
                          <span className="inline-flex rounded-full bg-credo-rot/10 px-2.5 py-0.5 text-[11px] font-medium text-credo-rot">
                            ungespeichert
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-muted-foreground text-xl leading-none">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>

                  {/* Editor */}
                  {isOpen && (
                    <div className="border-t border-border p-5 space-y-5">
                      {/* Stammdaten */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1">
                            Vorlagenname
                          </label>
                          <input
                            type="text"
                            value={edit.name}
                            onChange={(e) =>
                              handleNameChange(template.id, e.target.value)
                            }
                            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                            autoComplete="off"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1">
                            Bewertungsskala
                          </label>
                          <select
                            value={edit.scaleType}
                            onChange={(e) =>
                              handleScaleTypeChange(
                                template.id,
                                e.target.value as ScaleType,
                              )
                            }
                            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                          >
                            {SCALE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {
                              SCALE_OPTIONS.find((o) => o.value === edit.scaleType)
                                ?.description
                            }
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Beschreibung
                        </label>
                        <textarea
                          value={edit.description}
                          onChange={(e) =>
                            handleDescriptionChange(template.id, e.target.value)
                          }
                          rows={2}
                          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none resize-y"
                        />
                      </div>

                      {/* Skala-Labels */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Skalenstufen
                        </label>
                        <div className="space-y-2">
                          {Object.keys(edit.scaleLabels)
                            .sort((a, b) => Number(b) - Number(a))
                            .map((key) => (
                              <div key={key} className="flex items-center gap-3">
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground">
                                  {key}
                                </span>
                                <input
                                  type="text"
                                  value={edit.scaleLabels[key]}
                                  onChange={(e) =>
                                    handleScaleLabelChange(
                                      template.id,
                                      key,
                                      e.target.value,
                                    )
                                  }
                                  className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                                />
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Kategorien */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-foreground">
                            Kategorien & Kriterien
                          </h4>
                          <button
                            type="button"
                            onClick={() => handleAddCategory(template.id)}
                            className="text-xs font-medium text-credo-blau hover:underline"
                          >
                            + Kategorie hinzufügen
                          </button>
                        </div>

                        <div className="space-y-3">
                          {edit.categories.map((cat, catIdx) => {
                            const catKey = `${template.id}-${catIdx}`;
                            const expanded = isCategoryExpanded(template.id, catIdx);
                            return (
                              <div
                                key={catIdx}
                                className="rounded-lg border border-border bg-background"
                              >
                                {/* Kategorie-Header */}
                                <div className="flex items-center gap-2 p-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleCategory(template.id, catIdx)}
                                    className="text-muted-foreground text-lg leading-none px-1"
                                    aria-label="Aufklappen"
                                  >
                                    {expanded ? "−" : "+"}
                                  </button>
                                  <input
                                    type="text"
                                    value={cat.name}
                                    placeholder="Kategoriename (z.B. Unterricht)"
                                    onChange={(e) =>
                                      handleCategoryChange(
                                        template.id,
                                        catIdx,
                                        "name",
                                        e.target.value,
                                      )
                                    }
                                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                                  />
                                  <span className="text-xs text-muted-foreground hidden md:inline">
                                    {cat.criteria.length} Kriterien
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleMoveCategory(template.id, catIdx, -1)}
                                      disabled={catIdx === 0}
                                      className="px-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                      title="Nach oben"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveCategory(template.id, catIdx, 1)}
                                      disabled={catIdx === edit.categories.length - 1}
                                      className="px-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                      title="Nach unten"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCategory(template.id, catIdx)}
                                      className="px-1.5 text-credo-rot hover:text-credo-rot/80"
                                      title="Löschen"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>

                                {expanded && (
                                  <div className="border-t border-border p-3 space-y-3 bg-muted/20">
                                    {/* Beschreibung + Pflicht + Gewicht */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                                          Beschreibung
                                        </label>
                                        <input
                                          type="text"
                                          value={cat.description ?? ""}
                                          onChange={(e) =>
                                            handleCategoryChange(
                                              template.id,
                                              catIdx,
                                              "description",
                                              e.target.value || null,
                                            )
                                          }
                                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                                          Gewicht
                                        </label>
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="0.1"
                                          max="10"
                                          value={cat.weight}
                                          onChange={(e) =>
                                            handleCategoryChange(
                                              template.id,
                                              catIdx,
                                              "weight",
                                              parseFloat(e.target.value) || 1.0,
                                            )
                                          }
                                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                                        />
                                      </div>
                                    </div>

                                    {/* Pflicht-Toggle + Rechtsgrundlage */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={cat.isMandatory}
                                          onChange={(e) =>
                                            handleCategoryChange(
                                              template.id,
                                              catIdx,
                                              "isMandatory",
                                              e.target.checked,
                                            )
                                          }
                                          className="h-4 w-4 rounded border-input"
                                        />
                                        BRL-Pflichtmerkmal
                                      </label>
                                      <div className="md:col-span-2 relative">
                                        <label className="block text-xs font-medium text-muted-foreground mb-1">
                                          Rechtsgrundlage
                                        </label>
                                        <input
                                          type="text"
                                          value={cat.legalReference ?? ""}
                                          onChange={(e) =>
                                            handleCategoryChange(
                                              template.id,
                                              catIdx,
                                              "legalReference",
                                              e.target.value || null,
                                            )
                                          }
                                          onFocus={() => setShowLegalRefForCat(catKey)}
                                          onBlur={() =>
                                            setTimeout(() => setShowLegalRefForCat(null), 200)
                                          }
                                          placeholder="z.B. BRL Nr. 6.1 Merkmal 1"
                                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                                        />
                                        {showLegalRefForCat === catKey && (
                                          <LegalReferenceDropdown
                                            current={cat.legalReference ?? ""}
                                            onSelect={(ref) => {
                                              handleCategoryChange(
                                                template.id,
                                                catIdx,
                                                "legalReference",
                                                ref.shortLabel,
                                              );
                                              setShowLegalRefForCat(null);
                                            }}
                                          />
                                        )}
                                      </div>
                                    </div>

                                    {/* Kriterien-Liste */}
                                    <div>
                                      <div className="flex items-center justify-between mb-2">
                                        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                          Kriterien
                                        </h5>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleAddCriterion(template.id, catIdx)
                                          }
                                          className="text-xs font-medium text-credo-blau hover:underline"
                                        >
                                          + Kriterium
                                        </button>
                                      </div>
                                      <div className="space-y-2">
                                        {cat.criteria.map((crit, critIdx) => (
                                          <div
                                            key={critIdx}
                                            className="flex items-center gap-2"
                                          >
                                            <input
                                              type="text"
                                              value={crit.name}
                                              placeholder="Kriteriumsname"
                                              onChange={(e) =>
                                                handleCriterionChange(
                                                  template.id,
                                                  catIdx,
                                                  critIdx,
                                                  "name",
                                                  e.target.value,
                                                )
                                              }
                                              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                                            />
                                            <input
                                              type="text"
                                              value={crit.description ?? ""}
                                              placeholder="Beschreibung (optional)"
                                              onChange={(e) =>
                                                handleCriterionChange(
                                                  template.id,
                                                  catIdx,
                                                  critIdx,
                                                  "description",
                                                  e.target.value || null,
                                                )
                                              }
                                              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none hidden md:block"
                                            />
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleMoveCriterion(
                                                  template.id,
                                                  catIdx,
                                                  critIdx,
                                                  -1,
                                                )
                                              }
                                              disabled={critIdx === 0}
                                              className="px-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                            >
                                              ↑
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleMoveCriterion(
                                                  template.id,
                                                  catIdx,
                                                  critIdx,
                                                  1,
                                                )
                                              }
                                              disabled={critIdx === cat.criteria.length - 1}
                                              className="px-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                            >
                                              ↓
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteCriterion(
                                                  template.id,
                                                  catIdx,
                                                  critIdx,
                                                )
                                              }
                                              className="px-1.5 text-credo-rot hover:text-credo-rot/80"
                                            >
                                              ×
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Aktionen */}
                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <div className="flex items-center gap-2">
                          {!template.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(template)}
                              className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                            >
                              Als Standard setzen
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(template)}
                            className="rounded-lg border border-credo-rot/30 bg-card px-3 py-2 text-xs font-medium text-credo-rot hover:bg-credo-rot/5"
                          >
                            Deaktivieren
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          {edit.dirty && (
                            <button
                              type="button"
                              onClick={() => handleResetEdit(template)}
                              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                            >
                              Verwerfen
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSave(template)}
                            disabled={!edit.dirty || savingId === template.id}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingId === template.id ? "Speichere…" : "Speichern"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create-Modal */}
      {showCreateModal && (
        <CreateTemplateModal
          organizations={organizations}
          activeOrgId={activeTab === GLOBAL_TAB_KEY ? null : activeTab}
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            setShowCreateModal(false);
            await loadAll();
            setSuccessMessage("Neue Vorlage angelegt.");
          }}
        />
      )}
    </div>
  );
}

// =============================================
// Hilfs-Komponenten
// =============================================

function TabButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
        active
          ? "border-b-2 border-credo-gruen text-credo-gruen"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold">
          {badge}
        </span>
      )}
    </button>
  );
}

function LegalReferenceDropdown({
  current,
  onSelect,
}: {
  current: string;
  onSelect: (ref: LegalReference) => void;
}) {
  const filtered = useMemo(() => {
    const q = current.trim().toLowerCase();
    if (!q) return ALL_LEGAL_REFERENCES.slice(0, 8);
    return ALL_LEGAL_REFERENCES.filter(
      (r) =>
        r.shortLabel.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [current]);

  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
      {filtered.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Keine Treffer
        </div>
      ) : (
        filtered.map((ref) => (
          <button
            key={ref.key}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(ref)}
            className="w-full text-left px-3 py-2 hover:bg-muted border-b border-border last:border-0"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded bg-credo-blau/15 px-1.5 py-0.5 text-[10px] font-semibold text-credo-blau">
                {ref.shortLabel}
              </span>
              <span className="text-xs font-medium text-foreground truncate">
                {ref.title}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
              {ref.summary}
            </p>
          </button>
        ))
      )}
    </div>
  );
}

// =============================================
// Create-Modal
// =============================================

function CreateTemplateModal({
  organizations,
  activeOrgId,
  onClose,
  onCreated,
}: {
  organizations: Organization[];
  activeOrgId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scaleType, setScaleType] = useState<ScaleType>("BRL_1_5");
  const [organizationId, setOrganizationId] = useState<string | null>(activeOrgId);
  const [isDefault, setIsDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError("Bitte einen Namen angeben.");
      return;
    }
    try {
      setCreating(true);
      setError(null);
      const res = await fetch("/api/beurteilung-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          scaleType,
          scaleLabels: defaultLabelsForScale(scaleType),
          organizationId: organizationId,
          isActive: true,
          isDefault,
          categories: [
            {
              name: "Neue Kategorie",
              orderIndex: 0,
              weight: 1.0,
              isMandatory: false,
              criteria: [
                { name: "Neues Kriterium", orderIndex: 0, weight: 1.0 },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Anlegen");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-card shadow-2xl">
        <div className="border-b border-border p-5">
          <h3 className="text-lg font-semibold text-foreground">
            Neue Beurteilungs-Vorlage
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Nach dem Anlegen können Sie Kategorien und Kriterien im Editor pflegen.
          </p>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-credo-rot/30 bg-credo-rot/10 p-3 text-sm text-credo-rot">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Beschreibung (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Bewertungsskala
            </label>
            <select
              value={scaleType}
              onChange={(e) => setScaleType(e.target.value as ScaleType)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
            >
              {SCALE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Geltungsbereich
            </label>
            <select
              value={organizationId ?? ""}
              onChange={(e) => setOrganizationId(e.target.value || null)}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:border-ring focus:ring-1 focus:ring-ring outline-none"
            >
              <option value="">Global (alle Mandanten)</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.mandantNumber} — {org.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Als Standard für diesen Geltungsbereich setzen
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? "Erstelle…" : "Anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
