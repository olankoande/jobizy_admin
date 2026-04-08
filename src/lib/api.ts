import type { AdminAccess, AdminOverview, AdminService, ApiEnvelope, AuthState, Category, PaginatedResult, PlatformSettings } from "../types";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, normalizedBaseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function request<T>(auth: AuthState, path: string, options: RequestOptions = {}) {
  const response = await fetch(buildUrl(auth.apiBaseUrl, path, options.query), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
      ...(auth.forceAdminHeader ? { "x-role": "admin" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? `La requete a echoue (${response.status})`);
  }

  return (await response.json()) as ApiEnvelope<T>;
}

export async function login(params: { apiBaseUrl: string; email: string; password: string; forceAdminHeader: boolean }) {
  const response = await fetch(buildUrl(params.apiBaseUrl, "/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(params.forceAdminHeader ? { "x-role": "admin" } : {}),
    },
    body: JSON.stringify({ email: params.email, password: params.password }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message ?? "Connexion impossible");
  }

  return (await response.json()) as ApiEnvelope<{ access_token: string; refresh_token: string; expires: number }>;
}

export async function getMyAdminAccess(auth: AuthState) {
  return request<AdminAccess>(auth, "/admin/me/access");
}

export async function getOverview(auth: AuthState) {
  return request<AdminOverview>(auth, "/admin/overview");
}

export async function getPlatformSettings(auth: AuthState) {
  return request<PlatformSettings>(auth, "/admin/platform-settings");
}

export async function patchPlatformSettings(auth: AuthState, body: Partial<PlatformSettings>) {
  return request<PlatformSettings>(auth, "/admin/platform-settings", { method: "PATCH", body });
}

export async function getPaginatedResource<T>(auth: AuthState, path: string, query?: RequestOptions["query"]) {
  const response = await request<T[]>(auth, path, { query });
  return {
    rows: response.data ?? [],
    total: response.meta?.total ?? 0,
    page: response.meta?.page ?? 1,
    limit: response.meta?.limit ?? 20,
  } satisfies PaginatedResult<T>;
}

export async function patchResource<T>(auth: AuthState, path: string, body: unknown) {
  return request<T>(auth, path, { method: "PATCH", body });
}

export async function postResource<T>(auth: AuthState, path: string, body?: unknown) {
  return request<T>(auth, path, { method: "POST", body });
}

export async function getCategories(auth: AuthState) {
  return request<Category[]>(auth, "/admin/categories");
}

export async function createCategory(auth: AuthState, body: Partial<Category>) {
  return request<Category>(auth, "/admin/categories", { method: "POST", body });
}

export async function patchCategory(auth: AuthState, categoryId: string, body: Partial<Category>) {
  return request<Category>(auth, `/admin/categories/${categoryId}`, { method: "PATCH", body });
}

export async function createAdminUser(auth: AuthState, body: unknown) {
  return request<Record<string, unknown>>(auth, "/admin/users", { method: "POST", body });
}

export async function getAdminServices(auth: AuthState, query?: RequestOptions["query"]) {
  return request<AdminService[]>(auth, "/admin/services", { query });
}

export async function createAdminService(auth: AuthState, body: Partial<AdminService>) {
  return request<AdminService>(auth, "/admin/services", { method: "POST", body });
}

export async function patchAdminService(auth: AuthState, serviceId: string, body: Partial<AdminService>) {
  return request<AdminService>(auth, `/admin/services/${serviceId}`, { method: "PATCH", body });
}
