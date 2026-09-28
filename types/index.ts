export const kinds = [
  "tasks",
  "events",
  "bills",
  "expenses",
  "notes",
  "deliveries",
  "products",
  "wishlists",
  "notifications",
  "activity_log",
  "settings",
] as const;
export type Kind = (typeof kinds)[number];
export type Entry = {
  id: string;
  kind: Kind;
  version: number;
  created_at: string;
  updated_at: string;
  title: string;
  notes?: string;
  date?: string;
  time?: string;
  endTime?: string;
  category?: string;
  priority?: string;
  completed?: boolean;
  recurrence?: string;
  customDays?: number;
  reminder?: boolean;
  location?: string;
  colour?: string;
  company?: string;
  amount?: number;
  paid?: boolean;
  merchant?: string;
  body?: string;
  pinned?: boolean;
  archived?: boolean;
  retailer?: string;
  trackingNumber?: string;
  courier?: string;
  url?: string;
  status?: string;
  image?: string;
  price?: number;
  originalPrice?: number;
  targetPrice?: number;
  availability?: string;
  wishlistId?: string;
  alert?: string;
  purchasePrice?: number;
  purchasedAt?: string;
  lastChecked?: string;
  read?: boolean;
  linkKind?: Kind;
  linkId?: string;
  dedupe?: string;
  profile?: Settings;
  history?: PricePoint[];
};
export type PricePoint = {
  id: string;
  price: number;
  availability: string;
  retailer: string;
  recorded_at: string;
};
export type Settings = {
  name: string;
  currency: string;
  theme: "dark" | "light" | "system";
  location: string;
  latitude: number;
  longitude: number;
  timeFormat: "12" | "24";
  dateFormat: "D MMM" | "DD/MM/YYYY" | "MM/DD/YYYY";
  widgets: string[];
  hiddenWidgets: string[];
  onboarded: boolean;
  notifications: Record<string, boolean>;
  categories: string[];
};
export type Mutation = {
  opId: string;
  action: "upsert" | "delete";
  entry: Entry;
  expectedVersion: number;
  restoreHistory?: boolean;
};
export const defaults: Settings = {
  name: "Sagar",
  currency: "AUD",
  theme: "dark",
  location: "Sydney",
  latitude: -33.8688,
  longitude: 151.2093,
  timeFormat: "12",
  dateFormat: "D MMM",
  widgets: [
    "briefing",
    "weather",
    "events",
    "tasks",
    "bills",
    "spending",
    "deliveries",
    "prices",
    "notes",
  ],
  hiddenWidgets: [],
  onboarded: false,
  notifications: {
    products: true,
    bills: true,
    tasks: true,
    deliveries: true,
    events: true,
  },
  categories: [],
};
export const labels: Record<Kind, string> = {
  tasks: "Tasks",
  events: "Events",
  bills: "Bills",
  expenses: "Expenses",
  notes: "Notes",
  deliveries: "Deliveries",
  products: "Price Watch",
  wishlists: "Wishlists",
  notifications: "Notifications",
  activity_log: "Activity",
  settings: "Settings",
};
