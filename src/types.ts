export type AuthState = {
  apiBaseUrl: string;
  token: string;
  forceAdminHeader: boolean;
};

export type ApiEnvelope<T> = {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
};

export type PaginatedResult<T> = {
  rows: T[];
  total: number;
  page: number;
  limit: number;
};

export type AdminAccess = {
  role: string;
  admin_role_codes: string[];
  admin_permissions: string[];
};

export type AdminOverview = {
  users: number;
  providers: number;
  requests: number;
  open_requests: number;
  quotes_waiting: number;
  missions: number;
  active_missions: number;
  open_disputes: number;
  active_subscriptions: number;
  unread_notifications: number;
};

export type PlatformSettings = {
  currency: string;
  default_locale: string;
  supported_locales: string[] | string;
  brand_logo_url?: string | null;
  pwa_push_enabled: boolean | number;
  request_auto_expiry_days: number;
  request_publication_payment_enabled?: boolean | number;
  default_request_publication_price_cents?: number;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  icon?: string | null;
  marketing_title?: string | null;
  marketing_subtitle?: string | null;
  status: string;
  sort_order: number;
};

export type AdminService = {
  id: string;
  category_id: string;
  category_name?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  image_url?: string | null;
  marketing_title?: string | null;
  price_label?: string | null;
  base_publication_price_cents?: number | null;
  status: string;
  sort_order: number;
};
