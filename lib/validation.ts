import { z } from "zod";
import { kinds } from "@/types";
const safeUrl = z
  .string()
  .max(2048)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Use an HTTPS URL");
export const entrySchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(kinds),
    version: z.number().int().min(0),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    title: z.string().trim().min(1).max(240),
    notes: z.string().max(10000).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    category: z.string().max(80).optional(),
    priority: z.enum(["Low", "Normal", "High"]).optional(),
    completed: z.boolean().optional(),
    recurrence: z
      .enum([
        "none",
        "daily",
        "weekly",
        "fortnightly",
        "monthly",
        "quarterly",
        "yearly",
        "custom",
      ])
      .optional(),
    customDays: z.number().int().min(1).max(3650).optional(),
    reminder: z.boolean().optional(),
    location: z.string().max(250).optional(),
    colour: z.string().max(30).optional(),
    company: z.string().max(160).optional(),
    amount: z.number().min(0).max(1e9).optional(),
    paid: z.boolean().optional(),
    merchant: z.string().max(160).optional(),
    body: z.string().max(30000).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    retailer: z.string().max(160).optional(),
    trackingNumber: z.string().max(200).optional(),
    courier: z.string().max(120).optional(),
    url: safeUrl.optional(),
    status: z.string().max(40).optional(),
    image: safeUrl.optional(),
    price: z.number().min(0).max(1e9).optional(),
    originalPrice: z.number().min(0).max(1e9).optional(),
    targetPrice: z.number().min(0).max(1e9).optional(),
    availability: z.enum(["In stock", "Out of stock", "Unknown"]).optional(),
    wishlistId: z.string().max(100).optional(),
    alert: z.string().max(50).optional(),
    purchasePrice: z.number().min(0).max(1e9).optional(),
    purchasedAt: z.string().optional(),
    lastChecked: z.string().optional(),
    read: z.boolean().optional(),
    linkKind: z.enum(kinds).optional(),
    linkId: z.string().uuid().optional(),
    dedupe: z.string().max(300).optional(),
    profile: z
      .object({
        name: z.string().min(1).max(80),
        currency: z.enum(["AUD", "USD", "NZD", "GBP", "EUR", "NPR", "INR"]),
        theme: z.enum(["dark", "light", "system"]),
        location: z.string().min(1).max(160),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        timeFormat: z.enum(["12", "24"]),
        dateFormat: z.enum(["D MMM", "DD/MM/YYYY", "MM/DD/YYYY"]),
        widgets: z.array(z.string()).max(20),
        hiddenWidgets: z.array(z.string()).max(20),
        onboarded: z.boolean(),
        notifications: z.record(z.string(), z.boolean()),
        categories: z.array(z.string().max(80)).max(100),
      })
      .optional(),
    history: z
      .array(
        z.object({
          id: z.string().uuid(),
          price: z.number().min(0),
          availability: z.string(),
          retailer: z.string(),
          recorded_at: z.string().datetime(),
        }),
      )
      .max(10000)
      .optional(),
  })
  .superRefine((e, ctx) => {
    if (["bills", "expenses"].includes(e.kind) && e.amount === undefined)
      ctx.addIssue({ code: "custom", message: "Amount is required" });
    if (e.kind === "products" && e.price === undefined)
      ctx.addIssue({ code: "custom", message: "Price is required" });
    if (["events", "bills", "expenses"].includes(e.kind) && !e.date)
      ctx.addIssue({ code: "custom", message: "Date is required" });
    if (e.endTime && e.time && e.endTime <= e.time)
      ctx.addIssue({
        code: "custom",
        message: "End time must be after start time",
      });
    if (
      e.date &&
      (!Number.isFinite(Date.parse(e.date + "T12:00:00")) ||
        new Date(e.date + "T12:00:00").toISOString().slice(0, 10) !== e.date)
    )
      ctx.addIssue({ code: "custom", message: "Invalid calendar date" });
  });
export const mutationSchema = z.object({
  opId: z.string().uuid(),
  action: z.enum(["upsert", "delete"]),
  entry: entrySchema,
  expectedVersion: z.number().int().min(0),
  restoreHistory: z.boolean().optional(),
});
