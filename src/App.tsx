import { FormEvent, useEffect, useMemo, useState } from "react";
import { CategoryIcon, CATEGORY_ICON_KEYS } from "./CategoryIcon";
import { createAdminService, createCategory, getAdminServices, getCategories, getMyAdminAccess, getOverview, getPaginatedResource, getPlatformSettings, login, patchAdminService, patchCategory, patchPlatformSettings, patchResource, postResource } from "./lib/api";
import type { AdminOverview, AdminService, AuthState, Category, PaginatedResult, PlatformSettings } from "./types";

const STORAGE_KEY = "jobizy_admin_auth";
const DEFAULT_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "http://localhost:3001/api/v1";

type AuthForm = {
  apiBaseUrl: string;
  email: string;
  password: string;
  forceAdminHeader: boolean;
};

type ResourceKey = "requests" | "quotes" | "missions" | "subscriptions" | "disputes" | "plans" | "users";
type SectionKey = "overview" | "platform" | "categories" | "services" | ResourceKey;
type RowData = Record<string, unknown>;
type ResourceFilters = { q: string; status: string; page: number; limit: number };
type EditState = { resource: ResourceKey; row: RowData } | null;

const RESOURCE_META: Record<
  ResourceKey,
  {
    title: string;
    path: string;
    statusLabel: string;
    statusOptions: string[];
    supportsSearch: boolean;
    emptyText: string;
  }
> = {
  requests: { title: "Demandes", path: "/admin/requests", statusLabel: "Statut demande", statusOptions: ["draft", "published", "in_discussion", "awarded", "expired", "cancelled", "closed"], supportsSearch: true, emptyText: "Aucune demande trouvee." },
  quotes: { title: "Offres", path: "/admin/quotes", statusLabel: "Statut offre", statusOptions: ["sent", "accepted", "rejected", "withdrawn"], supportsSearch: true, emptyText: "Aucune offre trouvee." },
  missions: { title: "Missions", path: "/admin/missions", statusLabel: "Statut mission", statusOptions: ["confirmed", "in_progress", "completed", "cancelled", "in_dispute"], supportsSearch: true, emptyText: "Aucune mission trouvee." },
  subscriptions: { title: "Abonnements", path: "/admin/subscriptions", statusLabel: "Statut abonnement", statusOptions: ["draft", "active", "expired", "cancelled"], supportsSearch: true, emptyText: "Aucun abonnement trouve." },
  disputes: { title: "Litiges", path: "/admin/disputes", statusLabel: "Statut litige", statusOptions: ["open", "resolved"], supportsSearch: true, emptyText: "Aucun litige trouve." },
  plans: { title: "Plans", path: "/admin/plans", statusLabel: "Statut plan", statusOptions: ["active", "inactive"], supportsSearch: false, emptyText: "Aucun plan trouve." },
  users: { title: "Utilisateurs", path: "/admin/users", statusLabel: "Statut compte", statusOptions: ["active", "suspended"], supportsSearch: true, emptyText: "Aucun utilisateur trouve." },
};

const SECTION_LABELS: Record<SectionKey, string> = {
  overview: "Vue d'ensemble",
  platform: "Plateforme",
  categories: "Categories",
  services: "Services",
  users: "Utilisateurs",
  requests: "Demandes",
  quotes: "Offres",
  missions: "Missions",
  subscriptions: "Abonnements",
  disputes: "Litiges",
  plans: "Plans",
};

function readStoredAuth(): AuthState | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

function emptyResult(): PaginatedResult<RowData> {
  return { rows: [], total: 0, page: 1, limit: 20 };
}

function defaultFilters(): ResourceFilters {
  return { q: "", status: "", page: 1, limit: 20 };
}

function boolValue(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function ResourceTable({
  resource,
  result,
  onEdit,
  onPageChange,
}: {
  resource: ResourceKey;
  result: PaginatedResult<RowData>;
  onEdit: (row: RowData) => void;
  onPageChange: (page: number) => void;
}) {
  const rows = result.rows;
  const meta = RESOURCE_META[resource];

  if (rows.length === 0) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{meta.title}</h2>
            <p>{meta.emptyText}</p>
          </div>
        </div>
      </section>
    );
  }

  const columns = Object.keys(rows[0]).slice(0, 8);
  const totalPages = Math.max(1, Math.ceil(result.total / result.limit));

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{meta.title}</h2>
          <p>{result.total} element(s)</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="resource-table">
          <thead>
            <tr>
              {columns.map((column) => <th key={column}>{column}</th>)}
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={String(row.id ?? index)}>
                {columns.map((column) => <td key={column}>{String(row[column] ?? "-")}</td>)}
                <td>
                  <button className="secondary-button compact-button" onClick={() => onEdit(row)} type="button">
                    Modifier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>Page {result.page} / {totalPages}</span>
        <div className="button-group">
          <button className="ghost-button compact-button" disabled={result.page <= 1} onClick={() => onPageChange(result.page - 1)} type="button">
            Precedent
          </button>
          <button className="ghost-button compact-button" disabled={result.page >= totalPages} onClick={() => onPageChange(result.page + 1)} type="button">
            Suivant
          </button>
        </div>
      </div>
    </section>
  );
}

