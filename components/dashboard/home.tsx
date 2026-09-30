"use client";
import {
  CalendarDays,
  CheckCheck,
  Receipt,
  Package,
  TrendingDown,
  Wallet,
  Sun,
  Sparkles,
  ArrowUpRight,
  SlidersHorizontal,
  StickyNote,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Entry, Kind } from "@/types";
import { day, offset, occurs, priceFacts, briefing, money } from "@/lib/model";
import { DashboardSection, EmptyState, GlassCard } from "../ui";
import { TaskRow, EventRow, BillRow, DeliveryCard, PriceCard } from "../rows";
import { WeatherCard } from "./weather";
import { ExpenseSummary } from "./spending";
export function Home({
  navigate,
  open,
  add,
}: {
  navigate: (p: string) => void;
  open: (e: Entry) => void;
  add: (k: Kind) => void;
}) {
  const { entries, settings } = useStore(),
    today = day();
  const tasks = entries.filter(
    (e) => e.kind === "tasks" && !e.completed && (!e.date || e.date <= today),
  );
  const events = entries
    .filter(
      (e) =>
        e.kind === "events" && (occurs(e, today) || (e.date || "") > today),
    )
    .sort((a, b) =>
      `${occurs(a, today) ? today : a.date}${a.time}`.localeCompare(
        `${occurs(b, today) ? today : b.date}${b.time}`,
      ),
    );
  const bills = entries
    .filter((e) => e.kind === "bills" && !e.paid)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const deliveries = entries
    .filter((e) => e.kind === "deliveries" && e.status !== "Delivered")
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const products = entries.filter(
    (e) =>
      e.kind === "products" &&
      e.status !== "Stopped" &&
      e.status !== "Purchased",
  );
  const drops = products.filter(
    (e) =>
      priceFacts(e).drop > 0 &&
      day(new Date(priceFacts(e).changedAt || 0)) === today,
  );
  const notes = entries.filter(
    (e) => e.kind === "notes" && e.pinned && !e.archived,
  );
  const overdue = bills.filter((e) => e.date && e.date < today);
  const attention =
    overdue.length +
    tasks.filter((e) => e.priority === "High" || (e.date && e.date < today))
      .length +
    products.filter((e) => priceFacts(e).target).length;
  const hour = new Date().getHours();
  const stats: [string, string, number | string, typeof Sun][] = [
    [
      "events",
      "events",
      events.filter((e) => occurs(e, today)).length,
      CalendarDays,
    ],
    ["tasks", "tasks", tasks.length, CheckCheck],
    ["bills", "bills", bills.filter((e) => e.date === today).length, Receipt],
    [
      "deliveries",
      "delivery",
      deliveries.filter((e) => e.date === today).length,
      Package,
    ],
    ["products", "price drops", drops.length, TrendingDown],
    [
      "expenses",
      "spent today",
      money(
        entries
          .filter((e) => e.kind === "expenses" && e.date === today)
          .reduce((s, e) => s + (e.amount || 0), 0),
        settings.currency,
      ),
      Wallet,
    ],
  ];
  const widgets: Record<string, React.ReactNode> = {
    briefing: (
      <GlassCard className="briefing-card">
        <div className="section-title">
          <h2>
            <Sparkles size={18} />
            Daily briefing
          </h2>
        </div>
        <p>{briefing(entries, settings)}</p>
      </GlassCard>
    ),
    weather: (
      <GlassCard className="weather-wrapper">
        <WeatherCard onLocation={() => navigate("settings")} />
      </GlassCard>
    ),
    events: (
      <DashboardSection
        title="Up next"
        icon={<CalendarDays size={18} />}
        action={() => navigate("events")}
      >
        {events.length ? (
          events
            .slice(0, 3)
            .map((e) => <EventRow key={e.id} entry={e} open={() => open(e)} />)
        ) : (
          <EmptyState
            title="Nothing on the calendar"
            body="Keep a little room for what matters."
            action={() => add("events")}
            label="Add an event"
          />
        )}
      </DashboardSection>
    ),
    tasks: (
      <DashboardSection
        title="Tasks"
        icon={<CheckCheck size={19} />}
        action={() => navigate("tasks")}
      >
        {tasks.length ? (
          tasks
            .slice(0, 4)
            .map((e) => <TaskRow key={e.id} entry={e} open={() => open(e)} />)
        ) : (
          <EmptyState
            title="You’re all caught up"
            body="Enjoy a little breathing space."
            action={() => add("tasks")}
            label="Add a task"
          />
        )}
      </DashboardSection>
    ),
    bills: (
      <DashboardSection
        title="Bills due soon"
        icon={<Receipt size={18} />}
        action={() => navigate("bills")}
      >
        {bills.length ? (
          <>
            {bills.slice(0, 3).map((e) => (
              <BillRow key={e.id} entry={e} open={() => open(e)} />
            ))}
            <div className="card-foot">
              Due in the next 7 days
              <strong>
                {money(
                  bills
                    .filter(
                      (e) => e.date && e.date >= today && e.date <= offset(7),
                    )
                    .reduce((s, e) => s + (e.amount || 0), 0),
                  settings.currency,
                )}
              </strong>
            </div>
          </>
        ) : (
          <EmptyState
            title="No bills coming up"
            action={() => add("bills")}
            label="Add a bill"
          />
        )}
      </DashboardSection>
    ),
    spending: (
      <DashboardSection
        title="Spending"
        icon={<Wallet size={18} />}
        action={() => navigate("expenses")}
      >
        <ExpenseSummary />
      </DashboardSection>
    ),
    deliveries: (
      <DashboardSection
        title="Deliveries"
        icon={<Package size={18} />}
        action={() => navigate("deliveries")}
      >
        {deliveries.length ? (
          deliveries
            .slice(0, 2)
            .map((e) => (
              <DeliveryCard key={e.id} entry={e} open={() => open(e)} />
            ))
        ) : (
          <EmptyState
            title="Nothing in transit"
            action={() => add("deliveries")}
            label="Add a delivery"
          />
        )}
      </DashboardSection>
    ),
    prices: (
      <DashboardSection
        title="Price Watch"
        icon={<TrendingDown size={19} />}
        action={() => navigate("products")}
        className="price-watch-home"
      >
        <div className="price-watch-sub">
          <span className="badge teal">
            {drops.length
              ? `${drops.length} price drops today`
              : "Your price watch"}
          </span>
        </div>
        {products.length ? (
          (drops.length ? drops : products)
            .slice(0, 2)
            .map((e) => (
              <PriceCard key={e.id} entry={e} compact open={() => open(e)} />
            ))
        ) : (
          <EmptyState
            title="Something on your wishlist?"
            body="Keep an eye on the price. Buy when it feels right."
            action={() => add("products")}
            label="Track your first product"
          />
        )}
        {products.length > 0 && !drops.length && (
          <p className="muted">No price changes today.</p>
        )}
      </DashboardSection>
    ),
    notes: (
      <DashboardSection
        title="Pinned notes"
        icon={<StickyNote size={18} />}
        action={() => navigate("notes")}
      >
        {notes.length ? (
          <div className="notes-preview">
            {notes.slice(0, 3).map((e) => (
              <button key={e.id} onClick={() => open(e)}>
                <span>PINNED NOTE</span>
                <h3>{e.title}</h3>
                <p>{e.body?.slice(0, 140)}</p>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="A place for little thoughts"
            action={() => add("notes")}
            label="Jot something down"
          />
        )}
      </DashboardSection>
    ),
  };
  let order = settings.widgets.filter(
    (w) => !settings.hiddenWidgets.includes(w),
  );
  const urgent: string[] = [];
  if (overdue.length || bills.some((e) => e.date === today))
    urgent.push("bills");
  if (
    events.some(
      (e) =>
        occurs(e, today) &&
        e.time &&
        e.time >= new Date().toTimeString().slice(0, 5),
    )
  )
    urgent.push("events");
  if (deliveries.some((e) => e.date === today)) urgent.push("deliveries");
  if (drops.some((e) => priceFacts(e).target)) urgent.push("prices");
  order = [
    ...urgent.filter((w) => order.includes(w)),
    ...order.filter((w) => !urgent.includes(w)),
  ];
  const quietSections: Record<
    string,
    {
      count: number;
      title: string;
      status: string;
      route: string;
      icon: typeof Sun;
    }
  > = {
    tasks: {
      count: tasks.length,
      title: "Tasks",
      status: "Nothing due",
      route: "tasks",
      icon: CheckCheck,
    },
    events: {
      count: events.length,
      title: "Calendar",
      status: "No upcoming events",
      route: "events",
      icon: CalendarDays,
    },
    bills: {
      count: bills.length,
      title: "Bills",
      status: "Nothing unpaid",
      route: "bills",
      icon: Receipt,
    },
    deliveries: {
      count: deliveries.length,
      title: "Deliveries",
      status: "Nothing in transit",
      route: "deliveries",
      icon: Package,
    },
    prices: {
      count: products.length,
      title: "Price Watch",
      status: "Track a product",
      route: "products",
      icon: TrendingDown,
    },
    notes: {
      count: notes.length,
      title: "Notes",
      status: "No pinned notes",
      route: "notes",
      icon: StickyNote,
    },
    spending: {
      count: entries.filter((e) => e.kind === "expenses").length,
      title: "Spending",
      status: "No expenses yet",
      route: "expenses",
      icon: Wallet,
    },
  };
  const quiet = order.filter((w) => quietSections[w]?.count === 0);
  const active = order.filter((w) => !quiet.includes(w));
  return (
    <div className="home-dashboard">
      <header className="home-heading">
        <p className="eyebrow">
          {new Date().toLocaleDateString("en-AU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1>
          Good {hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"},{" "}
          <span>{settings.name}</span>
        </h1>
        <p>
          <span className="status-orb" />
          {attention
            ? `${attention} thing${attention > 1 ? "s" : ""} could use your attention.`
            : "Your day looks clear."}
        </p>
      </header>
      <GlassCard className="today-card">
        <div className="section-title">
          <h2>
            <Sun size={20} />
            Today
          </h2>
          <button className="text-button" onClick={() => navigate("today")}>
            Timeline <ArrowRight size={16} />
          </button>
        </div>
        <div className="today-stats">
          {stats.map(([route, label, value, Icon]) => (
            <button key={route} onClick={() => navigate(route)}>
              <Icon size={19} />
              <strong>{value}</strong>
              <small>{label}</small>
            </button>
          ))}
        </div>
      </GlassCard>
      <div className="dashboard-grid">
        {active.map((w) => (
          <div key={w} className={`widget widget-${w}`}>
            {widgets[w]}
          </div>
        ))}
        {quiet.length > 0 && (
          <GlassCard className="home-quiet">
            <h2>All clear</h2>
            <div className="home-quiet-grid">
              {quiet.map((w) => {
                const section = quietSections[w],
                  Icon = section.icon;
                return (
                  <button key={w} onClick={() => navigate(section.route)}>
                    <Icon size={17} aria-hidden="true" />
                    <span>
                      <strong>{section.title}</strong>
                      <small>{section.status}</small>
                    </span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </GlassCard>
        )}
      </div>
      <button className="customize" onClick={() => navigate("widgets")}>
        <SlidersHorizontal size={16} />
        Edit Home
      </button>
    </div>
  );
}
