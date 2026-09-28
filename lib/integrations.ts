import type { Entry, Settings } from "@/types";
// Integration ports keep external providers out of UI and storage code.
export interface CalendarProvider {
  connect(): Promise<void>;
  listEvents(from: Date, to: Date): Promise<Entry[]>;
  pushEvent(event: Entry): Promise<void>;
}
export interface DeliveryProvider {
  courier: string;
  track(trackingNumber: string): Promise<Pick<Entry, "status" | "date">>;
}
export interface ReceiptProvider {
  extract(image: Blob): Promise<Partial<Entry>>;
}
export interface BriefingProvider {
  summarize(entries: Entry[], settings: Settings): Promise<string>;
}
export interface TransactionProvider {
  fetchSince(date: Date): Promise<Entry[]>;
}
