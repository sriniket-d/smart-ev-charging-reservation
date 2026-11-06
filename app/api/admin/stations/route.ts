import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import pool from "@/lib/db";
import { verifySession } from "@/lib/auth";
import { logActivity } from "@/lib/mongodb";

type StationInput = {
  stationName: string;
  location: string;
  city: string;
  connectorType: "CCS2" | "Type 2";
  powerKW: number;
  ratePerKWh: number;
  pointCount: number;
  pointCodePrefix: string;
};

type StationRow = RowDataPacket & {
  station_id: number;
  station_name: string;
  location: string;
  city: string;
};

type PointRow = RowDataPacket & {
  point_id: number;
  station_id: number;
  point_code: string;
  connector_type: string;
  power_kw: number | string;
  status: string;
};

type TariffRow = RowDataPacket & {
  tariff_id: number;
  station_id: number;
  rate_per_kwh: number | string;
};

type ActiveCountRow = RowDataPacket & {
  station_id: number;
  active_reservations: number | string;
};

type ReservationReferenceRow = RowDataPacket & {
  reservation_id: number;
  point_id: number;
};

async function getSession(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  return token ? verifySession(token) : null;
}

function adminRequired(status: 401 | 403, message: string) {
  return NextResponse.json({ success: false, message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function parseId(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !/^\d+$/.test(value))
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDecimal(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !/^\d+(?:\.\d{1,2})?$/.test(String(value).trim())
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateStationInput(body: Record<string, unknown> | null): StationInput | string {
  if (!body) return "A valid JSON request body is required.";

  const stationName =
    typeof body.station_name === "string" ? body.station_name.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const connectorType = body.connector_type;
  const powerKW = parseDecimal(body.power_kw);
  const ratePerKWh = parseDecimal(body.rate_per_kwh);
  const pointCount = parseId(body.point_count);
  const pointCodePrefix =
    typeof body.point_code_prefix === "string"
      ? body.point_code_prefix.trim().toUpperCase()
      : "";

  if (!stationName || stationName.length > 150) {
    return "Station name is required and must be 150 characters or fewer.";
  }
  if (!location || location.length > 255) {
    return "Location is required and must be 255 characters or fewer.";
  }
  if (!city || city.length > 100) {
    return "City is required and must be 100 characters or fewer.";
  }
  if (connectorType !== "CCS2" && connectorType !== "Type 2") {
    return "Connector type must be CCS2 or Type 2.";
  }
  if (powerKW === null || powerKW <= 0 || powerKW > 9999.99) {
    return "Power rating must be greater than 0 and at most 9999.99 kW, with up to two decimals.";
  }
  if (ratePerKWh === null || ratePerKWh < 0 || ratePerKWh > 999999.99) {
    return "Tariff must be between 0 and 999999.99, with up to two decimals.";
  }
  if (pointCount === null || pointCount < 1 || pointCount > 12) {
    return "Number of charging points must be between 1 and 12.";
  }
  if (!/^[A-Z0-9]{2,5}$/.test(pointCodePrefix)) {
    return "Charging-point prefix must contain 2 to 5 letters or digits.";
  }

  return {
    stationName,
    location,
    city,
    connectorType,
    powerKW,
    ratePerKWh,
    pointCount,
    pointCodePrefix,
  };
}

function isDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

async function writeActivity(
  action: "station.created" | "station.updated" | "station.deleted",
  userId: number,
  stationId: number,
  metadata?: Record<string, string | number | boolean | null>
) {
  try {
    await logActivity({
      action,
      userId,
      entityType: "station",
      entityId: stationId,
      metadata,
    });
  } catch (error) {
    // MySQL station changes remain successful if the audit store is unavailable.
    console.error("Failed to log station activity:", error);
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return adminRequired(401, "Authentication required.");
  if (session.role !== "admin") {
    return adminRequired(403, "Administrator access is required for station management.");
  }

  try {
    const [stationRows] = await pool.query<StationRow[]>(
      `SELECT station_id, station_name, location, city
       FROM charging_stations
       ORDER BY station_name, station_id`
    );
    const [pointRows] = await pool.query<PointRow[]>(
      `SELECT point_id, station_id, point_code, connector_type, power_kw, status
       FROM charging_points
       ORDER BY station_id, point_id`
    );
    const [tariffRows] = await pool.query<TariffRow[]>(
      `SELECT tariff_id, station_id, rate_per_kwh
       FROM tariff_plans
       ORDER BY station_id, tariff_id DESC`
    );
    const [activeRows] = await pool.query<ActiveCountRow[]>(
      `SELECT cp.station_id, COUNT(DISTINCT r.reservation_id) AS active_reservations
       FROM charging_points AS cp
       JOIN reservations AS r ON r.point_id = cp.point_id
       WHERE r.status IN ('Booked', 'Confirmed')
         AND r.end_time > CURRENT_TIMESTAMP
       GROUP BY cp.station_id`
    );

    const pointsByStation = new Map<number, PointRow[]>();
    for (const point of pointRows) {
      const points = pointsByStation.get(point.station_id) ?? [];
      points.push(point);
      pointsByStation.set(point.station_id, points);
    }

    const tariffByStation = new Map<number, TariffRow>();
    for (const tariff of tariffRows) {
      if (!tariffByStation.has(tariff.station_id)) {
        tariffByStation.set(tariff.station_id, tariff);
      }
    }

    const activeByStation = new Map(
      activeRows.map((row) => [row.station_id, Number(row.active_reservations)])
    );

    const data = stationRows.map((station) => {
      const points = pointsByStation.get(station.station_id) ?? [];
      const tariff = tariffByStation.get(station.station_id);
      const firstPoint = points[0];

      return {
        station_id: station.station_id,
        station_name: station.station_name,
        location: station.location,
        city: station.city,
        connector_type: firstPoint?.connector_type ?? "CCS2",
        power_kw: firstPoint ? Number(firstPoint.power_kw) : 0,
        rate_per_kwh: tariff ? Number(tariff.rate_per_kwh) : 0,
        point_count: points.length,
        point_ids: points.map((point) => point.point_code),
        points: points.map((point) => ({
          point_id: point.point_id,
          point_code: point.point_code,
          connector_type: point.connector_type,
          power_kw: Number(point.power_kw),
          status: point.status,
        })),
        active_reservations: activeByStation.get(station.station_id) ?? 0,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Admin stations GET error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load station management data." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return adminRequired(401, "Authentication required.");
  if (session.role !== "admin") {
    return adminRequired(403, "Administrator access is required to create stations.");
  }

  const input = validateStationInput(await readBody(request));
  if (typeof input === "string") {
    return NextResponse.json({ success: false, message: input }, { status: 400 });
  }

  let connection: PoolConnection | null = null;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [duplicates] = await connection.execute<StationRow[]>(
      `SELECT station_id, station_name, location, city
       FROM charging_stations
       WHERE LOWER(station_name) = LOWER(?)
       LIMIT 1
       FOR UPDATE`,
      [input.stationName]
    );
    if (duplicates.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        { success: false, message: `A station named "${input.stationName}" already exists.` },
        { status: 409 }
      );
    }

    const [stationResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO charging_stations (station_name, location, city)
       VALUES (?, ?, ?)`,
      [input.stationName, input.location, input.city]
    );
    const stationId = stationResult.insertId;

    for (let index = 1; index <= input.pointCount; index += 1) {
      const pointCode = `${input.pointCodePrefix}-${String(index).padStart(2, "0")}`;
      await connection.execute(
        `INSERT INTO charging_points
          (station_id, point_code, connector_type, power_kw, status)
         VALUES (?, ?, ?, ?, 'Available')`,
        [stationId, pointCode, input.connectorType, input.powerKW]
      );
    }

    await connection.execute(
      `INSERT INTO tariff_plans (station_id, rate_per_kwh)
       VALUES (?, ?)`,
      [stationId, input.ratePerKWh]
    );

    await connection.commit();
    transactionStarted = false;

    await writeActivity("station.created", session.userId, stationId, {
      stationName: input.stationName,
      pointCount: input.pointCount,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Station and charging points created successfully.",
        station_id: stationId,
      },
      { status: 201 }
    );
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Station create rollback failed:", rollbackError);
      }
    }
    if (isDuplicateError(error)) {
      return NextResponse.json(
        { success: false, message: "That station name or charging-point code is already in use." },
        { status: 409 }
      );
    }
    console.error("Admin stations POST error:", error);
    return NextResponse.json(
      { success: false, message: "Could not create the station. No partial changes were saved." },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return adminRequired(401, "Authentication required.");
  if (session.role !== "admin") {
    return adminRequired(403, "Administrator access is required to update stations.");
  }

  const body = await readBody(request);
  const stationId = parseId(body?.station_id);
  if (stationId === null) {
    return NextResponse.json(
      { success: false, message: "A valid station_id is required." },
      { status: 400 }
    );
  }

  const input = validateStationInput(body);
  if (typeof input === "string") {
    return NextResponse.json({ success: false, message: input }, { status: 400 });
  }

  let connection: PoolConnection | null = null;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [stationRows] = await connection.execute<StationRow[]>(
      `SELECT station_id, station_name, location, city
       FROM charging_stations
       WHERE station_id = ?
       FOR UPDATE`,
      [stationId]
    );

    if (stationRows.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        { success: false, message: "Station not found." },
        { status: 404 }
      );
    }

    const [duplicates] = await connection.execute<StationRow[]>(
      `SELECT station_id, station_name, location, city
       FROM charging_stations
       WHERE LOWER(station_name) = LOWER(?) AND station_id <> ?
       LIMIT 1
       FOR UPDATE`,
      [input.stationName, stationId]
    );
    if (duplicates.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        { success: false, message: `A station named "${input.stationName}" already exists.` },
        { status: 409 }
      );
    }

    const [pointRows] = await connection.execute<PointRow[]>(
      `SELECT point_id, station_id, point_code, connector_type, power_kw, status
       FROM charging_points
       WHERE station_id = ?
       ORDER BY point_id
       FOR UPDATE`,
      [stationId]
    );

    if (input.pointCount < pointRows.length) {
      const removedPoints = pointRows.slice(input.pointCount);
      const removedIds = removedPoints.map((point) => point.point_id);
      if (removedIds.length > 0) {
        const placeholders = removedIds.map(() => "?").join(", ");
        const [references] = await connection.query<ReservationReferenceRow[]>(
          `SELECT reservation_id, point_id
           FROM reservations
           WHERE point_id IN (${placeholders})
           LIMIT 1
           FOR UPDATE`,
          removedIds
        );

        if (references.length > 0) {
          await connection.rollback();
          transactionStarted = false;
          return NextResponse.json(
            {
              success: false,
              message: "A charging point selected for removal has reservation history. Reduce the point count only after choosing a station without referenced points.",
            },
            { status: 409 }
          );
        }

        await connection.query(
          `DELETE FROM charging_points
           WHERE point_id IN (${placeholders}) AND station_id = ?`,
          [...removedIds, stationId]
        );
      }
    }

    const currentPrefix =
      pointRows[0]?.point_code?.split("-")[0] || input.pointCodePrefix;
    const targetPrefix = pointRows.length > 0 ? currentPrefix : input.pointCodePrefix;

    if (input.pointCount > pointRows.length) {
      for (let index = pointRows.length + 1; index <= input.pointCount; index += 1) {
        const pointCode = `${targetPrefix}-${String(index).padStart(2, "0")}`;
        await connection.execute(
          `INSERT INTO charging_points
            (station_id, point_code, connector_type, power_kw, status)
           VALUES (?, ?, ?, ?, 'Available')`,
          [stationId, pointCode, input.connectorType, input.powerKW]
        );
      }
    }

    await connection.execute(
      `UPDATE charging_stations
       SET station_name = ?, location = ?, city = ?
       WHERE station_id = ?`,
      [input.stationName, input.location, input.city, stationId]
    );

    await connection.execute(
      `UPDATE charging_points
       SET connector_type = ?, power_kw = ?
       WHERE station_id = ?`,
      [input.connectorType, input.powerKW, stationId]
    );

    const [tariffs] = await connection.execute<TariffRow[]>(
      `SELECT tariff_id
       FROM tariff_plans
       WHERE station_id = ?
       ORDER BY tariff_id
       FOR UPDATE`,
      [stationId]
    );

    if (tariffs.length === 0) {
      await connection.execute(
        `INSERT INTO tariff_plans (station_id, rate_per_kwh)
         VALUES (?, ?)`,
        [stationId, input.ratePerKWh]
      );
    } else {
      await connection.execute(
        `UPDATE tariff_plans
         SET rate_per_kwh = ?
         WHERE station_id = ?`,
        [input.ratePerKWh, stationId]
      );
    }

    await connection.commit();
    transactionStarted = false;

    await writeActivity("station.updated", session.userId, stationId, {
      stationName: input.stationName,
      pointCount: input.pointCount,
    });

    return NextResponse.json({
      success: true,
      message: "Station and charging-point details updated successfully.",
      station_id: stationId,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Station update rollback failed:", rollbackError);
      }
    }
    if (isDuplicateError(error)) {
      return NextResponse.json(
        { success: false, message: "A charging-point code is already assigned to another station." },
        { status: 409 }
      );
    }
    console.error("Admin stations PATCH error:", error);
    return NextResponse.json(
      { success: false, message: "Could not update the station. No partial changes were saved." },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return adminRequired(401, "Authentication required.");
  if (session.role !== "admin") {
    return adminRequired(403, "Administrator access is required to delete stations.");
  }

  const body = await readBody(request);
  const stationId = parseId(body?.station_id);
  if (stationId === null) {
    return NextResponse.json(
      { success: false, message: "A valid station_id is required." },
      { status: 400 }
    );
  }

  let connection: PoolConnection | null = null;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [stationRows] = await connection.execute<StationRow[]>(
      `SELECT station_id, station_name
       FROM charging_stations
       WHERE station_id = ?
       FOR UPDATE`,
      [stationId]
    );

    if (stationRows.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        { success: false, message: "Station not found." },
        { status: 404 }
      );
    }

    const [pointRows] = await connection.execute<PointRow[]>(
      `SELECT point_id
       FROM charging_points
       WHERE station_id = ?
       ORDER BY point_id
       FOR UPDATE`,
      [stationId]
    );
    const pointIds = pointRows.map((point) => point.point_id);

    if (pointIds.length > 0) {
      const placeholders = pointIds.map(() => "?").join(", ");
      const [references] = await connection.query<ReservationReferenceRow[]>(
        `SELECT reservation_id, point_id
         FROM reservations
         WHERE point_id IN (${placeholders})
         LIMIT 1
         FOR UPDATE`,
        pointIds
      );

      if (references.length > 0) {
        await connection.rollback();
        transactionStarted = false;
        return NextResponse.json(
          {
            success: false,
            message: "This station cannot be deleted because one or more charging points have reservation history.",
          },
          { status: 409 }
        );
      }

      await connection.query(
        `DELETE FROM charging_points
         WHERE station_id = ?`,
        [stationId]
      );
    }

    await connection.execute(
      `DELETE FROM tariff_plans
       WHERE station_id = ?`,
      [stationId]
    );
    await connection.execute(
      `DELETE FROM charging_stations
       WHERE station_id = ?`,
      [stationId]
    );

    await connection.commit();
    transactionStarted = false;

    await writeActivity("station.deleted", session.userId, stationId, {
      stationName: stationRows[0].station_name,
    });

    return NextResponse.json({
      success: true,
      message: "Station and its unreserved charging points deleted successfully.",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Station deletion rollback failed:", rollbackError);
      }
    }
    console.error("Admin stations DELETE error:", error);
    const hasReferenceError =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_ROW_IS_REFERENCED_2";
    return NextResponse.json(
      {
        success: false,
        message: hasReferenceError
          ? "The station still has related records and cannot be deleted."
          : "Could not delete the station because of a database error.",
      },
      { status: hasReferenceError ? 409 : 500 }
    );
  } finally {
    connection?.release();
  }
}
