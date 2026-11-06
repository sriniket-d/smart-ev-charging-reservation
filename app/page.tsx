"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type View = "dashboard" | "stations" | "evs" | "reservations" | "activity" | "admin";
type ConnectorType = "CCS2" | "Type 2";
type ChargingPointId = string;
type ReservationStatus = "Booked" | "Confirmed" | "Cancelled" | "Completed" | "No-show";
type DisplayStatus = "Booked" | "Confirmed" | "In progress" | "Completed" | "Cancelled" | "No-show";
type FeedbackKind = "success" | "error" | "info";

interface Feedback {
  kind: FeedbackKind;
  text: string;
}

interface ActionResult {
  ok: boolean;
  message: string;
}

interface ActivityLogEntry {
  id: string;
  action: string;
  userId: number;
  entityType: string;
  entityId: number;
  timestamp: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

interface AuthUser {
  userId: number;
  name: string;
  email: string;
  role: "customer" | "admin";
}

type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

interface Station {
  id: number;
  name: string;
  location: string;
  city: string;
  connector: ConnectorType;
  powerKW: number;
  tariffPerKWh: number;
  pointIds: ChargingPointId[];
  activeReservations: number;
}

interface ApiChargingPoint {
  id: ChargingPointId;
  connector: string;
  powerKW: number;
  tariffPerKWh: number;
}

interface ApiStation {
  id: number;
  name: string;
  location: string;
  city: string;
  chargingPoints: ApiChargingPoint[];
}

interface DashboardStation {
  id: number;
  name: string;
  location: string;
  city: string;
  totalPoints: number;
  availablePoints: number;
  connectorTypes: string[];
  minPowerKW: number | null;
  maxPowerKW: number | null;
  minTariffPerKWh: number | null;
  maxTariffPerKWh: number | null;
}

interface Ev {
  id: string;
  number: string;
  model: string;
  batteryKWh: number;
  connector: ConnectorType;
}

interface ReservationForm {
  stationId: number | null;
  pointId: number | null;
  evId: number | null;
  tariffId: number | null;
  start: string;
  end: string;
}

interface BookingVehicle {
  id: number;
  userId: number;
  number: string;
  model: string;
}

interface BookingTariff {
  id: number;
  ratePerKWh: number;
}

interface BookingPoint {
  id: number;
  connector: string;
  powerKW: number;
  status: string;
  tariffs: BookingTariff[];
}

interface BookingStation {
  id: number;
  name: string;
  location: string;
  city: string;
  points: BookingPoint[];
}

interface ApiReservation {
  id: number;
  userId: number | null;
  stationName: string;
  location: string;
  city: string;
  pointId: string;
  vehicle: string;
  startMs: number;
  endMs: number;
  powerKW: number;
  status: ReservationStatus;
}

interface StationDraft {
  name: string;
  location: string;
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

const NAV_ITEMS: { view: View; label: string; icon: string }[] = [
  { view: "dashboard", label: "Dashboard", icon: "▦" },
  { view: "stations", label: "Stations", icon: "⚡" },
  { view: "evs", label: "My EVs", icon: "🚗" },
  { view: "reservations", label: "Reservations", icon: "🗓" },
  { view: "activity", label: "Activity", icon: "◷" },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseId(value: unknown): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new Error("The API returned an invalid database ID.");
  }
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id)) throw new Error("The API returned an invalid database ID.");
  return id;
}

function parseText(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`The API returned an invalid ${field}.`);
  return value;
}

function parseReservationStatus(value: unknown): ReservationStatus {
  const status = parseText(value, "reservation status");
  if (
    status === "Booked" ||
    status === "Confirmed" ||
    status === "Cancelled" ||
    status === "Completed" ||
    status === "No-show"
  ) {
    return status;
  }
  throw new Error("The reservations API returned an unsupported reservation status.");
}

function parseNumber(value: unknown, field: string): number {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new Error(`The API returned an invalid ${field}.`);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error(`The API returned an invalid ${field}.`);
  return number;
}

function parseStationsResponse(value: unknown): Omit<ApiStation, "chargingPoints">[] {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.data)) {
    throw new Error("The stations API returned an invalid response.");
  }

  return value.data.map((row: unknown) => {
    if (!isRecord(row)) throw new Error("The stations API returned an invalid station.");
    return {
      id: parseId(row.station_id),
      name: parseText(row.station_name, "station name"),
      location: parseText(row.location, "station location"),
      city: parseText(row.city, "station city"),
    };
  });
}

function parseDashboardStationsResponse(value: unknown): DashboardStation[] {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.data)) {
    throw new Error("The stations API returned an invalid response.");
  }

  return value.data.map((row: unknown): DashboardStation => {
    if (!isRecord(row)) throw new Error("The stations API returned an invalid station.");

    const connectorTypes = row.connector_types;
    if (connectorTypes !== null && typeof connectorTypes !== "string") {
      throw new Error("The stations API returned invalid connector types.");
    }

    const nullableNumber = (field: unknown, name: string) =>
      field === null || field === undefined ? null : parseNumber(field, name);

    return {
      id: parseId(row.station_id),
      name: parseText(row.station_name, "station name"),
      location: parseText(row.location, "station location"),
      city: parseText(row.city, "station city"),
      totalPoints: parseNumber(row.total_points, "total charging points"),
      availablePoints: parseNumber(row.available_points, "available charging points"),
      connectorTypes:
        typeof connectorTypes === "string"
          ? connectorTypes.split(",").map((type) => type.trim()).filter(Boolean)
          : [],
      minPowerKW: nullableNumber(row.min_power_kw, "minimum power rating"),
      maxPowerKW: nullableNumber(row.max_power_kw, "maximum power rating"),
      minTariffPerKWh: nullableNumber(row.min_rate_per_kwh, "minimum tariff"),
      maxTariffPerKWh: nullableNumber(row.max_rate_per_kwh, "maximum tariff"),
    };
  });
}

function parseChargingPointsResponse(value: unknown): Array<{
  stationId: number;
  point: ApiChargingPoint;
}> {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.chargingPoints)) {
    throw new Error("The booking options API returned an invalid response.");
  }

  return value.chargingPoints.map((row: unknown) => {
    if (!isRecord(row)) throw new Error("The booking options API returned an invalid charging point.");
    return {
      stationId: parseId(row.station_id),
      point: {
        id: String(parseId(row.point_id)),
        connector: parseText(row.connector_type, "connector type"),
        powerKW: parseNumber(row.power_kw, "power rating"),
        tariffPerKWh: parseNumber(row.rate_per_kwh, "tariff"),
      },
    };
  });
}

function parseBookingOptions(value: unknown): {
  vehicles: BookingVehicle[];
  stations: BookingStation[];
} {
  if (
    !isRecord(value) ||
    value.success !== true ||
    !Array.isArray(value.vehicles) ||
    !Array.isArray(value.chargingPoints)
  ) {
    throw new Error("The booking options API returned an invalid response.");
  }

  const vehicles = value.vehicles.map((row: unknown): BookingVehicle => {
    if (!isRecord(row)) throw new Error("The booking options API returned an invalid vehicle.");
    return {
      id: parseId(row.ev_id),
      userId: parseId(row.user_id),
      number: parseText(row.vehicle_number, "vehicle number"),
      model: parseText(row.model, "vehicle model"),
    };
  });

  const stationsById = new Map<number, BookingStation>();
  const pointsById = new Map<number, { stationId: number; point: BookingPoint }>();
  for (const row of value.chargingPoints as unknown[]) {
    if (!isRecord(row)) throw new Error("The booking options API returned an invalid charging point.");
    const stationId = parseId(row.station_id);
    const pointId = parseId(row.point_id);
    const status = parseText(row.status, "charging-point status");
    let station = stationsById.get(stationId);
    if (!station) {
      station = {
        id: stationId,
        name: parseText(row.station_name, "station name"),
        location: parseText(row.location, "station location"),
        city: parseText(row.city, "station city"),
        points: [],
      };
      stationsById.set(stationId, station);
    }

    let entry = pointsById.get(pointId);
    if (!entry) {
      entry = {
        stationId,
        point: {
          id: pointId,
          connector: parseText(row.connector_type, "connector type"),
          powerKW: parseNumber(row.power_kw, "power rating"),
          status,
          tariffs: [],
        },
      };
      pointsById.set(pointId, entry);
      if (status === "Available") station.points.push(entry.point);
    } else if (entry.stationId !== stationId) {
      throw new Error(`Charging point ${pointId} references multiple stations.`);
    }

    const tariff = {
      id: parseId(row.tariff_id),
      ratePerKWh: parseNumber(row.rate_per_kwh, "tariff"),
    };
    if (!entry.point.tariffs.some((existing) => existing.id === tariff.id)) {
      entry.point.tariffs.push(tariff);
    }
  }

  return { vehicles, stations: Array.from(stationsById.values()) };
}