function getEditableFields(resource: ResourceKey) {
  switch (resource) {
    case "requests":
      return [
        { key: "status", label: "Statut", type: "select", options: RESOURCE_META.requests.statusOptions },
        { key: "action_required_client", label: "Action requise client", type: "boolean" },
      ] as const;
    case "quotes":
      return [
        { key: "status", label: "Statut", type: "select", options: RESOURCE_META.quotes.statusOptions },
        { key: "delay_days", label: "Delai (jours)", type: "number" },
        { key: "indicative_price_cents", label: "Prix indicatif (cents)", type: "number" },
      ] as const;
    case "missions":
      return [
        { key: "status", label: "Statut", type: "select", options: RESOURCE_META.missions.statusOptions },
        { key: "dispute_opened", label: "Litige ouvert", type: "boolean" },
      ] as const;
    case "subscriptions":
      return [
        { key: "status", label: "Statut", type: "select", options: RESOURCE_META.subscriptions.statusOptions },
        { key: "ends_at", label: "Date de fin", type: "text" },
      ] as const;
    case "disputes":
      return [
        { key: "status", label: "Statut", type: "select", options: RESOURCE_META.disputes.statusOptions },
        { key: "resolution_type", label: "Type de resolution", type: "text" },
        { key: "resolution_note", label: "Note de resolution", type: "textarea" },
        { key: "resolved_at", label: "Resolu le", type: "text" },
      ] as const;
    case "plans":
      return [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Nom", type: "text" },
        { key: "badge", label: "Badge", type: "text" },
        { key: "max_responses", label: "Max reponses", type: "number" },
        { key: "priority_level", label: "Priorite", type: "number" },
        { key: "price_cents", label: "Prix (cents)", type: "number" },
        { key: "currency", label: "Devise", type: "text" },
        { key: "status", label: "Statut", type: "select", options: RESOURCE_META.plans.statusOptions },
      ] as const;
    case "users":
      return [
        { key: "status", label: "Statut", type: "select", options: RESOURCE_META.users.statusOptions },
        { key: "is_client_enabled", label: "Espace client actif", type: "boolean" },
        { key: "is_provider_enabled", label: "Espace prestataire actif", type: "boolean" },
      ] as const;
  }
}

function EditDialog({
  state,
  onClose,
  onSave,
}: {
  state: EditState;
  onClose: () => void;
  onSave: (resource: ResourceKey, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [formState, setFormState] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) {
      setFormState({});
      return;
    }
    const nextState: Record<string, unknown> = {};
    for (const field of getEditableFields(state.resource)) {
      nextState[field.key] = state.row[field.key] ?? (field.type === "boolean" ? false : "");
    }
    setFormState(nextState);
  }, [state]);

  if (!state) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card">
        <form
          className="edit-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await onSave(state.resource, formState);
              onClose();
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="edit-form-header">
            <div>
              <p className="eyebrow">{RESOURCE_META[state.resource].title}</p>
              <h3>Edition de {String(state.row.id ?? "")}</h3>
            </div>
            <button className="ghost-button compact-button" onClick={onClose} type="button">Fermer</button>
          </div>
          <div className="edit-form-grid">
            {getEditableFields(state.resource).map((field) => (
              <label className="field" key={field.key}>
                <span>{field.label}</span>
                {field.type === "select" ? (
                  <select value={String(formState[field.key] ?? "")} onChange={(event) => setFormState((current) => ({ ...current, [field.key]: event.target.value }))}>
                    <option value="">Selectionner</option>
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : field.type === "boolean" ? (
                  <input checked={boolValue(formState[field.key])} onChange={(event) => setFormState((current) => ({ ...current, [field.key]: event.target.checked }))} type="checkbox" />
                ) : field.type === "textarea" ? (
                  <textarea value={String(formState[field.key] ?? "")} onChange={(event) => setFormState((current) => ({ ...current, [field.key]: event.target.value }))} />
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    value={String(formState[field.key] ?? "")}
                    onChange={(event) => setFormState((current) => ({ ...current, [field.key]: field.type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value }))}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="edit-form-actions">
            <button className="ghost-button" onClick={onClose} type="button">Annuler</button>
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Enregistrement..." : "Enregistrer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlanCreateDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [formState, setFormState] = useState({ code: "", name: "", badge: "", max_responses: "", priority_level: 0, price_cents: 0, currency: "CAD", status: "active" });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card">
        <form
          className="edit-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await onCreate({
                code: formState.code,
                name: formState.name,
                badge: formState.badge || null,
                max_responses: formState.max_responses === "" ? null : Number(formState.max_responses),
                priority_level: Number(formState.priority_level),
                price_cents: Number(formState.price_cents),
                currency: formState.currency,
                status: formState.status,
              });
              onClose();
              setFormState({ code: "", name: "", badge: "", max_responses: "", priority_level: 0, price_cents: 0, currency: "CAD", status: "active" });
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="edit-form-header">
            <div>
              <p className="eyebrow">Plans</p>
              <h3>Creer un plan prestataire</h3>
            </div>
            <button className="ghost-button compact-button" onClick={onClose} type="button">Fermer</button>
          </div>
          <div className="edit-form-grid">
            <label className="field"><span>Code</span><input value={formState.code} onChange={(event) => setFormState((current) => ({ ...current, code: event.target.value }))} /></label>
            <label className="field"><span>Nom</span><input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Badge</span><input value={formState.badge} onChange={(event) => setFormState((current) => ({ ...current, badge: event.target.value }))} /></label>
            <label className="field"><span>Max reponses</span><input value={formState.max_responses} onChange={(event) => setFormState((current) => ({ ...current, max_responses: event.target.value }))} /></label>
            <label className="field"><span>Priorite</span><input type="number" value={formState.priority_level} onChange={(event) => setFormState((current) => ({ ...current, priority_level: Number(event.target.value) }))} /></label>
            <label className="field"><span>Prix (cents)</span><input type="number" value={formState.price_cents} onChange={(event) => setFormState((current) => ({ ...current, price_cents: Number(event.target.value) }))} /></label>
            <label className="field"><span>Devise</span><input value={formState.currency} onChange={(event) => setFormState((current) => ({ ...current, currency: event.target.value }))} /></label>
            <label className="field">
              <span>Statut</span>
              <select value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value }))}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
          </div>
          <div className="edit-form-actions">
            <button className="ghost-button" onClick={onClose} type="button">Annuler</button>
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Creation..." : "Creer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ICON_BANK = CATEGORY_ICON_KEYS;

