"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type View = "dashboard" | "stations" | "evs" | "reservations" | "admin";
type ConnectorType = "CCS2" | "Type 2";
type ChargingPointId = string;
type ReservationStatus = "Confirmed" | "Cancelled";
type DisplayStatus = "Confirmed" | "In progress" | "Completed" | "Cancelled";
type FeedbackKind = "success" | "error" | "info";

interface Feedback {
  kind: FeedbackKind;
  text: string;
}

interface ActionResult {
  ok: boolean;
  message: string;
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

interface Station {
  id: number;
  name: string;
  city: string;
  connector: ConnectorType;
  powerKW: number;
  tariffPerKWh: number;
  pointIds: ChargingPointId[];
}

interface ChargingPoint {
  id: ChargingPointId;
  stationId: number;
}

interface Ev {
  id: string;
  number: string;
  model: string;
  batteryKWh: number;
  connector: ConnectorType;
}

interface Reservation {
  ref: string;
  stationId: number;
  stationName: string;
  pointId: ChargingPointId;
  evId: string;
  vehicle: string;
  startMs: number;
  endMs: number;
  energyKWh: number;
  cost: number;
  status: ReservationStatus;
}

interface ReservationForm {
  stationId: number;
  pointId: ChargingPointId;
  evId: string;
  start: string;
  end: string;
}

interface Estimate {
  hours: number;
  energyKWh: number;
  cost: number;
}

interface StationDraft {
  name: string;
  city: string;
  connector: ConnectorType;
  power: string;
  tariff: string;
  pointCount: string;
  prefix: string;
}

interface EvDraft {
  number: string;
  model: string;
  battery: string;
  connector: ConnectorType;
}

/* -------------------------------------------------------------------------- */
/*  Sample data                                                               */
/* -------------------------------------------------------------------------- */

const CONNECTORS: ConnectorType[] = ["CCS2", "Type 2"];

const INITIAL_STATIONS: Station[] = [
  {
    id: 1,
    name: "Indiranagar EV Hub",
    city: "Bengaluru",
    connector: "CCS2",
    powerKW: 60,
    tariffPerKWh: 18,
    pointIds: ["IND-01", "IND-02", "IND-03", "IND-04"],
  },
  {
    id: 2,
    name: "MG Road Charging Plaza",
    city: "Bengaluru",
    connector: "Type 2",
    powerKW: 22,
    tariffPerKWh: 14,
    pointIds: ["MGR-01", "MGR-02", "MGR-03"],
  },
  {
    id: 3,
    name: "Whitefield Fast Charge",
    city: "Bengaluru",
    connector: "CCS2",
    powerKW: 120,
    tariffPerKWh: 22,
    pointIds: ["WHT-01", "WHT-02"],
  },
  {
    id: 4,
    name: "Mysuru Green Station",
    city: "Mysuru",
    connector: "Type 2",
    powerKW: 30,
    tariffPerKWh: 15,
    pointIds: ["MYS-01", "MYS-02", "MYS-03", "MYS-04", "MYS-05"],
  },
];

const INITIAL_EVS: Ev[] = [
  { id: "ev-1", number: "KA01EV2026", model: "My EV", batteryKWh: 30, connector: "Type 2" },
  { id: "ev-2", number: "KA05MN4821", model: "Tata Nexon EV", batteryKWh: 40.5, connector: "CCS2" },
  { id: "ev-3", number: "KA03EV9087", model: "MG ZS EV", batteryKWh: 50.3, connector: "CCS2" },
];

const NAV_ITEMS: { view: View; label: string; icon: string }[] = [
  { view: "dashboard", label: "Dashboard", icon: "▦" },
  { view: "stations", label: "Stations", icon: "⚡" },
  { view: "evs", label: "My EVs", icon: "🚗" },
  { view: "reservations", label: "Reservations", icon: "🗓" },
  { view: "admin", label: "Admin", icon: "⚙" },
];

/* -------------------------------------------------------------------------- */
/*  Style constants                                                           */
/* -------------------------------------------------------------------------- */

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#0f1b3d] shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary = `${btnBase} bg-emerald-600 text-white shadow-sm hover:bg-emerald-700`;
const btnSecondary = `${btnBase} border border-slate-300 bg-white text-[#0f1b3d] hover:bg-slate-50`;
const btnDanger = `${btnBase} border border-red-200 bg-white text-red-700 hover:bg-red-50`;
const cardCls = "rounded-2xl border border-slate-200 bg-white shadow-sm";

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                              */
/* -------------------------------------------------------------------------- */

function formatNumber2(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatINR(value: number): string {
  return `₹${formatNumber2(value)}`;
}

function formatDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parseLocal(value: string): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function toConnector(value: string): ConnectorType | null {
  return value === "CCS2" || value === "Type 2" ? value : null;
}

function getPoints(station: Station): ChargingPoint[] {
  return station.pointIds.map((id) => ({ id, stationId: station.id }));
}

function derivePrefix(station: Station): string {
  const first = station.pointIds[0];
  return first ? first.split("-")[0] : "";
}

function isLive(r: Reservation, nowMs: number): boolean {
  return r.status === "Confirmed" && r.endMs > nowMs;
}

function displayStatus(r: Reservation, nowMs: number): DisplayStatus {
  if (r.status === "Cancelled") return "Cancelled";
  if (nowMs > 0 && r.endMs <= nowMs) return "Completed";
  if (nowMs > 0 && r.startMs <= nowMs) return "In progress";
  return "Confirmed";
}

/**
 * Demo-only overlap check.
 * NOTE: The backend and database MUST enforce this same rule during real API
 * integration (e.g. inside a transaction with row locking or a database-level
 * constraint), including for concurrent booking requests. This frontend check
 * can be bypassed and cannot prevent race conditions.
 *
 * Overlap condition: newStart < existingEnd && newEnd > existingStart
 * Adjacent bookings (end === start) are allowed. Cancelled bookings are ignored.
 */
function findConflict(
  reservations: Reservation[],
  stationId: number,
  pointId: ChargingPointId,
  newStart: number,
  newEnd: number
): Reservation | undefined {
  return reservations.find(
    (r) =>
      r.status === "Confirmed" &&
      r.stationId === stationId &&
      r.pointId === pointId &&
      newStart < r.endMs &&
      newEnd > r.startMs
  );
}

function computeEstimate(startMs: number, endMs: number, station: Station | undefined): Estimate | null {
  if (!station || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const hours = (endMs - startMs) / 3600000;
  const energyKWh = hours * station.powerKW;
  const cost = energyKWh * station.tariffPerKWh;
  return { hours, energyKWh, cost };
}

interface ValidReservation {
  startMs: number;
  endMs: number;
  station: Station;
  ev: Ev;
  estimate: Estimate;
}

function validateReservation(args: {
  station: Station | undefined;
  pointId: ChargingPointId;
  ev: Ev | undefined;
  start: string;
  end: string;
  reservations: Reservation[];
  nowMs: number;
}): Validation<ValidReservation> {
  const { station, pointId, ev, start, end, reservations, nowMs } = args;
  const missing: string[] = [];
  if (!station) missing.push("charging station");
  if (!pointId) missing.push("charging point");
  if (!ev) missing.push("EV");
  if (!start) missing.push("start date and time");
  if (!end) missing.push("end date and time");
  if (missing.length > 0 || !station || !ev) {
    return { ok: false, error: `Please fill in all required fields: ${missing.join(", ")}.` };
  }

  const startMs = parseLocal(start);
  const endMs = parseLocal(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, error: "Please enter a valid start and end date/time." };
  }
  if (startMs <= nowMs) {
    return { ok: false, error: "The start time must be in the future. Please pick a later start time." };
  }
  if (endMs <= startMs) {
    return { ok: false, error: "The end time must be later than the start time." };
  }
  if (!station.pointIds.includes(pointId)) {
    return { ok: false, error: "The selected charging point does not belong to the selected station." };
  }

  const conflict = findConflict(reservations, station.id, pointId, startMs, endMs);
  if (conflict) {
    const freeAlternatives = station.pointIds.filter(
      (p) => p !== pointId && !findConflict(reservations, station.id, p, startMs, endMs)
    );
    const suggestion =
      freeAlternatives.length > 0
        ? ` Free in this time window: ${freeAlternatives.join(", ")}.`
        : " No other point at this station is free in this window; try a different time.";
    return {
      ok: false,
      error: `${pointId} is already reserved from ${formatDateTime(conflict.startMs)} to ${formatDateTime(
        conflict.endMs
      )} (${conflict.ref}).${suggestion}`,
    };
  }

  const estimate = computeEstimate(startMs, endMs, station);
  if (!estimate) {
    return { ok: false, error: "Unable to estimate this booking. Please check the start and end times." };
  }
  return { ok: true, value: { startMs, endMs, station, ev, estimate } };
}

function validateStationDraft(
  draft: StationDraft,
  stations: Station[],
  editing: Station | null,
  liveReservations: Reservation[]
): Validation<Omit<Station, "id">> {
  const fail = (error: string): Validation<Omit<Station, "id">> => ({ ok: false, error });
  const name = draft.name.trim();
  const city = draft.city.trim();
  if (!name) return fail("Station name is required.");
  if (!city) return fail("City is required.");
  if (draft.power.trim() === "") return fail("Power rating is required.");
  const power = Number(draft.power);
  if (!Number.isFinite(power) || power <= 0) return fail("Power rating must be a number greater than 0.");
  if (draft.tariff.trim() === "") return fail("Tariff per kWh is required.");
  const tariff = Number(draft.tariff);
  if (!Number.isFinite(tariff) || tariff < 0) return fail("Tariff must be a number that is 0 or higher.");
  const count = Number(draft.pointCount);
  if (draft.pointCount.trim() === "" || !Number.isInteger(count) || count < 1 || count > 12) {
    return fail("Number of charging points must be a whole number between 1 and 12.");
  }
  const prefix = (editing ? derivePrefix(editing) || draft.prefix : draft.prefix).trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(prefix)) {
    return fail("Charging-point prefix must be 2 to 5 letters or digits (for example IND).");
  }
  const duplicate = stations.some(
    (s) => s.id !== (editing ? editing.id : -1) && s.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) return fail(`A station named "${name}" already exists.`);

  const pointIds: ChargingPointId[] = Array.from(
    { length: count },
    (_, i) => `${prefix}-${String(i + 1).padStart(2, "0")}`
  );
  const taken = new Set<string>();
  for (const s of stations) {
    if (editing && s.id === editing.id) continue;
    s.pointIds.forEach((p) => taken.add(p));
  }
  const clash = pointIds.find((p) => taken.has(p));
  if (clash) return fail(`Charging point ID ${clash} is already used by another station. Choose a different prefix.`);

  if (editing) {
    const removed = editing.pointIds.filter((p) => !pointIds.includes(p));
    const blocked = liveReservations.filter((r) => r.stationId === editing.id && removed.includes(r.pointId));
    if (blocked.length > 0) {
      return fail(
        `Cannot remove charging point(s) ${Array.from(new Set(blocked.map((r) => r.pointId))).join(
          ", "
        )} because they have active reservations. Cancel those reservations first.`
      );
    }
  }

  return { ok: true, value: { name, city, connector: draft.connector, powerKW: power, tariffPerKWh: tariff, pointIds } };
}

function validateEvDraft(draft: EvDraft, evs: Ev[]): Validation<Omit<Ev, "id">> {
  const fail = (error: string): Validation<Omit<Ev, "id">> => ({ ok: false, error });
  const number = draft.number.replace(/\s+/g, "").toUpperCase();
  const model = draft.model.trim();
  if (!number) return fail("Vehicle number is required.");
  if (!/^[A-Z0-9-]{6,12}$/.test(number)) {
    return fail("Vehicle number must be 6 to 12 letters or digits (for example KA01AB1234).");
  }
  if (evs.some((e) => e.number === number)) return fail(`A vehicle with number ${number} already exists.`);
  if (!model) return fail("Model is required.");
  if (draft.battery.trim() === "") return fail("Battery capacity is required.");
  const battery = Number(draft.battery);
  if (!Number.isFinite(battery) || battery <= 0 || battery > 250) {
    return fail("Battery capacity must be a number between 0 and 250 kWh.");
  }
  return { ok: true, value: { number, model, batteryKWh: battery, connector: draft.connector } };
}

/* -------------------------------------------------------------------------- */
/*  Small reusable components                                                 */
/* -------------------------------------------------------------------------- */

function Alert({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  const styles: Record<FeedbackKind, string> = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
  };
  const symbol: Record<FeedbackKind, string> = { success: "✔", error: "✖", info: "ℹ" };
  return (
    <div
      role={feedback.kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${styles[feedback.kind]}`}
    >
      <span aria-hidden="true" className="mt-0.5 font-bold">
        {symbol[feedback.kind]}
      </span>
      <p>{feedback.text}</p>
    </div>
  );
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f1b3d] sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span aria-hidden="true">🧪</span>
      <p>{children}</p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[#0f1b3d]">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: string;
}) {
  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-700"
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-[#0f1b3d]">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <span aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
        {icon}
      </span>
      <h3 className="text-base font-semibold text-[#0f1b3d]">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function ConnectorBadge({ connector }: { connector: ConnectorType }) {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      {connector}
    </span>
  );
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  const styles: Record<DisplayStatus, string> = {
    Confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "In progress": "bg-sky-50 text-sky-700 ring-sky-200",
    Completed: "bg-slate-100 text-slate-700 ring-slate-200",
    Cancelled: "bg-red-50 text-red-700 ring-red-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${styles[status]}`}>
      {status}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-[#0f1b3d]">{value}</dd>
    </div>
  );
}

function StationCard({
  station,
  available,
  onReserve,
}: {
  station: Station;
  available: number;
  onReserve: (stationId: number) => void;
}) {
  const total = station.pointIds.length;
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  return (
    <article className={`${cardCls} flex flex-col p-5 transition hover:border-emerald-300 hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">📍 {station.city}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#0f1b3d]">{station.name}</h3>
        </div>
        <ConnectorBadge connector={station.connector} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <DetailItem label="Power" value={`${station.powerKW} kW`} />
        <DetailItem label="Tariff" value={`₹${station.tariffPerKWh}/kWh`} />
      </dl>
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Charging points available</span>
          <span className="font-semibold text-[#0f1b3d]">
            {available} of {total}
          </span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`${available} of ${total} charging points available`}
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 truncate text-xs text-slate-500">{station.pointIds.join(" · ")}</p>
      </div>
      <button type="button" onClick={() => onReserve(station.id)} className={`${btnPrimary} mt-5 w-full`}>
        Reserve
      </button>
    </article>
  );
}

function ReservationCard({
  reservation,
  nowMs,
  onCancel,
}: {
  reservation: Reservation;
  nowMs: number;
  onCancel: (ref: string) => void;
}) {
  const status = displayStatus(reservation, nowMs);
  const canCancel = isLive(reservation, nowMs);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-[#0f1b3d]">
            {reservation.ref}
          </span>
          <StatusBadge status={status} />
        </div>
        {canCancel ? (
          <button type="button" onClick={() => onCancel(reservation.ref)} className={`${btnDanger} px-3 py-1.5`}>
            Cancel reservation
          </button>
        ) : status === "Cancelled" ? (
          <span className="text-xs text-slate-500">Cancelled · charging point released</span>
        ) : null}
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem label="Station" value={reservation.stationName} />
        <DetailItem label="Charging point" value={reservation.pointId} />
        <DetailItem label="Vehicle" value={reservation.vehicle} />
        <DetailItem label="Start" value={formatDateTime(reservation.startMs)} />
        <DetailItem label="End" value={formatDateTime(reservation.endMs)} />
        <DetailItem label="Est. energy" value={`${formatNumber2(reservation.energyKWh)} kWh`} />
        <DetailItem label="Est. cost" value={formatINR(reservation.cost)} />
      </dl>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Views                                                                     */
/* -------------------------------------------------------------------------- */

function DashboardView({
  stations,
  availableByStation,
  totalAvailable,
  reservations,
  liveCount,
  nowMs,
  onReserve,
  onNavigate,
}: {
  stations: Station[];
  availableByStation: Map<number, number>;
  totalAvailable: number;
  reservations: Reservation[];
  liveCount: number;
  nowMs: number;
  onReserve: (stationId: number) => void;
  onNavigate: (view: View) => void;
}) {
  const featured = stations.slice(0, 3);
  const recent = reservations.slice(0, 3);
  const totalPoints = stations.reduce((sum, s) => sum + s.pointIds.length, 0);
  const cancelled = reservations.filter((r) => r.status === "Cancelled").length;

  return (
    <div>
      <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 text-white shadow-sm sm:p-8">
        <p className="text-sm font-medium text-emerald-100">Welcome back 👋</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome to VoltReserve</h1>
        <p className="mt-2 max-w-xl text-sm text-emerald-50">
          Find a charging station, pick a charging point, and reserve a slot for your EV. Everything on this screen is
          sample data for demonstration.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate("reservations")}
            className={`${btnBase} bg-white text-emerald-800 hover:bg-emerald-50`}
          >
            Make a reservation
          </button>
          <button
            type="button"
            onClick={() => onNavigate("stations")}
            className={`${btnBase} border border-white/40 text-white hover:bg-white/10`}
          >
            Browse stations
          </button>
        </div>
      </section>

      <DemoNotice>
        <strong>Demo data:</strong> stations, vehicles and reservations shown here are sample values stored in browser
        memory only. They are not loaded from MySQL or MongoDB, and refreshing the page may reset them.
      </DemoNotice>

      <section aria-label="Statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Charging stations" value={String(stations.length)} hint="Across all cities" icon="🏢" />
        <StatCard
          label="Available charging points"
          value={String(totalAvailable)}
          hint={`${totalAvailable} of ${totalPoints} not held by an active booking`}
          icon="🔌"
        />
        <StatCard
          label="Reservations this session"
          value={String(reservations.length)}
          hint={`${cancelled} cancelled`}
          icon="🗓"
        />
        <StatCard label="Active bookings" value={String(liveCount)} hint="Upcoming or in progress" icon="✅" />
      </section>

      <section className="mt-8" aria-labelledby="featured-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="featured-heading" className="text-lg font-semibold text-[#0f1b3d]">
            Featured charging stations
          </h2>
          <button type="button" onClick={() => onNavigate("stations")} className={btnSecondary}>
            View all stations
          </button>
        </div>
        {featured.length === 0 ? (
          <EmptyState
            icon="⚡"
            title="No stations yet"
            message="Add a station from the Admin page to see it featured here."
            action={
              <button type="button" onClick={() => onNavigate("admin")} className={btnPrimary}>
                Go to Admin
              </button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featured.map((s) => (
              <StationCard key={s.id} station={s} available={availableByStation.get(s.id) ?? 0} onReserve={onReserve} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="recent-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="recent-heading" className="text-lg font-semibold text-[#0f1b3d]">
            Recent reservations
          </h2>
          {reservations.length > 0 ? (
            <button type="button" onClick={() => onNavigate("reservations")} className={btnSecondary}>
              See history
            </button>
          ) : null}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon="🗓"
            title="No reservations yet"
            message="Reservations you create in this browser session will appear here."
            action={
              <button type="button" onClick={() => onNavigate("reservations")} className={btnPrimary}>
                Create a reservation
              </button>
            }
          />
        ) : (
          <ul className={`${cardCls} divide-y divide-slate-100`}>
            {recent.map((r) => (
              <li key={r.ref} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-[#0f1b3d]">
                    {r.stationName} · {r.pointId}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.ref} · {formatDateTime(r.startMs)} → {formatDateTime(r.endMs)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[#0f1b3d]">{formatINR(r.cost)}</span>
                  <StatusBadge status={displayStatus(r, nowMs)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StationsView({
  stations,
  availableByStation,
  onReserve,
}: {
  stations: Station[];
  availableByStation: Map<number, number>;
  onReserve: (stationId: number) => void;
}) {
  const [query, setQuery] = useState<string>("");
  const [city, setCity] = useState<string>("All");
  const [connector, setConnector] = useState<"All" | ConnectorType>("All");

  const cityOptions = useMemo(() => Array.from(new Set(stations.map((s) => s.city))).sort(), [stations]);
  const effectiveCity = city === "All" || cityOptions.includes(city) ? city : "All";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stations.filter(
      (s) =>
        (q === "" || s.name.toLowerCase().includes(q)) &&
        (effectiveCity === "All" || s.city === effectiveCity) &&
        (connector === "All" || s.connector === connector)
    );
  }, [stations, query, effectiveCity, connector]);

  const clearFilters = () => {
    setQuery("");
    setCity("All");
    setConnector("All");
  };

  return (
    <div>
      <PageHeader title="Charging stations" subtitle="Search and filter stations, then reserve a charging point." />
      <div className={`${cardCls} mb-5 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3`}>
        <Field id="station-search" label="Search by station name">
          <input
            id="station-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Indiranagar"
            className={inputCls}
          />
        </Field>
        <Field id="station-city" label="City">
          <select id="station-city" value={effectiveCity} onChange={(e) => setCity(e.target.value)} className={inputCls}>
            <option value="All">All cities</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field id="station-connector" label="Connector type">
          <select
            id="station-connector"
            value={connector}
            onChange={(e) => setConnector(toConnector(e.target.value) ?? "All")}
            className={inputCls}
          >
            <option value="All">All connectors</option>
            {CONNECTORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="mb-4 text-sm text-slate-600" aria-live="polite">
        Showing <strong className="text-[#0f1b3d]">{filtered.length}</strong> of{" "}
        <strong className="text-[#0f1b3d]">{stations.length}</strong> stations
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🔎"
          title="No stations match your filters"
          message="Try a different name, city or connector type, or clear the filters to see every station."
          action={
            <button type="button" onClick={clearFilters} className={btnPrimary}>
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <StationCard key={s.id} station={s} available={availableByStation.get(s.id) ?? 0} onReserve={onReserve} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReservationsView({
  stations,
  evs,
  reservations,
  form,
  station,
  pointId,
  ev,
  nowMs,
  formFeedback,
  historyFeedback,
  onStationChange,
  onPointChange,
  onFieldChange,
  onQuickFill,
  onSubmit,
  onCancel,
  onNavigate,
}: {
  stations: Station[];
  evs: Ev[];
  reservations: Reservation[];
  form: ReservationForm;
  station: Station | undefined;
  pointId: ChargingPointId;
  ev: Ev | undefined;
  nowMs: number;
  formFeedback: Feedback | null;
  historyFeedback: Feedback | null;
  onStationChange: (stationId: number) => void;
  onPointChange: (pointId: ChargingPointId) => void;
  onFieldChange: (patch: Partial<ReservationForm>) => void;
  onQuickFill: () => void;
  onSubmit: () => void;
  onCancel: (ref: string) => void;
  onNavigate: (view: View) => void;
}) {
  const startMs = parseLocal(form.start);
  const endMs = parseLocal(form.end);
  const hasRange = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const estimate = computeEstimate(startMs, endMs, station);

  const startError =
    form.start && Number.isFinite(startMs) && nowMs > 0 && startMs <= nowMs
      ? "Start time must be in the future."
      : undefined;
  const endError =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs
      ? "End time must be later than the start time."
      : undefined;

  const busyPoints =
  station && hasRange
    ? new Set(
        station.pointIds.filter((pointId) =>
          findConflict(
            reservations,
            station.id,
            pointId,
            startMs,
            endMs
          )
        )
      )
    : new Set<string>();

  const warnings: string[] = [];
  if (ev && station && ev.connector !== station.connector) {
    warnings.push(
      `${ev.model} uses a ${ev.connector} connector but ${station.name} offers ${station.connector}. This is only a warning in the demo.`
    );
  }
  if (ev && estimate && estimate.energyKWh > ev.batteryKWh) {
    warnings.push(
      `The estimated energy exceeds ${ev.model}'s battery capacity (${ev.batteryKWh} kWh); a real session would stop when the battery is full.`
    );
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
  };

  const canShowForm = stations.length > 0 && evs.length > 0;

  return (
    <div>
      <PageHeader
        title="Reservations"
        subtitle="Reserve a charging point for your EV and review your reservation history."
      />
      <DemoNotice>
        Reservations are kept in React state only. Refreshing the page may reset the demo data, and nothing is saved to
        MySQL yet.
      </DemoNotice>

      {!canShowForm ? (
        <EmptyState
          icon="📝"
          title={stations.length === 0 ? "No stations available" : "No vehicles available"}
          message={
            stations.length === 0
              ? "Add at least one charging station in the Admin page before making a reservation."
              : "Add at least one EV in the My EVs page before making a reservation."
          }
          action={
            <button
              type="button"
              onClick={() => onNavigate(stations.length === 0 ? "admin" : "evs")}
              className={btnPrimary}
            >
              {stations.length === 0 ? "Go to Admin" : "Go to My EVs"}
            </button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <form onSubmit={handleSubmit} noValidate className={`${cardCls} space-y-5 p-5 sm:p-6 lg:col-span-2`}>
            <h2 className="text-lg font-semibold text-[#0f1b3d]">New reservation</h2>
            <Alert feedback={formFeedback} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="res-station" label="Charging station">
                <select
                  id="res-station"
                  aria-required="true"
                  value={station ? station.id : ""}
                  onChange={(e) => onStationChange(Number(e.target.value))}
                  className={inputCls}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.city}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="res-point"
                label="Charging point"
                hint={station ? `${station.pointIds.length} points at this station` : undefined}
              >
                <select
                  id="res-point"
                  aria-required="true"
                  value={pointId}
                  onChange={(e) => onPointChange(e.target.value)}
                  className={inputCls}
                >
                  {(station ? getPoints(station) : []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id}
                      {busyPoints.has(p.id) ? " — busy in this time window" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field id="res-ev" label="Electric vehicle">
              <select
                id="res-ev"
                aria-required="true"
                value={ev ? ev.id : ""}
                onChange={(e) => onFieldChange({ evId: e.target.value })}
                className={inputCls}
              >
                {evs.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.model} · {v.number}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="res-start" label="Start date and time" error={startError}>
                <input
                  id="res-start"
                  type="datetime-local"
                  aria-required="true"
                  value={form.start}
                  min={nowMs > 0 ? toLocalInput(nowMs) : undefined}
                  onChange={(e) => onFieldChange({ start: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field id="res-end" label="End date and time" error={endError}>
                <input
                  id="res-end"
                  type="datetime-local"
                  aria-required="true"
                  value={form.end}
                  min={form.start || (nowMs > 0 ? toLocalInput(nowMs) : undefined)}
                  onChange={(e) => onFieldChange({ end: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={onQuickFill} className={btnSecondary}>
                ⏱ Quick fill: next hour, 1 h session
              </button>
              <span className="text-xs text-slate-500">Adjacent bookings are allowed (end = next start).</span>
            </div>

            {warnings.length > 0 ? (
              <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
              <button type="submit" className={btnPrimary}>
                Reserve charging point
              </button>
            </div>
          </form>

          <aside className={`${cardCls} h-fit space-y-4 p-5 sm:p-6`} aria-label="Estimate summary">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0f1b3d]">Estimate</h2>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Estimate only
              </span>
            </div>
            {station ? (
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                <DetailItem label="Charger power" value={`${station.powerKW} kW`} />
                <DetailItem label="Tariff" value={`₹${station.tariffPerKWh}/kWh`} />
              </dl>
            ) : null}
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between">
                <dt className="text-sm text-slate-600">Duration</dt>
                <dd className="text-sm font-semibold text-[#0f1b3d]">
                  {estimate ? `${formatNumber2(estimate.hours)} h` : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-sm text-slate-600">Estimated energy</dt>
                <dd className="text-lg font-bold text-[#0f1b3d]">
                  {estimate ? `${formatNumber2(estimate.energyKWh)} kWh` : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-sm text-slate-600">Estimated cost</dt>
                <dd className="text-lg font-bold text-emerald-700">{estimate ? formatINR(estimate.cost) : "—"}</dd>
              </div>
            </dl>
            {estimate && station ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                {formatNumber2(estimate.hours)} h × {station.powerKW} kW = {formatNumber2(estimate.energyKWh)} kWh;{" "}
                {formatNumber2(estimate.energyKWh)} kWh × ₹{station.tariffPerKWh} = {formatINR(estimate.cost)}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Choose a valid start and end time to see the estimated energy and cost.
              </p>
            )}
            <p className="text-xs leading-relaxed text-slate-500">
              This estimate assumes constant charging at the charger&apos;s rated power. It does not model battery
              tapering, charging efficiency, or vehicle-specific power limits.
            </p>
          </aside>
        </div>
      )}

      <section className="mt-8" aria-labelledby="history-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="history-heading" className="text-lg font-semibold text-[#0f1b3d]">
            Reservation history (this session)
          </h2>
          <span className="text-sm text-slate-600">
            {reservations.length} reservation{reservations.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mb-4">
          <Alert feedback={historyFeedback} />
        </div>
        {reservations.length === 0 ? (
          <EmptyState
            icon="🗓"
            title="No reservations yet"
            message="Once you reserve a charging point, it will show up here with its status, estimated energy and cost."
          />
        ) : (
          <ul className="space-y-3">
            {reservations.map((r) => (
              <ReservationCard key={r.ref} reservation={r} nowMs={nowMs} onCancel={onCancel} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EvsView({
  evs,
  liveReservations,
  onAdd,
  onDelete,
}: {
  evs: Ev[];
  liveReservations: Reservation[];
  onAdd: (draft: EvDraft) => ActionResult;
  onDelete: (id: string) => ActionResult;
}) {
  const emptyDraft: EvDraft = { number: "", model: "", battery: "", connector: "CCS2" };
  const [draft, setDraft] = useState<EvDraft>(emptyDraft);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = onAdd(draft);
    setFeedback({ kind: result.ok ? "success" : "error", text: result.message });
    if (result.ok) setDraft({ number: "", model: "", battery: "", connector: draft.connector });
  };

  const handleDelete = (id: string) => {
    const result = onDelete(id);
    setFeedback({ kind: result.ok ? "success" : "error", text: result.message });
  };

  return (
    <div>
      <PageHeader title="My EVs" subtitle="Manage the vehicles you use for charging reservations." />
      <DemoNotice>
        Frontend prototype awaiting database integration. Added or deleted vehicles exist only in browser memory.
      </DemoNotice>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="ev-list-heading">
          <h2 id="ev-list-heading" className="mb-4 text-lg font-semibold text-[#0f1b3d]">
            Your vehicles ({evs.length})
          </h2>
          {evs.length === 0 ? (
            <EmptyState
              icon="🚗"
              title="No vehicles yet"
              message="Add your first EV using the form so you can book charging slots."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {evs.map((v) => {
                const inUse = liveReservations.filter((r) => r.evId === v.id).length;
                return (
                  <li key={v.id} className={`${cardCls} p-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-[#0f1b3d]">{v.model}</h3>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{v.number}</p>
                      </div>
                      <span aria-hidden="true" className="text-2xl">
                        🚗
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      <DetailItem label="Battery" value={`${v.batteryKWh} kWh`} />
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Connector</dt>
                        <dd className="mt-1">
                          <ConnectorBadge connector={v.connector} />
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        {inUse > 0 ? `${inUse} active booking${inUse === 1 ? "" : "s"}` : "No active bookings"}
                      </span>
                      <button type="button" onClick={() => handleDelete(v.id)} className={`${btnDanger} px-3 py-1.5`}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form onSubmit={handleSubmit} noValidate className={`${cardCls} h-fit space-y-4 p-5 sm:p-6`}>
          <h2 className="text-lg font-semibold text-[#0f1b3d]">Add EV</h2>
          <Alert feedback={feedback} />
          <Field id="ev-number" label="Vehicle number" hint="For example KA01AB1234">
            <input
              id="ev-number"
              type="text"
              aria-required="true"
              value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })}
              className={inputCls}
              autoComplete="off"
            />
          </Field>
          <Field id="ev-model" label="Model">
            <input
              id="ev-model"
              type="text"
              aria-required="true"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              className={inputCls}
              autoComplete="off"
            />
          </Field>
          <Field id="ev-battery" label="Battery capacity (kWh)">
            <input
              id="ev-battery"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              aria-required="true"
              value={draft.battery}
              onChange={(e) => setDraft({ ...draft, battery: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field id="ev-connector" label="Connector type">
            <select
              id="ev-connector"
              value={draft.connector}
              onChange={(e) => setDraft({ ...draft, connector: toConnector(e.target.value) ?? "CCS2" })}
              className={inputCls}
            >
              {CONNECTORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={`${btnPrimary} w-full`}>
            Add EV
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminView({
  stations,
  liveReservations,
  onSave,
  onDelete,
}: {
  stations: Station[];
  liveReservations: Reservation[];
  onSave: (draft: StationDraft, editingId: number | null) => ActionResult;
  onDelete: (id: number) => ActionResult;
}) {
  const emptyDraft: StationDraft = {
    name: "",
    city: "",
    connector: "CCS2",
    power: "",
    tariff: "",
    pointCount: "2",
    prefix: "",
  };
  const [draft, setDraft] = useState<StationDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const editingStation = editingId === null ? undefined : stations.find((s) => s.id === editingId);

  const resetForm = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const startEdit = (s: Station) => {
    setEditingId(s.id);
    setConfirmId(null);
    setFeedback(null);
    setDraft({
      name: s.name,
      city: s.city,
      connector: s.connector,
      power: String(s.powerKW),
      tariff: String(s.tariffPerKWh),
      pointCount: String(s.pointIds.length),
      prefix: derivePrefix(s),
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = onSave(draft, editingId);
    setFeedback({ kind: result.ok ? "success" : "error", text: result.message });
    if (result.ok) resetForm();
  };

  const handleDelete = (id: number) => {
    const result = onDelete(id);
    setFeedback({ kind: result.ok ? "success" : "error", text: result.message });
    setConfirmId(null);
    if (result.ok && editingId === id) resetForm();
  };

  return (
    <div>
      <PageHeader title="Admin · Station management" subtitle="Add, edit and remove charging stations." />
      <DemoNotice>
        Prototype admin screen: changes update local demo state only and are <strong>not saved to MySQL</strong>. No
        authentication is implemented here; real admin permissions will be enforced by the backend later.
      </DemoNotice>

      <div className="mb-6">
        <Alert feedback={feedback} />
      </div>

      <section className={`${cardCls} mb-8 overflow-hidden`} aria-labelledby="admin-table-heading">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="admin-table-heading" className="text-lg font-semibold text-[#0f1b3d]">
            Stations ({stations.length})
          </h2>
        </div>
        {stations.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="🏢" title="No stations" message="Use the form below to add the first charging station." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3">Station</th>
                  <th scope="col" className="px-5 py-3">City</th>
                  <th scope="col" className="px-5 py-3">Connector</th>
                  <th scope="col" className="px-5 py-3">Power</th>
                  <th scope="col" className="px-5 py-3">Tariff</th>
                  <th scope="col" className="px-5 py-3">Points</th>
                  <th scope="col" className="px-5 py-3">Active bookings</th>
                  <th scope="col" className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stations.map((s) => {
                  const liveCount = liveReservations.filter((r) => r.stationId === s.id).length;
                  return (
                    <tr key={s.id} className="align-middle">
                      <td className="px-5 py-3 font-medium text-[#0f1b3d]">{s.name}</td>
                      <td className="px-5 py-3 text-slate-700">{s.city}</td>
                      <td className="px-5 py-3">
                        <ConnectorBadge connector={s.connector} />
                      </td>
                      <td className="px-5 py-3 text-slate-700">{s.powerKW} kW</td>
                      <td className="px-5 py-3 text-slate-700">₹{s.tariffPerKWh}/kWh</td>
                      <td className="px-5 py-3 text-slate-700">{s.pointIds.length}</td>
                      <td className="px-5 py-3 text-slate-700">{liveCount}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {confirmId === s.id ? (
                            <>
                              <span className="text-xs font-medium text-red-700">Delete this station?</span>
                              <button type="button" onClick={() => handleDelete(s.id)} className={`${btnDanger} px-3 py-1.5`}>
                                Confirm delete
                              </button>
                              <button type="button" onClick={() => setConfirmId(null)} className={`${btnSecondary} px-3 py-1.5`}>
                                Keep
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => startEdit(s)} className={`${btnSecondary} px-3 py-1.5`}>
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmId(s.id);
                                  setFeedback(null);
                                }}
                                className={`${btnDanger} px-3 py-1.5`}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form ref={formRef} onSubmit={handleSubmit} noValidate className={`${cardCls} space-y-4 p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#0f1b3d]">
            {editingStation ? `Edit station: ${editingStation.name}` : "Add station"}
          </h2>
          {editingStation ? (
            <button type="button" onClick={resetForm} className={btnSecondary}>
              Cancel editing
            </button>
          ) : null}
        </div>
        {editingStation ? (
          <p className="text-xs text-slate-500">
            Existing reservations keep the power and tariff they were booked with. Removing a charging point that has an
            active reservation is blocked.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="adm-name" label="Station name">
            <input
              id="adm-name"
              type="text"
              aria-required="true"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputCls}
              autoComplete="off"
            />
          </Field>
          <Field id="adm-city" label="City">
            <input
              id="adm-city"
              type="text"
              aria-required="true"
              value={draft.city}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              className={inputCls}
              autoComplete="off"
            />
          </Field>
          <Field id="adm-connector" label="Connector type">
            <select
              id="adm-connector"
              value={draft.connector}
              onChange={(e) => setDraft({ ...draft, connector: toConnector(e.target.value) ?? "CCS2" })}
              className={inputCls}
            >
              {CONNECTORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field id="adm-power" label="Power rating (kW)" hint="Must be greater than 0">
            <input
              id="adm-power"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              aria-required="true"
              value={draft.power}
              onChange={(e) => setDraft({ ...draft, power: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field id="adm-tariff" label="Tariff (₹ per kWh)" hint="0 or higher">
            <input
              id="adm-tariff"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              aria-required="true"
              value={draft.tariff}
              onChange={(e) => setDraft({ ...draft, tariff: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field id="adm-count" label="Number of charging points" hint="Between 1 and 12">
            <input
              id="adm-count"
              type="number"
              inputMode="numeric"
              min="1"
              max="12"
              step="1"
              aria-required="true"
              value={draft.pointCount}
              onChange={(e) => setDraft({ ...draft, pointCount: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field
            id="adm-prefix"
            label="Charging-point ID prefix"
            hint={editingStation ? "Fixed after creation" : "2–5 letters/digits, e.g. KOR → KOR-01, KOR-02"}
          >
            <input
              id="adm-prefix"
              type="text"
              maxLength={5}
              aria-required="true"
              disabled={editingStation !== undefined}
              value={editingStation ? derivePrefix(editingStation) : draft.prefix}
              onChange={(e) => setDraft({ ...draft, prefix: e.target.value.toUpperCase() })}
              className={inputCls}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
          <button type="submit" className={btnPrimary}>
            {editingStation ? "Save changes" : "Add station"}
          </button>
          <button type="button" onClick={resetForm} className={btnSecondary}>
            Reset form
          </button>
        </div>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function Page() {
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(0);

  const [stations, setStations] = useState<Station[]>(INITIAL_STATIONS);
  const [evs, setEvs] = useState<Ev[]>(INITIAL_EVS);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [form, setForm] = useState<ReservationForm>({
    stationId: INITIAL_STATIONS[0].id,
    pointId: INITIAL_STATIONS[0].pointIds[0],
    evId: INITIAL_EVS[0].id,
    start: "",
    end: "",
  });
  const [formFeedback, setFormFeedback] = useState<Feedback | null>(null);
  const [historyFeedback, setHistoryFeedback] = useState<Feedback | null>(null);

  const nextStationId = useRef<number>(5);
  const nextEvId = useRef<number>(4);

  /* Clock: keeps "available now" and statuses fresh. Runs only on the client. */
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, []);

  /* Close the mobile menu with Escape. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  /* Derived data */
  const liveReservations = useMemo(
    () => reservations.filter((r) => isLive(r, nowMs)),
    [reservations, nowMs]
  );

  const availableByStation = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of stations) {
      const held = new Set(liveReservations.filter((r) => r.stationId === s.id).map((r) => r.pointId));
      map.set(s.id, s.pointIds.filter((p) => !held.has(p)).length);
    }
    return map;
  }, [stations, liveReservations]);

  const totalAvailable = useMemo(
    () => Array.from(availableByStation.values()).reduce((sum, n) => sum + n, 0),
    [availableByStation]
  );

  /* The form's effective selections always stay consistent with current data. */
  const formStation: Station | undefined = stations.find((s) => s.id === form.stationId) ?? stations[0];
  const formPointId: ChargingPointId = formStation
    ? formStation.pointIds.includes(form.pointId)
      ? form.pointId
      : formStation.pointIds[0] ?? ""
    : "";
  const formEv: Ev | undefined = evs.find((e) => e.id === form.evId) ?? evs[0];

  /* Navigation */
  const go = (next: View) => {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  };

  /* Reservation handlers */
  const updateForm = (patch: Partial<ReservationForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setFormFeedback(null);
  };

  const handleStationChange = (stationId: number) => {
    const target = stations.find((s) => s.id === stationId);
    updateForm({ stationId, pointId: target ? target.pointIds[0] ?? "" : "" });
  };

  const handlePointChange = (pointId: ChargingPointId) => {
    updateForm({ stationId: formStation ? formStation.id : form.stationId, pointId });
  };

  const handleQuickFill = () => {
    const start = Math.ceil((Date.now() + 60000) / 3600000) * 3600000;
    updateForm({ start: toLocalInput(start), end: toLocalInput(start + 3600000) });
  };

  const openReserve = (stationId: number) => {
    const target = stations.find((s) => s.id === stationId);
    if (!target) return;
    setForm((prev) => ({ ...prev, stationId: target.id, pointId: target.pointIds[0] ?? "" }));
    setFormFeedback(null);
    go("reservations");
  };

  const submitReservation = () => {
    const result = validateReservation({
      station: formStation,
      pointId: formPointId,
      ev: formEv,
      start: form.start,
      end: form.end,
      reservations,
      nowMs: Date.now(),
    });
    if (!result.ok) {
      setFormFeedback({ kind: "error", text: result.error });
      return;
    }
    const { station, ev, startMs, endMs, estimate } = result.value;
    const ref = `VR-${String(reservations.length + 1).padStart(4, "0")}`;
    const created: Reservation = {
      ref,
      stationId: station.id,
      stationName: station.name,
      pointId: formPointId,
      evId: ev.id,
      vehicle: `${ev.model} (${ev.number})`,
      startMs,
      endMs,
      energyKWh: estimate.energyKWh,
      cost: estimate.cost,
      status: "Confirmed",
    };
    setReservations((prev) => [created, ...prev]);
    setNowMs(Date.now());
    setHistoryFeedback(null);
    setFormFeedback({
      kind: "success",
      text: `Reservation ${ref} confirmed (demo): ${formPointId} at ${station.name}, ${formatDateTime(
        startMs
      )} to ${formatDateTime(endMs)}. Estimated ${formatNumber2(estimate.energyKWh)} kWh, ${formatINR(
        estimate.cost
      )}.`,
    });
    setForm((prev) => ({
      ...prev,
      stationId: station.id,
      pointId: formPointId,
      evId: ev.id,
      start: "",
      end: "",
    }));
  };

  const cancelReservation = (ref: string) => {
    const target = reservations.find((r) => r.ref === ref);
    if (!target) {
      setHistoryFeedback({ kind: "error", text: `Reservation ${ref} was not found.` });
      return;
    }
    if (target.status === "Cancelled") {
      setHistoryFeedback({ kind: "error", text: `Reservation ${ref} is already cancelled.` });
      return;
    }
    setReservations((prev) =>
      prev.map((r) => (r.ref === ref && r.status === "Confirmed" ? { ...r, status: "Cancelled" } : r))
    );
    setHistoryFeedback({
      kind: "success",
      text: `Reservation ${ref} cancelled. ${target.pointId} at ${target.stationName} is free again for that time.`,
    });
  };

  /* EV handlers */
  const addEv = (draft: EvDraft): ActionResult => {
    const check = validateEvDraft(draft, evs);
    if (!check.ok) return { ok: false, message: check.error };
    const id = `ev-${nextEvId.current}`;
    nextEvId.current += 1;
    setEvs((prev) => [...prev, { id, ...check.value }]);
    return { ok: true, message: `${check.value.model} (${check.value.number}) added to the demo list.` };
  };

  const deleteEv = (id: string): ActionResult => {
    const target = evs.find((e) => e.id === id);
    if (!target) return { ok: false, message: "That vehicle no longer exists." };
    const active = liveReservations.filter((r) => r.evId === id).length;
    if (active > 0) {
      return {
        ok: false,
        message: `${target.model} cannot be deleted because it has ${active} active reservation${
          active === 1 ? "" : "s"
        }. Cancel ${active === 1 ? "it" : "them"} first.`,
      };
    }
    setEvs((prev) => prev.filter((e) => e.id !== id));
    return { ok: true, message: `${target.model} (${target.number}) was removed from the demo list.` };
  };

  /* Admin handlers */
  const saveStation = (draft: StationDraft, editingId: number | null): ActionResult => {
    const editing = editingId === null ? null : stations.find((s) => s.id === editingId) ?? null;
    if (editingId !== null && !editing) {
      return { ok: false, message: "The station you were editing no longer exists." };
    }
    const check = validateStationDraft(draft, stations, editing, liveReservations);
    if (!check.ok) return { ok: false, message: check.error };
    if (editing) {
      setStations((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...check.value } : s)));
      return { ok: true, message: `Station "${check.value.name}" updated (demo state only, not saved to MySQL).` };
    }
    const id = nextStationId.current;
    nextStationId.current += 1;
    setStations((prev) => [...prev, { id, ...check.value }]);
    return { ok: true, message: `Station "${check.value.name}" added (demo state only, not saved to MySQL).` };
  };

  const deleteStation = (id: number): ActionResult => {
    const target = stations.find((s) => s.id === id);
    if (!target) return { ok: false, message: "That station no longer exists." };
    const active = liveReservations.filter((r) => r.stationId === id).length;
    if (active > 0) {
      return {
        ok: false,
        message: `"${target.name}" cannot be deleted because it has ${active} active reservation${
          active === 1 ? "" : "s"
        }. Cancel ${active === 1 ? "it" : "them"} first.`,
      };
    }
    setStations((prev) => prev.filter((s) => s.id !== id));
    return { ok: true, message: `Station "${target.name}" deleted (demo state only, not saved to MySQL).` };
  };

  const liveCount = liveReservations.length;

  return (
    <div className="min-h-screen bg-slate-100 text-[#0f1b3d]">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-lg text-white"
          >
            ⚡
          </span>
          <div className="leading-tight">
            <p className="text-base font-bold">VoltReserve</p>
            <p className="text-xs text-slate-500">Smart EV charging</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Demo</span>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Sidebar */}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:visible lg:translate-x-0 ${
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-6">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-xl text-white shadow-sm"
          >
            ⚡
          </span>
          <div className="leading-tight">
            <p className="text-lg font-bold tracking-tight">VoltReserve</p>
            <p className="text-xs text-slate-500">Smart EV charging</p>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = view === item.view;
              return (
                <li key={item.view}>
                  <button
                    type="button"
                    onClick={() => go(item.view)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      active
                        ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
                        : "text-slate-600 hover:bg-slate-50 hover:text-[#0f1b3d]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${
                        active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.view === "reservations" && liveCount > 0 ? (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                        {liveCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <p className="text-sm font-semibold text-amber-900">Demo mode</p>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            Sample data only. Not connected to MySQL or MongoDB yet.
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {view === "dashboard" ? (
            <DashboardView
              stations={stations}
              availableByStation={availableByStation}
              totalAvailable={totalAvailable}
              reservations={reservations}
              liveCount={liveCount}
              nowMs={nowMs}
              onReserve={openReserve}
              onNavigate={go}
            />
          ) : null}
          {view === "stations" ? (
            <StationsView stations={stations} availableByStation={availableByStation} onReserve={openReserve} />
          ) : null}
          {view === "evs" ? (
            <EvsView evs={evs} liveReservations={liveReservations} onAdd={addEv} onDelete={deleteEv} />
          ) : null}
          {view === "reservations" ? (
            <ReservationsView
              stations={stations}
              evs={evs}
              reservations={reservations}
              form={form}
              station={formStation}
              pointId={formPointId}
              ev={formEv}
              nowMs={nowMs}
              formFeedback={formFeedback}
              historyFeedback={historyFeedback}
              onStationChange={handleStationChange}
              onPointChange={handlePointChange}
              onFieldChange={updateForm}
              onQuickFill={handleQuickFill}
              onSubmit={submitReservation}
              onCancel={cancelReservation}
              onNavigate={go}
            />
          ) : null}
          {view === "admin" ? (
            <AdminView
              stations={stations}
              liveReservations={liveReservations}
              onSave={saveStation}
              onDelete={deleteStation}
            />
          ) : null}

          <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            VoltReserve · Smart EV Charging Station Reservation System · Frontend prototype with demo data
          </footer>
        </div>
      </main>
    </div>
  );
}