function parseEvsResponse(value: unknown): Ev[] {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.vehicles)) {
    throw new Error("The vehicles API returned an invalid response.");
  }

  return value.vehicles.map((row: unknown): Ev => {
    if (!isRecord(row)) throw new Error("The vehicles API returned an invalid vehicle.");
    const connector = toConnector(parseText(row.connector_type, "connector type"));
    if (!connector) throw new Error("The vehicles API returned an unsupported connector type.");
    return {
      id: String(parseId(row.ev_id)),
      number: parseText(row.vehicle_number, "vehicle number"),
      model: parseText(row.model, "vehicle model"),
      batteryKWh: parseNumber(row.battery_capacity, "battery capacity"),
      connector,
    };
  });
}

function parseReservationHistory(value: unknown, vehicles: BookingVehicle[]): ApiReservation[] {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.data)) {
    throw new Error("The reservations API returned an invalid response.");
  }

  return value.data.map((row: unknown): ApiReservation => {
    if (!isRecord(row)) throw new Error("The reservations API returned an invalid reservation.");
    const startMs = Date.parse(parseText(row.start_time, "reservation start time"));
    const endMs = Date.parse(parseText(row.end_time, "reservation end time"));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new Error("The reservations API returned an invalid reservation time.");
    }
    const vehicleNumber = parseText(row.vehicle_number, "reservation vehicle number");
    return {
      id: parseId(row.reservation_id),
      userId: vehicles.find((vehicle) => vehicle.number === vehicleNumber)?.userId ?? null,
      stationName: parseText(row.station_name, "reservation station name"),
      location: parseText(row.location, "reservation station location"),
      city: parseText(row.city, "reservation station city"),
      pointId: String(parseId(row.point_id)),
      vehicle: `${parseText(row.ev_model, "reservation vehicle model")} (${vehicleNumber})`,
      startMs,
      endMs,
      powerKW: parseNumber(row.power_kw, "reservation charger power"),
      status: parseReservationStatus(row.status),
    };
  }).sort((left, right) => right.startMs - left.startMs);
}

async function readApiResponse(
  response: Response,
  conflictHint = "The point may no longer be available; refresh booking options and try again."
): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }

  const message =
    isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : `The request failed with status ${response.status}.`;
  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    if (response.status === 409 && conflictHint) {
      throw new Error(`${message} ${conflictHint}`);
    }
    throw new Error(message);
  }
  return payload;
}

function combineApiStations(
  stations: Omit<ApiStation, "chargingPoints">[],
  chargingPoints: Array<{ stationId: number; point: ApiChargingPoint }>
): ApiStation[] {
  const stationIds = new Set(stations.map((station) => station.id));
  const pointsByStation = new Map<number, ApiChargingPoint[]>();
  for (const { stationId, point } of chargingPoints) {
    if (!stationIds.has(stationId)) {
      throw new Error(`Charging point ${point.id} references an unknown station.`);
    }
    const points = pointsByStation.get(stationId) ?? [];
    points.push(point);
    pointsByStation.set(stationId, points);
  }

  return stations.map((station) => ({
    ...station,
    chargingPoints: pointsByStation.get(station.id) ?? [],
  }));
}

function derivePrefix(station: Station): string {
  const first = station.pointIds[0];
  return first ? first.split("-")[0] : "";
}

function displayApiStatus(reservation: ApiReservation, nowMs: number): DisplayStatus {
  if (reservation.status === "Cancelled") return "Cancelled";
  if (reservation.status === "Completed") return "Completed";
  if (reservation.status === "No-show") return "No-show";
  if (reservation.status === "Booked" && reservation.endMs > nowMs) return "Booked";
  if (reservation.endMs <= nowMs) return "Completed";
  if (reservation.startMs <= nowMs) return "In progress";
  return "Confirmed";
}

function isApiReservationCancellable(reservation: ApiReservation): boolean {
  return reservation.userId !== null && ["Booked", "Confirmed"].includes(reservation.status);
}

function validateStationDraft(
  draft: StationDraft,
  stations: Station[],
  editing: Station | null
): Validation<Omit<Station, "id">> {
  const fail = (error: string): Validation<Omit<Station, "id">> => ({ ok: false, error });
  const name = draft.name.trim();
  const location = draft.location.trim();
  const city = draft.city.trim();

  if (!name) return fail("Station name is required.");
  if (!location) return fail("Station location is required.");
  if (!city) return fail("City is required.");
  if (draft.power.trim() === "") return fail("Power rating is required.");

  const power = Number(draft.power);
  if (!Number.isFinite(power) || power <= 0 || power > 9999.99) {
    return fail("Power rating must be greater than 0 and no more than 9999.99 kW.");
  }
  if (!/^(?:\d+(?:\.\d{1,2})?)$/.test(draft.power.trim())) {
    return fail("Power rating must have at most two decimal places.");
  }
  if (draft.tariff.trim() === "") return fail("Tariff per kWh is required.");

  const tariff = Number(draft.tariff);
  if (!Number.isFinite(tariff) || tariff < 0 || tariff > 999999.99) {
    return fail("Tariff must be between 0 and 999999.99.");
  }
  if (!/^(?:\d+(?:\.\d{1,2})?)$/.test(draft.tariff.trim())) {
    return fail("Tariff must have at most two decimal places.");
  }

  const count = Number(draft.pointCount);
  if (draft.pointCount.trim() === "" || !Number.isInteger(count) || count < 1 || count > 12) {
    return fail("Number of charging points must be a whole number between 1 and 12.");
  }

  const prefix = (editing ? derivePrefix(editing) || draft.prefix : draft.prefix).trim().toUpperCase();
  if (!/^[A-Z0-9]{2,5}$/.test(prefix)) {
    return fail("Charging-point prefix must be 2 to 5 letters or digits (for example IND).");
  }

  const duplicate = stations.some(
    (station) =>
      station.id !== (editing ? editing.id : -1) &&
      station.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) return fail(`A station named "${name}" already exists.`);

  const pointIds: ChargingPointId[] = Array.from(
    { length: count },
    (_, index) => `${prefix}-${String(index + 1).padStart(2, "0")}`
  );
  const taken = new Set<string>();
  for (const station of stations) {
    if (editing && station.id === editing.id) continue;
    station.pointIds.forEach((pointId) => taken.add(pointId));
  }

  const clash = pointIds.find((pointId) => taken.has(pointId));
  if (clash) {
    return fail(`Charging point code ${clash} is already used by another station. Choose a different prefix.`);
  }

  return {
    ok: true,
    value: {
      name,
      location,
      city,
      connector: draft.connector,
      powerKW: power,
      tariffPerKWh: tariff,
      pointIds,
      activeReservations: editing?.activeReservations ?? 0,
    },
  };
}