function CategoryDialog({
  open,
  category,
  onClose,
  onSave,
}: {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSave: (payload: Partial<Category>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Category>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(category ? { ...category } : { status: "active", sort_order: 0 });
    }
  }, [open, category]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card">
        <form
          className="edit-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await onSave(form);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="edit-form-header">
            <div>
              <p className="eyebrow">Categories</p>
              <h3>{category ? `Modifier ${category.name}` : "Creer une categorie"}</h3>
            </div>
            <button className="ghost-button compact-button" onClick={onClose} type="button">Fermer</button>
          </div>
          <div className="edit-form-grid">
            <label className="field"><span>Nom</span><input required value={form.name ?? ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Slug</span><input required value={form.slug ?? ""} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} /></label>
            <label className="field"><span>Description</span><textarea value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label className="field"><span>URL image</span><input value={form.image_url ?? ""} onChange={(event) => setForm((current) => ({ ...current, image_url: event.target.value }))} /></label>
            <label className="field"><span>Titre marketing</span><input value={form.marketing_title ?? ""} onChange={(event) => setForm((current) => ({ ...current, marketing_title: event.target.value }))} /></label>
            <label className="field"><span>Sous-titre marketing</span><input value={form.marketing_subtitle ?? ""} onChange={(event) => setForm((current) => ({ ...current, marketing_subtitle: event.target.value }))} /></label>
            <label className="field">
              <span>Statut</span>
              <select value={form.status ?? "active"} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <label className="field"><span>Ordre d'affichage</span><input type="number" value={form.sort_order ?? 0} onChange={(event) => setForm((current) => ({ ...current, sort_order: Number(event.target.value) }))} /></label>
            <label className="field field-wide">
              <span>
                Icone choisie:{" "}
                {form.icon
                  ? <span style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: "0.25rem" }}><CategoryIcon icon={form.icon} size={22} /></span>
                  : <strong>—</strong>}
                {" "}<small style={{ color: "#6b7280" }}>{form.icon ?? ""}</small>
              </span>
              <input placeholder="Cle d'icone (ex: wrench, leaf, bolt...)" value={form.icon ?? ""} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value || null }))} />
            </label>
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Banque d'icones</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
              {ICON_BANK.map((icon) => (
                <button
                  className={form.icon === icon ? "module-card module-card-button module-card-active" : "module-card module-card-button"}
                  key={icon}
                  onClick={() => setForm((current) => ({ ...current, icon }))}
                  style={{ padding: "0.35rem 0.5rem", minWidth: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}
                  title={icon}
                  type="button"
                >
                  <CategoryIcon icon={icon} size={20} />
                  <span style={{ fontSize: "0.6rem", color: "#6b7280" }}>{icon}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="edit-form-actions">
            <button className="ghost-button" onClick={onClose} type="button">Annuler</button>
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Enregistrement..." : "Enregistrer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ServiceDialog({
  open,
  service,
  categories,
  onClose,
  onSave,
}: {
  open: boolean;
  service: AdminService | null;
  categories: Category[];
  onClose: () => void;
  onSave: (payload: Partial<AdminService>) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<AdminService>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(service ? { ...service } : { status: "active", sort_order: 0 });
    }
  }, [open, service]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card">
        <form
          className="edit-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await onSave(form);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="edit-form-header">
            <div>
              <p className="eyebrow">Services</p>
              <h3>{service ? `Modifier ${service.name}` : "Creer un service"}</h3>
            </div>
            <button className="ghost-button compact-button" onClick={onClose} type="button">Fermer</button>
          </div>
          <div className="edit-form-grid">
            <label className="field">
              <span>Categorie *</span>
              <select required value={form.category_id ?? ""} onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))}>
                <option value="">Selectionner</option>
                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Nom *</span><input required value={form.name ?? ""} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Slug *</span><input required value={form.slug ?? ""} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} /></label>
            <label className="field field-wide"><span>Description</span><textarea value={form.description ?? ""} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value || null }))} /></label>
            <label className="field"><span>URL image</span><input value={form.image_url ?? ""} onChange={(event) => setForm((current) => ({ ...current, image_url: event.target.value || null }))} /></label>
            <label className="field"><span>Titre marketing</span><input value={form.marketing_title ?? ""} onChange={(event) => setForm((current) => ({ ...current, marketing_title: event.target.value || null }))} /></label>
            <label className="field"><span>Etiquette prix</span><input placeholder="ex: A partir de 50$" value={form.price_label ?? ""} onChange={(event) => setForm((current) => ({ ...current, price_label: event.target.value || null }))} /></label>
            <label className="field"><span>Prix de base publication (cents)</span><input type="number" min={0} value={form.base_publication_price_cents ?? ""} onChange={(event) => setForm((current) => ({ ...current, base_publication_price_cents: event.target.value === "" ? null : Number(event.target.value) }))} /></label>
            <label className="field">
              <span>Statut</span>
              <select value={form.status ?? "active"} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <label className="field"><span>Ordre d'affichage</span><input type="number" value={form.sort_order ?? 0} onChange={(event) => setForm((current) => ({ ...current, sort_order: Number(event.target.value) }))} /></label>
          </div>
          <div className="edit-form-actions">
            <button className="ghost-button" onClick={onClose} type="button">Annuler</button>
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Enregistrement..." : "Enregistrer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(() => readStoredAuth());
  const [authForm, setAuthForm] = useState<AuthForm>({ apiBaseUrl: DEFAULT_API_BASE_URL, email: "admin@jobizy.local", password: "", forceAdminHeader: true });
  const [access, setAccess] = useState<string[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>("overview");
  const [resources, setResources] = useState<Record<ResourceKey, PaginatedResult<RowData>>>({ requests: emptyResult(), quotes: emptyResult(), missions: emptyResult(), subscriptions: emptyResult(), disputes: emptyResult(), plans: emptyResult(), users: emptyResult() });
  const [filters, setFilters] = useState<Record<ResourceKey, ResourceFilters>>({ requests: defaultFilters(), quotes: defaultFilters(), missions: defaultFilters(), subscriptions: defaultFilters(), disputes: defaultFilters(), plans: defaultFilters(), users: defaultFilters() });
  const [editState, setEditState] = useState<EditState>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [categories, setCategoriesState] = useState<Category[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [adminServices, setAdminServices] = useState<AdminService[]>([]);
  const [servicesTotal, setServicesTotal] = useState(0);
  const [servicesPage, setServicesPage] = useState(1);
  const [servicesFilter, setServicesFilter] = useState({ q: "", category_id: "", status: "" });
  const [creatingService, setCreatingService] = useState(false);
  const [editingService, setEditingService] = useState<AdminService | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshBase(currentAuth: AuthState) {
    const [accessResult, overviewResult, settingsResult, categoriesResult] = await Promise.all([
      getMyAdminAccess(currentAuth),
      getOverview(currentAuth),
      getPlatformSettings(currentAuth),
      getCategories(currentAuth).catch(() => ({ data: [] as Category[] })),
    ]);
    setAccess(accessResult.data.admin_permissions);
    setOverview(overviewResult.data);
    setPlatformSettings(settingsResult.data);
    setCategoriesState(categoriesResult.data ?? []);
  }

  async function loadAdminServices(currentAuth: AuthState, page = 1, nextFilter = servicesFilter) {
    const result = await getAdminServices(currentAuth, {
      q: nextFilter.q || undefined,
      category_id: nextFilter.category_id || undefined,
      status: nextFilter.status || undefined,
      page,
      limit: 20,
    });
    const rows = result.data ?? [];
    const total = (result as any).meta?.total ?? rows.length;
    setAdminServices(rows);
    setServicesTotal(total);
    setServicesPage(page);
  }

  async function loadResource(resource: ResourceKey, currentAuth: AuthState, nextFilters = filters[resource]) {
    const query = { q: nextFilters.q || undefined, status: nextFilters.status || undefined, page: nextFilters.page, limit: nextFilters.limit };
    const result = await getPaginatedResource<RowData>(currentAuth, RESOURCE_META[resource].path, query);
    setResources((current) => ({ ...current, [resource]: result }));
  }

  async function refreshAll(currentAuth: AuthState) {
    setLoading(true);
    setError("");
    try {
      await refreshBase(currentAuth);
      await Promise.all([
        ...(Object.keys(RESOURCE_META) as ResourceKey[]).map((resource) => loadResource(resource, currentAuth)),
        loadAdminServices(currentAuth),
      ]);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (auth) void refreshAll(auth);
  }, [auth]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await login(authForm);
      const nextAuth: AuthState = { apiBaseUrl: authForm.apiBaseUrl, token: response.data.access_token, forceAdminHeader: authForm.forceAdminHeader };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAuth));
      setAuth(nextAuth);
      setNotice("Connexion admin reussie.");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Connexion impossible");
    } finally {
      setLoading(false);
    }
  }

  async function handlePlatformSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !platformSettings) return;
    setLoading(true);
    setError("");
    try {
      const response = await patchPlatformSettings(auth, {
        ...platformSettings,
        supported_locales: Array.isArray(platformSettings.supported_locales) ? platformSettings.supported_locales : String(platformSettings.supported_locales).split(",").map((item) => item.trim()).filter(Boolean),
      });
      setPlatformSettings(response.data);
      setNotice("Parametres plateforme enregistres.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible");
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePublicationMode(enabled: boolean) {
    if (!auth || !platformSettings) return;
    setLoading(true);
    setError("");
    try {
      const response = await patchPlatformSettings(auth, {
        request_publication_payment_enabled: enabled,
      });
      setPlatformSettings(response.data);
      setNotice(enabled ? "Publications passees en mode payant." : "Publications passees en mode gratuit.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible de changer le mode.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(resource: ResourceKey, payload: Record<string, unknown>) {
    if (!auth || !editState) return;
    setLoading(true);
    setError("");
    try {
      await patchResource(auth, `${RESOURCE_META[resource].path}/${String(editState.row.id ?? "")}`, payload);
      setNotice(`${RESOURCE_META[resource].title} mise a jour.`);
      await Promise.all([refreshBase(auth), loadResource(resource, auth)]);
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Mise a jour impossible");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePlan(payload: Record<string, unknown>) {
    if (!auth) return;
    setLoading(true);
    setError("");
    try {
      await postResource(auth, "/admin/plans", payload);
      setNotice("Plan cree.");
      await Promise.all([refreshBase(auth), loadResource("plans", auth)]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Creation impossible");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCategory(payload: Partial<Category>) {
    if (!auth) return;
    setLoading(true);
    setError("");
    try {
      await createCategory(auth, payload);
      setNotice("Categorie creee.");
      const result = await getCategories(auth);
      setCategoriesState(result.data ?? []);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Creation impossible");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCategory(categoryId: string, payload: Partial<Category>) {
    if (!auth) return;
    setLoading(true);
    setError("");
    try {
      await patchCategory(auth, categoryId, payload);
      setNotice("Categorie mise a jour.");
      const result = await getCategories(auth);
      setCategoriesState(result.data ?? []);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Mise a jour impossible");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateService(payload: Partial<AdminService>) {
    if (!auth) return;
    setLoading(true);
    setError("");
    try {
      await createAdminService(auth, payload);
      setNotice("Service cree.");
      await loadAdminServices(auth, servicesPage, servicesFilter);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Creation impossible");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveService(serviceId: string, payload: Partial<AdminService>) {
    if (!auth) return;
    setLoading(true);
    setError("");
    try {
      await patchAdminService(auth, serviceId, payload);
      setNotice("Service mis a jour.");
      await loadAdminServices(auth, servicesPage, servicesFilter);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Mise a jour impossible");
    } finally {
      setLoading(false);
    }
  }

  const summaryCards = useMemo(() => {
    if (!overview) return [];
    return [
      { label: "Utilisateurs", value: overview.users, detail: "Comptes actifs" },
      { label: "Prestataires actifs", value: overview.providers, detail: "Profils disponibles" },
      { label: "Demandes ouvertes", value: overview.open_requests, detail: "A suivre rapidement" },
      { label: "Offres en attente", value: overview.quotes_waiting, detail: "Reponses en cours" },
      { label: "Missions actives", value: overview.active_missions, detail: "Execution terrain" },
      { label: "Litiges ouverts", value: overview.open_disputes, detail: "Moderation necessaire" },
      { label: "Abonnements actifs", value: overview.active_subscriptions, detail: "Base revenu" },
      { label: "Notifications non lues", value: overview.unread_notifications, detail: "Points d'attention" },
    ];
  }, [overview]);

  if (!auth) {
    return (
      <main className="admin-shell admin-shell-single">
        <section className="panel auth-panel auth-panel-admin">
          <p className="eyebrow">Jobizy Admin</p>
          <h1>Console de pilotage V1</h1>
          <p className="section-copy">Supervision de la plateforme, moderation des echanges, gestion des abonnements prestataires et suivi des litiges.</p>
          <form className="stack-form" onSubmit={(event) => void handleLogin(event)}>
            <label className="field"><span>API</span><input value={authForm.apiBaseUrl} onChange={(event) => setAuthForm((current) => ({ ...current, apiBaseUrl: event.target.value }))} /></label>
            <label className="field"><span>Email</span><input value={authForm.email} onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label className="field"><span>Mot de passe</span><input type="password" value={authForm.password} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} /></label>
            <label className="checkbox-row"><input checked={authForm.forceAdminHeader} onChange={(event) => setAuthForm((current) => ({ ...current, forceAdminHeader: event.target.checked }))} type="checkbox" /><span>Forcer le contexte admin</span></label>
            <button className="primary-button" disabled={loading} type="submit">{loading ? "Connexion..." : "Se connecter"}</button>
          </form>
          {error ? <p className="notice notice-error">{error}</p> : null}
        </section>
      </main>
    );
  }

  const activeResource = activeSection !== "overview" && activeSection !== "platform" && activeSection !== "categories" && activeSection !== "services" ? (activeSection as ResourceKey) : null;
  const activeFilters = activeResource ? filters[activeResource] : null;

  return (
    <main className="admin-shell admin-shell-single">
      <section className="panel hero-panel-admin">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Jobizy V1</p>
            <h1>Console admin simplifiee</h1>
            <p>Vue centrale sur l'activite, les points de friction et les modules qui demandent une action.</p>
          </div>
          <div className="button-group">
            <button className="secondary-button" onClick={() => auth && void refreshAll(auth)} type="button">Rafraichir</button>
            <button className="ghost-button" onClick={() => { window.localStorage.removeItem(STORAGE_KEY); setAuth(null); setNotice(""); }} type="button">Se deconnecter</button>
          </div>
        </div>
        <p className="muted-line">Permissions: {access.join(", ") || "aucune"}</p>
        {notice ? <p className="notice notice-success">{notice}</p> : null}
        {error ? <p className="notice notice-error">{error}</p> : null}
      </section>

      <section className="metric-grid">
        {summaryCards.map((item) => <MetricCard key={item.label} detail={item.detail} label={item.label} value={item.value} />)}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Modules admin</h2>
            <p>Acces direct aux fonctions de supervision et de configuration.</p>
          </div>
        </div>
        <div className="module-grid">
          {(Object.keys(SECTION_LABELS) as SectionKey[]).map((section) => (
            <button
              className={activeSection === section ? "module-card module-card-button module-card-active" : "module-card module-card-button"}
              key={section}
              onClick={() => setActiveSection(section)}
              type="button"
            >
              <span>{section === "overview" ? "Pilotage" : section === "platform" ? "Configuration" : "Supervision"}</span>
              <strong>{SECTION_LABELS[section]}</strong>
            </button>
          ))}
        </div>
      </section>

      {activeSection === "overview" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Vue d'ensemble</h2>
              <p>Lecture rapide des modules a surveiller et de leur volumetrie actuelle.</p>
            </div>
          </div>
          <div className="definition-grid">
            <article className="definition-item"><span>Utilisateurs</span><strong>{resources.users.total}</strong></article>
            <article className="definition-item"><span>Services</span><strong>{servicesTotal}</strong></article>
            <article className="definition-item"><span>Demandes</span><strong>{resources.requests.total}</strong></article>
            <article className="definition-item"><span>Offres</span><strong>{resources.quotes.total}</strong></article>
            <article className="definition-item"><span>Missions</span><strong>{resources.missions.total}</strong></article>
            <article className="definition-item"><span>Abonnements</span><strong>{resources.subscriptions.total}</strong></article>
            <article className="definition-item"><span>Litiges</span><strong>{resources.disputes.total}</strong></article>
            <article className="definition-item"><span>Plans</span><strong>{resources.plans.total}</strong></article>
          </div>
        </section>
      ) : null}

      {activeSection === "platform" ? (
        <section className="stack-form">
          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Publications des demandes</p>
                <h2>Mode de publication</h2>
                <p>Definissez si les clients peuvent publier leurs demandes gratuitement ou avec paiement.</p>
              </div>
            </div>
            {platformSettings ? (
              <div style={{ border: "2px solid", borderColor: boolValue(platformSettings.request_publication_payment_enabled) ? "#f59e0b" : "#10b981", borderRadius: "0.5rem", padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ fontSize: "1.1rem" }}>
                      {boolValue(platformSettings.request_publication_payment_enabled) ? "Payant" : "Gratuit"}
                    </strong>
                    <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                      {boolValue(platformSettings.request_publication_payment_enabled)
                        ? `Les clients paient ${((platformSettings.default_request_publication_price_cents ?? 0) / 100).toFixed(2)} ${platformSettings.currency} pour publier une demande.`
                        : "Les clients publient leurs demandes sans frais."}
                    </p>
                  </div>
                  <div className="button-group">
                    <button
                      className={!boolValue(platformSettings.request_publication_payment_enabled) ? "primary-button" : "ghost-button"}
                      disabled={loading}
                      onClick={() => void handleTogglePublicationMode(false)}
                      type="button"
                    >
                      Gratuit
                    </button>
                    <button
                      className={boolValue(platformSettings.request_publication_payment_enabled) ? "primary-button" : "ghost-button"}
                      disabled={loading}
                      onClick={() => void handleTogglePublicationMode(true)}
                      type="button"
                    >
                      Payant
                    </button>
                  </div>
                </div>
                {boolValue(platformSettings.request_publication_payment_enabled) ? (
                  <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb" }}>
                    <form
                      className="button-group"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (!auth) return;
                        setLoading(true);
                        setError("");
                        try {
                          const response = await patchPlatformSettings(auth, {
                            default_request_publication_price_cents: platformSettings.default_request_publication_price_cents ?? 0,
                          });
                          setPlatformSettings(response.data);
                          setNotice("Prix de publication mis a jour.");
                        } catch (saveError) {
                          setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible");
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      <label className="field" style={{ flex: 1, maxWidth: "16rem" }}>
                        <span>Prix de publication (cents)</span>
                        <input
                          type="number"
                          min={0}
                          value={platformSettings.default_request_publication_price_cents ?? 0}
                          onChange={(event) => setPlatformSettings((current) => current ? ({ ...current, default_request_publication_price_cents: Number(event.target.value) }) : current)}
                        />
                      </label>
                      <button className="secondary-button" disabled={loading} style={{ alignSelf: "flex-end" }} type="submit">
                        Sauvegarder le prix
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Parametres generaux</h2>
                <p>Devise, langues, logo, push PWA et expiration automatique des demandes.</p>
              </div>
            </div>
            {platformSettings ? (
              <form className="stack-form" onSubmit={(event) => void handlePlatformSubmit(event)}>
                <div className="edit-form-grid">
                  <label className="field"><span>Devise</span><input value={platformSettings.currency} onChange={(event) => setPlatformSettings((current) => current ? ({ ...current, currency: event.target.value }) : current)} /></label>
                  <label className="field"><span>Locale par defaut</span><input value={platformSettings.default_locale} onChange={(event) => setPlatformSettings((current) => current ? ({ ...current, default_locale: event.target.value }) : current)} /></label>
                  <label className="field"><span>Locales supportees</span><input value={Array.isArray(platformSettings.supported_locales) ? platformSettings.supported_locales.join(", ") : String(platformSettings.supported_locales)} onChange={(event) => setPlatformSettings((current) => current ? ({ ...current, supported_locales: event.target.value }) : current)} /></label>
                  <label className="field"><span>URL logo</span><input value={platformSettings.brand_logo_url ?? ""} onChange={(event) => setPlatformSettings((current) => current ? ({ ...current, brand_logo_url: event.target.value }) : current)} /></label>
                  <label className="field"><span>Expiration auto des demandes (jours)</span><input type="number" value={platformSettings.request_auto_expiry_days} onChange={(event) => setPlatformSettings((current) => current ? ({ ...current, request_auto_expiry_days: Number(event.target.value) }) : current)} /></label>
                  <label className="field"><span>Push PWA actif</span><input checked={Boolean(platformSettings.pwa_push_enabled)} onChange={(event) => setPlatformSettings((current) => current ? ({ ...current, pwa_push_enabled: event.target.checked }) : current)} type="checkbox" /></label>
                </div>
                <div className="button-group"><button className="primary-button" disabled={loading} type="submit">Enregistrer</button></div>
              </form>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeSection === "categories" ? (
        <section className="stack-form">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Categories de services</h2>
                <p>Gerez les categories visibles dans le catalogue client et prestataire.</p>
              </div>
              <button className="primary-button" onClick={() => setCreatingCategory(true)} type="button">Creer une categorie</button>
            </div>
            {categories.length === 0 ? (
              <p className="muted-line">Aucune categorie trouvee.</p>
            ) : (
              <div className="table-wrap">
                <table className="resource-table">
                  <thead>
                    <tr>
                      <th>Icone</th>
                      <th>Nom</th>
                      <th>Slug</th>
                      <th>Statut</th>
                      <th>Ordre</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat.id}>
                        <td style={{ color: "#374151" }}>{cat.icon ? <CategoryIcon icon={cat.icon} size={22} /> : "-"}</td>
                        <td>{cat.name}</td>
                        <td>{cat.slug}</td>
                        <td>{cat.status}</td>
                        <td>{cat.sort_order}</td>
                        <td>
                          <button className="secondary-button compact-button" onClick={() => setEditingCategory(cat)} type="button">Modifier</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activeSection === "services" ? (
        <section className="stack-form">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Services</h2>
                <p>Gerez les services proposes dans le catalogue. {servicesTotal} service(s).</p>
              </div>
              <button className="primary-button" onClick={() => setCreatingService(true)} type="button">Creer un service</button>
            </div>
            <div className="filter-stack">
              <label className="field">
                <span>Recherche</span>
                <input
                  placeholder="Nom, slug, description..."
                  value={servicesFilter.q}
                  onChange={(event) => setServicesFilter((current) => ({ ...current, q: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Categorie</span>
                <select value={servicesFilter.category_id} onChange={(event) => setServicesFilter((current) => ({ ...current, category_id: event.target.value }))}>
                  <option value="">Toutes</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Statut</span>
                <select value={servicesFilter.status} onChange={(event) => setServicesFilter((current) => ({ ...current, status: event.target.value }))}>
                  <option value="">Tous</option>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
              <div className="button-group filter-actions">
                <button className="ghost-button" onClick={() => { const f = { q: "", category_id: "", status: "" }; setServicesFilter(f); if (auth) void loadAdminServices(auth, 1, f); }} type="button">Reinitialiser</button>
                <button className="primary-button" onClick={() => auth && void loadAdminServices(auth, 1, servicesFilter)} type="button">Appliquer</button>
              </div>
            </div>
            {adminServices.length === 0 ? (
              <p className="muted-line">Aucun service trouve.</p>
            ) : (
              <div className="table-wrap">
                <table className="resource-table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Categorie</th>
                      <th>Slug</th>
                      <th>Statut</th>
                      <th>Ordre</th>
                      <th>Prix publi. (cents)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminServices.map((svc) => (
                      <tr key={svc.id}>
                        <td>{svc.name}</td>
                        <td>{svc.category_name ?? svc.category_id}</td>
                        <td>{svc.slug}</td>
                        <td>{svc.status}</td>
                        <td>{svc.sort_order}</td>
                        <td>{svc.base_publication_price_cents ?? "-"}</td>
                        <td>
                          <button className="secondary-button compact-button" onClick={() => setEditingService(svc)} type="button">Modifier</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {servicesTotal > 20 ? (
              <div className="table-footer">
                <span>Page {servicesPage} / {Math.ceil(servicesTotal / 20)}</span>
                <div className="button-group">
                  <button className="ghost-button compact-button" disabled={servicesPage <= 1} onClick={() => auth && void loadAdminServices(auth, servicesPage - 1, servicesFilter)} type="button">Precedent</button>
                  <button className="ghost-button compact-button" disabled={servicesPage >= Math.ceil(servicesTotal / 20)} onClick={() => auth && void loadAdminServices(auth, servicesPage + 1, servicesFilter)} type="button">Suivant</button>
                </div>
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      {activeResource ? (
        <section className="stack-form">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>{RESOURCE_META[activeResource].title}</h2>
                <p>Filtrer, consulter, modifier et suivre les elements de ce module.</p>
              </div>
              <div className="button-group">
                {activeResource === "plans" ? <button className="primary-button" onClick={() => setCreatingPlan(true)} type="button">Creer un plan</button> : null}
                <button className="secondary-button" onClick={() => auth && void loadResource(activeResource, auth)} type="button">Recharger</button>
              </div>
            </div>
            <div className="filter-stack">
              {RESOURCE_META[activeResource].supportsSearch ? (
                <label className="field">
                  <span>Recherche</span>
                  <input placeholder="Titre, email, description..." value={activeFilters?.q ?? ""} onChange={(event) => setFilters((current) => ({ ...current, [activeResource]: { ...current[activeResource], q: event.target.value, page: 1 } }))} />
                </label>
              ) : null}
              <label className="field">
                <span>{RESOURCE_META[activeResource].statusLabel}</span>
                <select value={activeFilters?.status ?? ""} onChange={(event) => setFilters((current) => ({ ...current, [activeResource]: { ...current[activeResource], status: event.target.value, page: 1 } }))}>
                  <option value="">Tous</option>
                  {RESOURCE_META[activeResource].statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <div className="button-group filter-actions">
                <button className="ghost-button" onClick={() => { setFilters((current) => ({ ...current, [activeResource]: defaultFilters() })); if (auth) void loadResource(activeResource, auth, defaultFilters()); }} type="button">Reinitialiser</button>
                <button className="primary-button" onClick={() => auth && void loadResource(activeResource, auth)} type="button">Appliquer</button>
              </div>
            </div>
          </section>

          <ResourceTable
            onEdit={(row) => setEditState({ resource: activeResource, row })}
            onPageChange={(page) => {
              const nextFilter = { ...filters[activeResource], page };
              setFilters((current) => ({ ...current, [activeResource]: nextFilter }));
              if (auth) void loadResource(activeResource, auth, nextFilter);
            }}
            resource={activeResource}
            result={resources[activeResource]}
          />
        </section>
      ) : null}

      <EditDialog onClose={() => setEditState(null)} onSave={handleSaveEdit} state={editState} />
      <PlanCreateDialog onClose={() => setCreatingPlan(false)} onCreate={handleCreatePlan} open={creatingPlan} />
      <CategoryDialog
        category={null}
        onClose={() => setCreatingCategory(false)}
        onSave={async (payload) => { await handleCreateCategory(payload); setCreatingCategory(false); }}
        open={creatingCategory}
      />
      <CategoryDialog
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onSave={async (payload) => { if (editingCategory) { await handleSaveCategory(editingCategory.id, payload); } setEditingCategory(null); }}
        open={editingCategory !== null}
      />
      <ServiceDialog
        categories={categories}
        service={null}
        onClose={() => setCreatingService(false)}
        onSave={async (payload) => { await handleCreateService(payload); setCreatingService(false); }}
        open={creatingService}
      />
      <ServiceDialog
        categories={categories}
        service={editingService}
        onClose={() => setEditingService(null)}
        onSave={async (payload) => { if (editingService) { await handleSaveService(editingService.id, payload); } setEditingService(null); }}
        open={editingService !== null}
      />
    </main>
  );
}