function validateEvDraft(
  draft: EvDraft,
  evs: Ev[],
  editingId: string | null = null
): Validation<Omit<Ev, "id">> {
  const fail = (error: string): Validation<Omit<Ev, "id">> => ({ ok: false, error });
  const number = draft.number.replace(/\s+/g, "").toUpperCase();
  const model = draft.model.trim();
  if (!number) return fail("Vehicle number is required.");
  if (!/^[A-Z0-9-]{6,12}$/.test(number)) {
    return fail("Vehicle number must be 6 to 12 letters or digits (for example KA01AB1234).");
  }
  if (evs.some((e) => e.id !== editingId && e.number === number)) {
    return fail(`A vehicle with number ${number} already exists.`);
  }
  if (!model) return fail("Model is required.");
  if (model.length > 100) return fail("Model must be 100 characters or fewer.");
  if (draft.battery.trim() === "") return fail("Battery capacity is required.");
  const battery = Number(draft.battery);
  if (!Number.isFinite(battery) || battery <= 0 || battery > 250) {
    return fail("Battery capacity must be a number between 0 and 250 kWh.");
  }
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(draft.battery.trim())) {
    return fail("Battery capacity must have at most two decimal places.");
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
    Booked: "bg-amber-50 text-amber-700 ring-amber-200",
    Confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "In progress": "bg-sky-50 text-sky-700 ring-sky-200",
    Completed: "bg-slate-100 text-slate-700 ring-slate-200",
    Cancelled: "bg-red-50 text-red-700 ring-red-200",
    "No-show": "bg-red-50 text-red-700 ring-red-200",
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
  onReserve,
}: {
  station: DashboardStation;
  onReserve: (stationId: number) => void;
}) {
  const pct =
    station.totalPoints > 0
      ? Math.round((station.availablePoints / station.totalPoints) * 100)
      : 0;
  const power =
    station.minPowerKW === null || station.maxPowerKW === null
      ? "Not listed"
      : station.minPowerKW === station.maxPowerKW
        ? `${formatNumber2(station.minPowerKW)} kW`
        : `${formatNumber2(station.minPowerKW)}-${formatNumber2(station.maxPowerKW)} kW`;
  const tariff =
    station.minTariffPerKWh === null || station.maxTariffPerKWh === null
      ? "Not listed"
      : station.minTariffPerKWh === station.maxTariffPerKWh
        ? `₹${formatNumber2(station.minTariffPerKWh)}/kWh`
        : `₹${formatNumber2(station.minTariffPerKWh)}-₹${formatNumber2(station.maxTariffPerKWh)}/kWh`;

  return (
    <article className={`${cardCls} flex flex-col p-5 transition hover:border-emerald-300 hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">📍 {station.city}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#0f1b3d]">{station.name}</h3>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-600">{station.location}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {station.connectorTypes.length > 0 ? (
          station.connectorTypes.map((connector) => (
            <span
              key={connector}
              className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200"
            >
              {connector}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-500">No connector details</span>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <DetailItem label="Power range" value={power} />
        <DetailItem label="Tariff range" value={tariff} />
      </dl>
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>Charging points available</span>
          <span className="font-semibold text-[#0f1b3d]">
            {station.availablePoints} of {station.totalPoints}
          </span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`${station.availablePoints} of ${station.totalPoints} charging points available`}
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
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
  cancelling,
}: {
  reservation: ApiReservation;
  nowMs: number;
  onCancel: (id: number) => void;
  cancelling: boolean;
}) {
  const status = displayApiStatus(reservation, nowMs);
  const canCancel = isApiReservationCancellable(reservation);
  const energyKWh = (reservation.endMs - reservation.startMs) / 3600000 * reservation.powerKW;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-[#0f1b3d]">
            #{reservation.id}
          </span>
          <StatusBadge status={status} />
        </div>
        {canCancel ? (
          <button
            type="button"
            onClick={() => onCancel(reservation.id)}
            disabled={cancelling}
            className={`${btnDanger} px-3 py-1.5`}
          >
            {cancelling ? "Cancelling…" : "Cancel reservation"}
          </button>
        ) : status === "Cancelled" ? (
          <span className="text-xs text-slate-500">Cancelled · charging point released</span>
        ) : !reservation.userId ? (
          <span className="text-xs text-slate-500">This reservation belongs to another account.</span>
        ) : null}
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem label="Station" value={reservation.stationName} />
        <DetailItem label="Location" value={`${reservation.location}, ${reservation.city}`} />
        <DetailItem label="Charging point" value={reservation.pointId} />
        <DetailItem label="Vehicle" value={reservation.vehicle} />
        <DetailItem label="Start" value={formatDateTime(reservation.startMs)} />
        <DetailItem label="End" value={formatDateTime(reservation.endMs)} />
        <DetailItem label="Est. energy" value={`${formatNumber2(energyKWh)} kWh`} />
      </dl>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  Views                                                                     */
/* -------------------------------------------------------------------------- */

function DashboardView({
  stations,
  stationsLoading,
  stationsError,
  reservations,
  liveCount,
  nowMs,
  historyLoading,
  historyError,
  onRetryStations,
  onRetryHistory,
  onReserve,
  onNavigate,
}: {
  stations: DashboardStation[];
  stationsLoading: boolean;
  stationsError: string | null;
  reservations: ApiReservation[];
  liveCount: number;
  nowMs: number;
  historyLoading: boolean;
  historyError: string | null;
  onRetryStations: () => void;
  onRetryHistory: () => void;
  onReserve: (stationId: number) => void;
  onNavigate: (view: View) => void;
}) {
  const featured = stations.slice(0, 3);
  const recent = reservations.slice(0, 3);
  const totalPoints = stations.reduce((sum, station) => sum + station.totalPoints, 0);
  const totalAvailable = stations.reduce((sum, station) => sum + station.availablePoints, 0);
  const cancelled = reservations.filter((r) => r.status === "Cancelled").length;

  return (
    <div>
      <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 text-white shadow-sm sm:p-8">
        <p className="text-sm font-medium text-emerald-100">Welcome back 👋</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Welcome to VoltReserve</h1>
        <p className="mt-2 max-w-xl text-sm text-emerald-50">
          Find a charging station, pick an available charging point, and reserve a slot for your EV.
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
        Stations, EV management, reservations and admin tools are connected to MySQL. MongoDB stores application activity.
      </DemoNotice>

      <section aria-label="Statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Charging stations"
          value={stationsLoading || stationsError ? "—" : String(stations.length)}
          hint={stationsLoading ? "Loading station data" : stationsError ? "Station data unavailable" : "Across all cities"}
          icon="🏢"
        />
        <StatCard
          label="Available charging points"
          value={stationsLoading || stationsError ? "—" : String(totalAvailable)}
          hint={
            stationsLoading
              ? "Loading station data"
              : stationsError
                ? "Station data unavailable"
                : `${totalAvailable} of ${totalPoints} marked available`
          }
          icon="🔌"
        />
        <StatCard
          label="Reservations"
          value={historyLoading || historyError ? "—" : String(reservations.length)}
          hint={
            historyLoading
              ? "Loading reservation history"
              : historyError
                ? "History unavailable"
                : `${cancelled} cancelled`
          }
          icon="🗓"
        />
        <StatCard
          label="Active bookings"
          value={historyLoading || historyError ? "—" : String(liveCount)}
          hint={historyError ? "History unavailable" : "Upcoming or in progress"}
          icon="✅"
        />
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
        {stationsLoading ? (
          <div role="status" className={`${cardCls} px-6 py-10 text-center text-sm text-slate-600`}>
            Loading station data…
          </div>
        ) : stationsError ? (
          <EmptyState
            icon="⚠️"
            title="Could not load stations"
            message={stationsError}
            action={
              <button type="button" onClick={onRetryStations} className={btnPrimary}>
                Retry
              </button>
            }
          />
        ) : featured.length === 0 ? (
          <EmptyState
            icon="⚡"
            title="No stations found"
            message="There are no charging stations in the database yet."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featured.map((s) => (
              <StationCard key={s.id} station={s} onReserve={onReserve} />
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
        {historyLoading ? (
          <div role="status" className={`${cardCls} px-6 py-10 text-center text-sm text-slate-600`}>
            Loading reservation history…
          </div>
        ) : historyError ? (
          <EmptyState
            icon="⚠️"
            title="Could not load reservation history"
            message={historyError}
            action={
              <button type="button" onClick={onRetryHistory} className={btnPrimary}>
                Retry
              </button>
            }
          />
        ) : recent.length === 0 ? (
          <EmptyState
            icon="🗓"
            title="No reservations yet"
            message="Reservations created through the booking form will appear here."
            action={
              <button type="button" onClick={() => onNavigate("reservations")} className={btnPrimary}>
                Create a reservation
              </button>
            }
          />
        ) : (
          <ul className={`${cardCls} divide-y divide-slate-100`}>
            {recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-[#0f1b3d]">
                    {r.stationName} · {r.pointId}
                  </p>
                  <p className="text-xs text-slate-500">
                    #{r.id} · {formatDateTime(r.startMs)} → {formatDateTime(r.endMs)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-600">
                    {formatNumber2(((r.endMs - r.startMs) / 3600000) * r.powerKW)} kWh est.
                  </span>
                  <StatusBadge status={displayApiStatus(r, nowMs)} />
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
  onReserve,
}: {
  onReserve: (stationId: number) => void;
}) {
  const [query, setQuery] = useState<string>("");
  const [city, setCity] = useState<string>("All");
  const [connector, setConnector] = useState<string>("All");
  const [stations, setStations] = useState<ApiStation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function loadStations() {
      setLoading(true);
      setError(null);

      try {
        const [stationsResponse, optionsResponse] = await Promise.all([
          fetch("/api/stations"),
          fetch("/api/booking-options"),
        ]);
        if (!stationsResponse.ok || !optionsResponse.ok) {
          throw new Error("Could not load station data. Please try again.");
        }

        const [stationsPayload, optionsPayload]: [unknown, unknown] = await Promise.all([
          stationsResponse.json(),
          optionsResponse.json(),
        ]);
        const stationRows = parseStationsResponse(stationsPayload);
        const chargingPoints = parseChargingPointsResponse(optionsPayload);

        if (!cancelled) setStations(combineApiStations(stationRows, chargingPoints));
      } catch (loadError) {
        if (!cancelled) {
          setStations([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load station data. Please try again."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadStations();
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const cityOptions = useMemo(() => Array.from(new Set(stations.map((s) => s.city))).sort(), [stations]);
  const connectorOptions = useMemo(
    () =>
      Array.from(
        new Set(stations.flatMap((station) => station.chargingPoints.map((point) => point.connector)))
      ).sort(),
    [stations]
  );
  const effectiveCity = city === "All" || cityOptions.includes(city) ? city : "All";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stations.filter(
      (s) =>
        (q === "" || s.name.toLowerCase().includes(q)) &&
        (effectiveCity === "All" || s.city === effectiveCity) &&
        (connector === "All" || s.chargingPoints.some((point) => point.connector === connector))
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
            onChange={(e) => setConnector(e.target.value)}
            className={inputCls}
          >
            <option value="All">All connectors</option>
            {connectorOptions.map((c) => (
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

      {loading ? (
        <div role="status" className={`${cardCls} px-6 py-12 text-center text-sm text-slate-600`}>
          Loading charging stations…
        </div>
      ) : error ? (
        <EmptyState
          icon="⚠️"
          title="Could not load charging stations"
          message={error}
          action={
            <button type="button" onClick={() => setRetryCount((count) => count + 1)} className={btnPrimary}>
              Retry
            </button>
          }
        />
      ) : stations.length === 0 ? (
        <EmptyState
          icon="⚡"
          title="No charging stations available"
          message="The stations API did not return any station records."
        />
      ) : filtered.length === 0 ? (
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
            <ApiStationCard key={s.id} station={s} onReserve={onReserve} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApiStationCard({
  station,
  onReserve,
}: {
  station: ApiStation;
  onReserve: (stationId: number) => void;
}) {
  const connectorTypes = Array.from(new Set(station.chargingPoints.map((point) => point.connector)));

  return (
    <article className={`${cardCls} flex flex-col p-5 transition hover:border-emerald-300 hover:shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">📍 {station.city}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#0f1b3d]">{station.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{station.location}</p>
        </div>
        {connectorTypes.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-1">
            {connectorTypes.map((connector) => (
              <span
                key={connector}
                className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200"
              >
                {connector}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Available charging points ({station.chargingPoints.length})
        </p>
        {station.chargingPoints.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {station.chargingPoints.map((point) => (
              <li key={point.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-mono text-sm font-semibold text-[#0f1b3d]">{point.id}</span>
                <span className="text-xs text-slate-600">
                  {point.connector} · {point.powerKW} kW · ₹{point.tariffPerKWh}/kWh
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No available charging points were returned for this station.</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onReserve(station.id)}
        disabled={station.chargingPoints.length === 0}
        className={`${btnPrimary} mt-5 w-full`}
      >
        Reserve
      </button>
    </article>
  );
}

function ReservationsView({
  stations,
  vehicles,
  reservations,
  form,
  nowMs,
  formFeedback,
  historyFeedback,
  optionsLoading,
  optionsError,
  historyLoading,
  historyError,
  submitting,
  cancellingId,
  onStationChange,
  onPointChange,
  onTariffChange,
  onFieldChange,
  onQuickFill,
  onSubmit,
  onCancel,
  onRetryOptions,
  onRetryHistory,
}: {
  stations: BookingStation[];
  vehicles: BookingVehicle[];
  reservations: ApiReservation[];
  form: ReservationForm;
  nowMs: number;
  formFeedback: Feedback | null;
  historyFeedback: Feedback | null;
  optionsLoading: boolean;
  optionsError: string | null;
  historyLoading: boolean;
  historyError: string | null;
  submitting: boolean;
  cancellingId: number | null;
  onStationChange: (stationId: number) => void;
  onPointChange: (pointId: number) => void;
  onTariffChange: (tariffId: number) => void;
  onFieldChange: (patch: Partial<ReservationForm>) => void;
  onQuickFill: () => void;
  onSubmit: () => void;
  onCancel: (id: number) => void;
  onRetryOptions: () => void;
  onRetryHistory: () => void;
}) {
  const station = stations.find((item) => item.id === form.stationId);
  const point = station?.points.find((item) => item.id === form.pointId);
  const tariff = point?.tariffs.find((item) => item.id === form.tariffId);
  const vehicle = vehicles.find((item) => item.id === form.evId);
  const startMs = parseLocal(form.start);
  const endMs = parseLocal(form.end);
  const hours = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
    ? (endMs - startMs) / 3600000
    : null;
  const energyKWh = hours !== null && point ? hours * point.powerKW : null;
  const cost = energyKWh !== null && tariff ? energyKWh * tariff.ratePerKWh : null;

  const startError =
    form.start && Number.isFinite(startMs) && nowMs > 0 && startMs <= nowMs
      ? "Start time must be in the future."
      : undefined;
  const endError =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs <= startMs
      ? "End time must be later than the start time."
      : undefined;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
  };

  const canShowForm = stations.length > 0 && vehicles.length > 0;

  return (
    <div>
      <PageHeader
        title="Reservations"
        subtitle="Reserve a charging point for your EV and review your reservation history."
      />
      {optionsLoading ? (
        <div role="status" className={`${cardCls} px-6 py-10 text-center text-sm text-slate-600`}>
          Loading vehicles and available charging points…
        </div>
      ) : optionsError ? (
        <EmptyState
          icon="⚠️"
          title="Could not load booking options"
          message={optionsError}
          action={
            <button type="button" onClick={onRetryOptions} className={btnPrimary}>
              Retry
            </button>
          }
        />
      ) : !canShowForm ? (
        <EmptyState
          icon="📝"
          title={stations.length === 0 ? "No available charging points" : "No vehicles available"}
          message={
            stations.length === 0
              ? "No available station and charging-point combinations were returned by the booking options API."
              : "No vehicles were returned by the booking options API."
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
                  value={station?.id ?? ""}
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
                hint={station ? `${station.points.length} available points at this station` : undefined}
              >
                <select
                  id="res-point"
                  aria-required="true"
                  value={point?.id ?? ""}
                  onChange={(e) => onPointChange(Number(e.target.value))}
                  className={inputCls}
                >
                  {(station?.points ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.connector} · {p.powerKW} kW
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field id="res-tariff" label="Tariff">
              <select
                id="res-tariff"
                aria-required="true"
                value={tariff?.id ?? ""}
                onChange={(e) => onTariffChange(Number(e.target.value))}
                className={inputCls}
              >
                {(point?.tariffs ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    ₹{option.ratePerKWh}/kWh
                  </option>
                ))}
              </select>
            </Field>

            <Field id="res-ev" label="Electric vehicle">
              <select
                id="res-ev"
                aria-required="true"
                value={vehicle?.id ?? ""}
                onChange={(e) => onFieldChange({ evId: Number(e.target.value) })}
                className={inputCls}
              >
                {vehicles.map((v) => (
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
              <span className="text-xs text-slate-500">Adjacent bookings are allowed.</span>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
              <button type="submit" disabled={submitting || !point || point.status !== "Available"} className={btnPrimary}>
                {submitting ? "Submitting…" : "Reserve charging point"}
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
                <DetailItem label="Charger power" value={point ? `${point.powerKW} kW` : "—"} />
                <DetailItem label="Tariff" value={tariff ? `₹${tariff.ratePerKWh}/kWh` : "—"} />
              </dl>
            ) : null}
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between">
                <dt className="text-sm text-slate-600">Duration</dt>
                <dd className="text-sm font-semibold text-[#0f1b3d]">
                  {hours !== null ? `${formatNumber2(hours)} h` : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-sm text-slate-600">Estimated energy</dt>
                <dd className="text-lg font-bold text-[#0f1b3d]">
                  {energyKWh !== null ? `${formatNumber2(energyKWh)} kWh` : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-sm text-slate-600">Estimated cost</dt>
                <dd className="text-lg font-bold text-emerald-700">{cost !== null ? formatINR(cost) : "—"}</dd>
              </div>
            </dl>
            {hours !== null && point && energyKWh !== null && tariff && cost !== null ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                {formatNumber2(hours)} h × {point.powerKW} kW = {formatNumber2(energyKWh)} kWh;{" "}
                {formatNumber2(energyKWh)} kWh × ₹{tariff.ratePerKWh} = {formatINR(cost)}
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
            Reservation history
          </h2>
          <span className="text-sm text-slate-600">
            {historyLoading
              ? "Loading…"
              : historyError
                ? "Unavailable"
                : `${reservations.length} reservation${reservations.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="mb-4">
          <Alert feedback={historyFeedback} />
        </div>
        {historyLoading ? (
          <div role="status" className={`${cardCls} px-6 py-10 text-center text-sm text-slate-600`}>
            Loading reservation history…
          </div>
        ) : historyError ? (
          <EmptyState
            icon="⚠️"
            title="Could not load reservation history"
            message={historyError}
            action={
              <button type="button" onClick={onRetryHistory} className={btnPrimary}>
                Retry
              </button>
            }
          />
        ) : reservations.length === 0 ? (
          <EmptyState
            icon="🗓"
            title="No reservations yet"
            message="Once you reserve a charging point, it will appear here with its status and reservation details."
          />
        ) : (
          <ul className="space-y-3">
            {reservations.map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                nowMs={nowMs}
                onCancel={onCancel}
                cancelling={cancellingId === r.id}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EvsView({
  evs,
  loading,
  loadError,
  authRequired,
  onRetry,
  onSave,
  onDelete,
}: {
  evs: Ev[];
  loading: boolean;
  loadError: string | null;
  authRequired: boolean;
  onRetry: () => void;
  onSave: (draft: EvDraft, editingId: string | null) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
}) {
  const emptyDraft: EvDraft = { number: "", model: "", battery: "", connector: "CCS2" };
  const [draft, setDraft] = useState<EvDraft>(emptyDraft);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await onSave(draft, editingId);
      setFeedback({ kind: result.ok ? "success" : "error", text: result.message });
      if (result.ok) resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const result = await onDelete(id);
      setFeedback({ kind: result.ok ? "success" : "error", text: result.message });
      if (result.ok && editingId === id) resetForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="My EVs" subtitle="Manage the vehicles you use for charging reservations." />
      {loadError ? (
        <div className="mb-5">
          <Alert feedback={{ kind: "error", text: loadError }} />
          {authRequired ? (
            <Link href="/login" className="mt-2 inline-block text-sm font-semibold text-emerald-700 underline">
              Sign in to manage your vehicles
            </Link>
          ) : (
            <button type="button" onClick={onRetry} className={`${btnSecondary} mt-2`}>
              Retry
            </button>
          )}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="ev-list-heading">
          <h2 id="ev-list-heading" className="mb-4 text-lg font-semibold text-[#0f1b3d]">
            Your vehicles ({evs.length})
          </h2>
          {loading ? (
            <p role="status" className="text-sm text-slate-600">Loading your vehicles...</p>
          ) : loadError && evs.length === 0 ? (
            <p className="text-sm text-slate-600">Your vehicles are unavailable until they can be loaded.</p>
          ) : evs.length === 0 ? (
            <EmptyState
              icon="🚗"
              title="No vehicles yet"
              message="Add your first EV using the form so you can book charging slots."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {evs.map((v) => {
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
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={saving || loading || authRequired}
                          onClick={() => {
                            setEditingId(v.id);
                            setDraft({
                              number: v.number,
                              model: v.model,
                              battery: String(v.batteryKWh),
                              connector: v.connector,
                            });
                            setFeedback(null);
                          }}
                          className={`${btnSecondary} px-3 py-1.5`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={saving || loading || authRequired}
                          onClick={() => void handleDelete(v.id)}
                          className={`${btnDanger} px-3 py-1.5`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <form onSubmit={handleSubmit} noValidate className={`${cardCls} h-fit space-y-4 p-5 sm:p-6`}>
          <h2 className="text-lg font-semibold text-[#0f1b3d]">
            {editingId ? "Edit EV" : "Add EV"}
          </h2>
          <Alert feedback={feedback} />
          <Field id="ev-number" label="Vehicle number" hint="For example KA01AB1234">
            <input
              id="ev-number"
              type="text"
              aria-required="true"
              maxLength={20}
              disabled={authRequired}
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
              maxLength={100}
              disabled={authRequired}
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
              min="0.01"
              max="250"
              step="0.01"
              aria-required="true"
              disabled={authRequired}
              value={draft.battery}
              onChange={(e) => setDraft({ ...draft, battery: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field id="ev-connector" label="Connector type">
            <select
              id="ev-connector"
              disabled={authRequired}
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
          <button type="submit" disabled={saving || loading || authRequired} className={`${btnPrimary} w-full`}>
            {saving ? "Saving..." : editingId ? "Update EV" : "Add EV"}
          </button>
          {editingId ? (
            <button
              type="button"
              disabled={saving || authRequired}
              onClick={resetForm}
              className={`${btnSecondary} w-full`}
            >
              Cancel editing
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function parseAdminStationsResponse(value: unknown): Station[] {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.data)) {
    throw new Error("The admin stations API returned an invalid response.");
  }

  return value.data.map((row: unknown): Station => {
    if (!isRecord(row)) throw new Error("The admin stations API returned an invalid station.");
    const connector = toConnector(parseText(row.connector_type, "station connector"));
    if (!connector) throw new Error("The admin stations API returned an unsupported connector.");

    const pointIds = row.point_ids;
    if (!Array.isArray(pointIds) || !pointIds.every((id) => typeof id === "string")) {
      throw new Error("The admin stations API returned invalid charging-point codes.");
    }

    return {
      id: parseId(row.station_id),
      name: parseText(row.station_name, "station name"),
      location: parseText(row.location, "station location"),
      city: parseText(row.city, "station city"),
      connector,
      powerKW: parseNumber(row.power_kw, "station power rating"),
      tariffPerKWh: parseNumber(row.rate_per_kwh, "station tariff"),
      pointIds,
      activeReservations: parseNumber(row.active_reservations, "active reservation count"),
    };
  });
}

function AdminView() {
  const emptyDraft: StationDraft = {
    name: "",
    location: "",
    city: "",
    connector: "CCS2",
    power: "",
    tariff: "",
    pointCount: "2",
    prefix: "",
  };

  const [stations, setStations] = useState<Station[]>([]);
  const [draft, setDraft] = useState<StationDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const editingStation = editingId === null ? undefined : stations.find((station) => station.id === editingId);

  const loadStations = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setAccessDenied(false);

    try {
      const response = await fetch("/api/admin/stations", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) {
        setAccessDenied(true);
      }
      const payload = await readApiResponse(response, "");
      setStations(parseAdminStationsResponse(payload));
    } catch (error) {
      setStations([]);
      setLoadError(
        error instanceof Error ? error.message : "Could not load station management data."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadStations);
  }, [loadStations]);

  const resetForm = () => {
    setDraft(emptyDraft);
    setEditingId(null);
    setConfirmId(null);
  };

  const startEdit = (station: Station) => {
    setEditingId(station.id);
    setConfirmId(null);
    setFeedback(null);
    setDraft({
      name: station.name,
      location: station.location,
      city: station.city,
      connector: station.connector,
      power: String(station.powerKW),
      tariff: String(station.tariffPerKWh),
      pointCount: String(station.pointIds.length),
      prefix: derivePrefix(station),
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    const validation = validateStationDraft(draft, stations, editingStation ?? null);
    if (!validation.ok) {
      setFeedback({ kind: "error", text: validation.error });
      return;
    }

    setSaving(true);
    try {
      const body = {
        ...(editingId !== null ? { station_id: editingId } : {}),
        station_name: validation.value.name,
        location: validation.value.location,
        city: validation.value.city,
        connector_type: validation.value.connector,
        power_kw: validation.value.powerKW,
        rate_per_kwh: validation.value.tariffPerKWh,
        point_count: validation.value.pointIds.length,
        point_code_prefix: editingStation ? derivePrefix(editingStation) : draft.prefix.trim().toUpperCase(),
      };

      const response = await fetch("/api/admin/stations", {
        method: editingId === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readApiResponse(response, "");
      const message =
        typeof payload.message === "string" ? payload.message : "Station saved successfully.";

      resetForm();
      await loadStations();
      setFeedback({ kind: "success", text: message });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save the station. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (stationId: number) => {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/stations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station_id: stationId }),
      });
      const payload = await readApiResponse(response, "");
      if (editingId === stationId) resetForm();
      setConfirmId(null);
      await loadStations();
      setFeedback({
        kind: "success",
        text: typeof payload.message === "string" ? payload.message : "Station deleted successfully.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not delete the station. Please try again.",
      });
      setConfirmId(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Admin · Station management"
        subtitle="Manage stations, charging points and tariffs stored in MySQL."
      />
      <DemoNotice>
        Protected administrator area. Changes are saved to MySQL. Charging points or stations with reservation history
        cannot be removed.
      </DemoNotice>

      <div className="mb-6">
        {loadError ? (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
            <p className="text-sm font-medium text-red-800">{loadError}</p>
            <button type="button" onClick={() => void loadStations()} className={`${btnSecondary} mt-3`}>
              Retry loading stations
            </button>
          </div>
        ) : null}
        <Alert feedback={feedback} />
      </div>

      {accessDenied ? (
        <section className={`${cardCls} p-6`}>
          <h2 className="text-lg font-semibold text-[#0f1b3d]">Administrator access required</h2>
          <p className="mt-2 text-sm text-slate-600">
            Sign in with an account whose MySQL role is <code>admin</code> to manage stations and charging points.
          </p>
        </section>
      ) : (
        <>
          <section className={`${cardCls} mb-8 overflow-hidden`} aria-labelledby="admin-table-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <h2 id="admin-table-heading" className="text-lg font-semibold text-[#0f1b3d]">
                Stations ({stations.length})
              </h2>
              <button type="button" onClick={() => void loadStations()} disabled={loading || saving} className={btnSecondary}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {loading ? (
              <p className="p-6 text-sm text-slate-600" role="status">Loading stations from MySQL...</p>
            ) : stations.length === 0 ? (
              <div className="p-6">
                <EmptyState icon="🏢" title="No stations" message="Use the form below to create the first charging station." />
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
                      <th scope="col" className="px-5 py-3">Charging points</th>
                      <th scope="col" className="px-5 py-3">Active bookings</th>
                      <th scope="col" className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stations.map((station) => (
                      <tr key={station.id} className="align-middle">
                        <td className="px-5 py-3">
                          <p className="font-medium text-[#0f1b3d]">{station.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{station.location}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{station.city}</td>
                        <td className="px-5 py-3"><ConnectorBadge connector={station.connector} /></td>
                        <td className="px-5 py-3 text-slate-700">{station.powerKW} kW</td>
                        <td className="px-5 py-3 text-slate-700">₹{station.tariffPerKWh}/kWh</td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-slate-700">{station.pointIds.length}</p>
                          <p className="mt-0.5 max-w-52 break-words text-xs text-slate-500">
                            {station.pointIds.join(", ") || "No points"}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{station.activeReservations}</td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {confirmId === station.id ? (
                              <>
                                <span className="text-xs font-medium text-red-700">Delete this station?</span>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void handleDelete(station.id)}
                                  className={`${btnDanger} px-3 py-1.5`}
                                >
                                  Confirm delete
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => setConfirmId(null)}
                                  className={`${btnSecondary} px-3 py-1.5`}
                                >
                                  Keep
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => startEdit(station)}
                                  className={`${btnSecondary} px-3 py-1.5`}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => {
                                    setConfirmId(station.id);
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
                    ))}
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
                <button type="button" disabled={saving} onClick={resetForm} className={btnSecondary}>
                  Cancel editing
                </button>
              ) : null}
            </div>

            {editingStation ? (
              <p className="text-xs text-slate-500">
                Charging-point codes stay fixed after creation. Reducing the point count or deleting the station is
                blocked when any affected point has reservation history.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field id="adm-name" label="Station name">
                <input
                  id="adm-name"
                  type="text"
                  maxLength={150}
                  required
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className={inputCls}
                  autoComplete="off"
                />
              </Field>
              <Field id="adm-location" label="Location">
                <input
                  id="adm-location"
                  type="text"
                  maxLength={255}
                  required
                  value={draft.location}
                  onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                  className={inputCls}
                  autoComplete="street-address"
                />
              </Field>
              <Field id="adm-city" label="City">
                <input
                  id="adm-city"
                  type="text"
                  maxLength={100}
                  required
                  value={draft.city}
                  onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                  className={inputCls}
                  autoComplete="address-level2"
                />
              </Field>
              <Field id="adm-connector" label="Connector type">
                <select
                  id="adm-connector"
                  value={draft.connector}
                  onChange={(event) => setDraft({ ...draft, connector: toConnector(event.target.value) ?? "CCS2" })}
                  className={inputCls}
                >
                  {CONNECTORS.map((connector) => (
                    <option key={connector} value={connector}>{connector}</option>
                  ))}
                </select>
              </Field>
              <Field id="adm-power" label="Power rating (kW)" hint="Greater than 0; up to 2 decimals">
                <input
                  id="adm-power"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="9999.99"
                  step="0.01"
                  required
                  value={draft.power}
                  onChange={(event) => setDraft({ ...draft, power: event.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field id="adm-tariff" label="Tariff (₹ per kWh)" hint="0 or higher; up to 2 decimals">
                <input
                  id="adm-tariff"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="999999.99"
                  step="0.01"
                  required
                  value={draft.tariff}
                  onChange={(event) => setDraft({ ...draft, tariff: event.target.value })}
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
                  required
                  value={draft.pointCount}
                  onChange={(event) => setDraft({ ...draft, pointCount: event.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field
                id="adm-prefix"
                label="Charging-point code prefix"
                hint={editingStation ? "Fixed after creation" : "2–5 letters/digits, e.g. KOR → KOR-01, KOR-02"}
              >
                <input
                  id="adm-prefix"
                  type="text"
                  maxLength={5}
                  required
                  disabled={editingStation !== undefined || saving}
                  value={editingStation ? derivePrefix(editingStation) : draft.prefix}
                  onChange={(event) => setDraft({ ...draft, prefix: event.target.value.toUpperCase() })}
                  className={inputCls}
                  autoComplete="off"
                />
              </Field>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              <button type="submit" disabled={saving || loading} className={btnPrimary}>
                {saving ? "Saving..." : editingStation ? "Save changes" : "Add station"}
              </button>
              <button type="button" disabled={saving} onClick={resetForm} className={btnSecondary}>
                Reset form
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

function ActivityView() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/activity-logs", { cache: "no-store" });
      const result = (await response.json()) as {
        success?: boolean;
        message?: string;
        data?: ActivityLogEntry[];
      };

      if (!response.ok || result.success !== true) {
        throw new Error(result.message || "Could not load activity logs.");
      }

      setLogs(Array.isArray(result.data) ? result.data : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load activity logs. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadLogs);
  }, [loadLogs]);

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle="Recent account and reservation events stored in MongoDB."
      />

      <section className={`${cardCls} overflow-hidden`} aria-labelledby="activity-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="activity-heading" className="text-lg font-semibold text-[#0f1b3d]">
              Recent activity
            </h2>
            <p className="mt-1 text-xs text-slate-500">Showing up to the latest 50 events available to your account.</p>
          </div>
          <button type="button" onClick={() => void loadLogs()} disabled={loading} className={btnSecondary}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-600" role="status">Loading activity logs...</p>
        ) : error ? (
          <div className="p-6" role="alert">
            <p className="text-sm text-red-700">{error}</p>
            <button type="button" onClick={() => void loadLogs()} className={`${btnSecondary} mt-3`}>
              Try again
            </button>
          </div>
        ) : logs.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No activity has been recorded for this account yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((log) => {
              const date = log.timestamp ? new Date(log.timestamp) : null;
              const timestampLabel =
                date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Time unavailable";
              const metadataText = JSON.stringify(log.metadata ?? {});

              return (
                <li key={log.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold capitalize text-[#0f1b3d]">
                      {log.action.replace(/\./g, " ")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {log.entityType} #{log.entityId} · User #{log.userId}
                    </p>
                    {metadataText !== "{}" ? (
                      <p className="mt-2 break-words text-xs text-slate-600">Details: {metadataText}</p>
                    ) : null}
                  </div>
                  <time dateTime={log.timestamp ?? undefined} className="shrink-0 text-xs text-slate-500">
                    {timestampLabel}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(0);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string>("");
  const [loggingOut, setLoggingOut] = useState<boolean>(false);

  const [dashboardStations, setDashboardStations] = useState<DashboardStation[]>([]);
  const [dashboardStationsLoading, setDashboardStationsLoading] = useState<boolean>(true);
  const [dashboardStationsError, setDashboardStationsError] = useState<string | null>(null);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [evsLoading, setEvsLoading] = useState<boolean>(true);
  const [evsError, setEvsError] = useState<string | null>(null);
  const [evsAuthRequired, setEvsAuthRequired] = useState<boolean>(false);

  const [form, setForm] = useState<ReservationForm>({
    stationId: null,
    pointId: null,
    evId: null,
    tariffId: null,
    start: "",
    end: "",
  });
  const [formFeedback, setFormFeedback] = useState<Feedback | null>(null);
  const [historyFeedback, setHistoryFeedback] = useState<Feedback | null>(null);
  const [bookingStations, setBookingStations] = useState<BookingStation[]>([]);
  const [bookingVehicles, setBookingVehicles] = useState<BookingVehicle[]>([]);
  const [bookingOptionsLoading, setBookingOptionsLoading] = useState<boolean>(true);
  const [bookingOptionsError, setBookingOptionsError] = useState<string | null>(null);
  const [apiReservations, setApiReservations] = useState<ApiReservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const loadAuthUser = useCallback(async () => {
    setAuthLoading(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.status === 401) {
        setAuthUser(null);
        return;
      }

      const payload = await readApiResponse(response, "");
      if (!isRecord(payload.user)) {
        throw new Error("The session API returned invalid account details.");
      }

      const role = parseText(payload.user.role, "account role");
      if (role !== "customer" && role !== "admin") {
        throw new Error("The session API returned an unsupported account role.");
      }

      setAuthUser({
        userId: parseId(payload.user.userId),
        name: parseText(payload.user.name, "account name"),
        email: parseText(payload.user.email, "account email"),
        role,
      });
    } catch (error) {
      setAuthUser(null);
      setAuthError(
        error instanceof Error ? error.message : "Could not check your sign-in status."
      );
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const loadEvs = useCallback(async (): Promise<boolean> => {
    setEvsLoading(true);
    setEvsError(null);
    setEvsAuthRequired(false);
    try {
      const response = await fetch("/api/evs");
      if (response.status === 401) setEvsAuthRequired(true);
      const payload = await readApiResponse(response, "");
      setEvs(parseEvsResponse(payload));
      return true;
    } catch (error) {
      setEvsError(
        error instanceof Error ? error.message : "Could not load vehicles. Please try again."
      );
      return false;
    } finally {
      setEvsLoading(false);
    }
  }, []);

  const loadDashboardStations = useCallback(async () => {
    setDashboardStationsLoading(true);
    setDashboardStationsError(null);
    try {
      const payload = await readApiResponse(await fetch("/api/stations"));
      setDashboardStations(parseDashboardStationsResponse(payload));
    } catch (error) {
      setDashboardStations([]);
      setDashboardStationsError(
        error instanceof Error ? error.message : "Could not load station data. Please try again."
      );
    } finally {
      setDashboardStationsLoading(false);
    }
  }, []);

  const loadBookingOptions = useCallback(async () => {
    setBookingOptionsLoading(true);
    setBookingOptionsError(null);
    try {
      const payload = await readApiResponse(await fetch("/api/booking-options"));
      const options = parseBookingOptions(payload);
      setBookingStations(options.stations);
      setBookingVehicles(options.vehicles);
      setForm((previous) => {
        const station =
          options.stations.find((item) => item.id === previous.stationId) ?? options.stations[0];
        const point = station?.points.find((item) => item.id === previous.pointId) ?? station?.points[0];
        const tariff = point?.tariffs.find((item) => item.id === previous.tariffId) ?? point?.tariffs[0];
        const vehicle = options.vehicles.find((item) => item.id === previous.evId) ?? options.vehicles[0];
        return {
          ...previous,
          stationId: station?.id ?? null,
          pointId: point?.id ?? null,
          tariffId: tariff?.id ?? null,
          evId: vehicle?.id ?? null,
        };
      });
    } catch (error) {
      setBookingStations([]);
      setBookingVehicles([]);
      setBookingOptionsError(
        error instanceof Error ? error.message : "Could not load booking options. Please try again."
      );
    } finally {
      setBookingOptionsLoading(false);
    }
  }, []);

  const loadReservationHistory = useCallback(async (): Promise<boolean> => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const payload = await readApiResponse(await fetch("/api/reservations"));
      setApiReservations(parseReservationHistory(payload, bookingVehicles));
      return true;
    } catch (error) {
      setApiReservations([]);
      setHistoryError(
        error instanceof Error ? error.message : "Could not load reservation history. Please try again."
      );
      return false;
    } finally {
      setHistoryLoading(false);
    }
  }, [bookingVehicles]);

  useEffect(() => {
    void Promise.resolve().then(loadAuthUser);
  }, [loadAuthUser]);

  useEffect(() => {
    void Promise.resolve().then(loadDashboardStations);
  }, [loadDashboardStations]);

  useEffect(() => {
    void Promise.resolve().then(loadEvs);
  }, [loadEvs]);

  useEffect(() => {
    void Promise.resolve().then(loadBookingOptions);
  }, [loadBookingOptions]);

  useEffect(() => {
    void Promise.resolve().then(loadReservationHistory);
  }, [loadReservationHistory]);

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
    const target = bookingStations.find((station) => station.id === stationId);
    const point = target?.points[0];
    updateForm({
      stationId,
      pointId: point?.id ?? null,
      tariffId: point?.tariffs[0]?.id ?? null,
    });
  };

  const handlePointChange = (pointId: number) => {
    const point = bookingStations
      .find((station) => station.id === form.stationId)
      ?.points.find((item) => item.id === pointId);
    updateForm({ pointId, tariffId: point?.tariffs[0]?.id ?? null });
  };

  const handleTariffChange = (tariffId: number) => {
    updateForm({ tariffId });
  };

  const handleQuickFill = () => {
    const start = Math.ceil((Date.now() + 60000) / 3600000) * 3600000;
    updateForm({ start: toLocalInput(start), end: toLocalInput(start + 3600000) });
  };

  const openReserve = (stationId: number) => {
    const target = bookingStations.find((station) => station.id === stationId);
    if (target && target.points.length > 0) {
      const point = target.points[0];
      setForm((prev) => ({
        ...prev,
        stationId: target.id,
        pointId: point.id,
        tariffId: point.tariffs[0]?.id ?? null,
      }));
    }
    setFormFeedback(null);
    go("reservations");
  };

  const submitReservation = async () => {
    const station = bookingStations.find((item) => item.id === form.stationId);
    const point = station?.points.find((item) => item.id === form.pointId);
    const tariff = point?.tariffs.find((item) => item.id === form.tariffId);
    const vehicle = bookingVehicles.find((item) => item.id === form.evId);
    const missing: string[] = [];
    if (!station) missing.push("charging station");
    if (!point) missing.push("charging point");
    if (!tariff) missing.push("tariff");
    if (!vehicle) missing.push("electric vehicle");
    if (!form.start) missing.push("start date and time");
    if (!form.end) missing.push("end date and time");
    if (missing.length > 0 || !station || !point || !tariff || !vehicle) {
      setFormFeedback({ kind: "error", text: `Please select or enter: ${missing.join(", ")}.` });
      return;
    }
    const startMs = parseLocal(form.start);
    const endMs = parseLocal(form.end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      setFormFeedback({ kind: "error", text: "Please enter valid start and end date/time values." });
      return;
    }
    if (startMs <= Date.now()) {
      setFormFeedback({ kind: "error", text: "The start time must be in the future." });
      return;
    }
    if (endMs <= startMs) {
      setFormFeedback({ kind: "error", text: "The end time must be later than the start time." });
      return;
    }
    if (point.status !== "Available") {
      setFormFeedback({
        kind: "error",
        text: "This charging point is no longer available. Refresh booking options and select another point.",
      });
      return;
    }

    setSubmitting(true);
    setFormFeedback(null);
    try {
      const payload = await readApiResponse(
        await fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: vehicle.userId,
            ev_id: vehicle.id,
            point_id: point.id,
            tariff_id: tariff.id,
            start_time: new Date(startMs).toISOString(),
            end_time: new Date(endMs).toISOString(),
          }),
        })
      );
      const reservationId = parseId(payload.reservation_id);
      const historyRefreshed = await loadReservationHistory();
      setHistoryFeedback(
        historyRefreshed
          ? null
          : { kind: "error", text: "The reservation was saved, but history could not be refreshed." }
      );
      setFormFeedback({
        kind: "success",
        text: `Reservation #${reservationId} created successfully for ${point.id} at ${station.name}.`,
      });
      setForm((previous) => ({ ...previous, start: "", end: "" }));
    } catch (error) {
      setFormFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not create the reservation. Please try again.",
      });
      void loadBookingOptions();
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReservation = async (id: number) => {
    const target = apiReservations.find((reservation) => reservation.id === id);
    if (!target || target.userId === null) {
      setHistoryFeedback({ kind: "error", text: "This reservation cannot be cancelled by the current account." });
      return;
    }
    setCancellingId(id);
    setHistoryFeedback(null);
    try {
      await readApiResponse(
        await fetch("/api/reservations", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservation_id: target.id, user_id: target.userId }),
        })
      );
      const historyRefreshed = await loadReservationHistory();
      setHistoryFeedback({
        kind: historyRefreshed ? "success" : "error",
        text: historyRefreshed
          ? `Reservation #${target.id} cancelled successfully.`
          : "The reservation was cancelled, but history could not be refreshed.",
      });
    } catch (error) {
      setHistoryFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not cancel the reservation. Please try again.",
      });
    } finally {
      setCancellingId(null);
    }
  };

  /* EV handlers */
  const saveEv = async (draft: EvDraft, editingId: string | null): Promise<ActionResult> => {
    const check = validateEvDraft(draft, evs, editingId);
    if (!check.ok) return { ok: false, message: check.error };

    try {
      const response = await fetch("/api/evs", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { ev_id: Number(editingId) } : {}),
          vehicle_number: check.value.number,
          model: check.value.model,
          battery_capacity: check.value.batteryKWh,
          connector_type: check.value.connector,
        }),
      });
      if (response.status === 401) setEvsAuthRequired(true);
      const payload = await readApiResponse(response, "");
      const refreshed = await loadEvs();
      await loadBookingOptions();
      const message =
        typeof payload.message === "string"
          ? payload.message
          : editingId
            ? "Vehicle updated successfully."
            : "Vehicle added successfully.";
      return {
        ok: true,
        message: refreshed ? message : `${message} The vehicle list could not be refreshed; please retry.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not save this vehicle. Please try again.",
      };
    }
  };

  const deleteEv = async (id: string): Promise<ActionResult> => {
    try {
      const response = await fetch("/api/evs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ev_id: Number(id) }),
      });
      if (response.status === 401) setEvsAuthRequired(true);
      const payload = await readApiResponse(response, "");
      const refreshed = await loadEvs();
      await loadBookingOptions();
      const message =
        typeof payload.message === "string" ? payload.message : "Vehicle deleted successfully.";
      return {
        ok: true,
        message: refreshed ? message : `${message} The vehicle list could not be refreshed; please retry.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not delete this vehicle. Please try again.",
      };
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      await readApiResponse(response, "");
      setAuthUser(null);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not sign out. Please try again."
      );
    } finally {
      setLoggingOut(false);
    }
  };

  const liveCount = apiReservations.filter(
    (reservation) =>
      ["Booked", "Confirmed"].includes(reservation.status) && reservation.endMs > nowMs
  ).length;

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
          {authLoading ? (
            <span className="max-w-24 truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              Checking…
            </span>
          ) : authUser ? (
            <span className="max-w-28 truncate rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              {authUser.name}
            </span>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
            >
              Sign in
            </Link>
          )}
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

        <section className="mx-4 mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Account">
          {authLoading ? (
            <p className="text-sm font-medium text-slate-600">Checking account…</p>
          ) : authUser ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signed in as</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#0f1b3d]">{authUser.name}</p>
              <p className="truncate text-xs text-slate-500">{authUser.email}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-800">
                  {authUser.role}
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className={btnSecondary}
                >
                  {loggingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-[#0f1b3d]">Welcome to VoltReserve</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Sign in or create an account to manage your EVs and reservations.
              </p>
              <Link href="/login" className={`${btnPrimary} mt-3 w-full`}>
                Sign in / Create account
              </Link>
            </>
          )}
          {authError ? (
            <p className="mt-2 text-xs text-red-700" role="alert">{authError}</p>
          ) : null}
        </section>

        <div className="m-4 mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Database-backed app</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800">
            MySQL stores accounts, stations, EVs and reservations. MongoDB stores activity logs.
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {view === "dashboard" ? (
            <DashboardView
              stations={dashboardStations}
              stationsLoading={dashboardStationsLoading}
              stationsError={dashboardStationsError}
              reservations={apiReservations}
              liveCount={liveCount}
              nowMs={nowMs}
              historyLoading={historyLoading}
              historyError={historyError}
              onRetryStations={() => void loadDashboardStations()}
              onRetryHistory={() => void loadReservationHistory()}
              onReserve={openReserve}
              onNavigate={go}
            />
          ) : null}
          {view === "stations" ? (
            <StationsView onReserve={openReserve} />
          ) : null}
          {view === "evs" ? (
            <EvsView
              evs={evs}
              loading={evsLoading}
              loadError={evsError}
              authRequired={evsAuthRequired}
              onRetry={() => void loadEvs()}
              onSave={saveEv}
              onDelete={deleteEv}
            />
          ) : null}
          {view === "reservations" ? (
            <ReservationsView
              stations={bookingStations}
              vehicles={bookingVehicles}
              reservations={apiReservations}
              form={form}
              nowMs={nowMs}
              formFeedback={formFeedback}
              historyFeedback={historyFeedback}
              optionsLoading={bookingOptionsLoading}
              optionsError={bookingOptionsError}
              historyLoading={historyLoading}
              historyError={historyError}
              submitting={submitting}
              cancellingId={cancellingId}
              onStationChange={handleStationChange}
              onPointChange={handlePointChange}
              onTariffChange={handleTariffChange}
              onFieldChange={updateForm}
              onQuickFill={handleQuickFill}
              onSubmit={submitReservation}
              onCancel={cancelReservation}
              onRetryOptions={() => void loadBookingOptions()}
              onRetryHistory={() => void loadReservationHistory()}
            />
          ) : null}
          {view === "activity" ? <ActivityView /> : null}
          {view === "admin" ? (
            <AdminView />
          ) : null}

          <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            VoltReserve · Smart EV Charging Station Reservation System · MySQL-backed reservations
          </footer>
        </div>
      </main>
    </div>
  );
}