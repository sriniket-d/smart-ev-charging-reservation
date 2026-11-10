import pool from "@/lib/db";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";

type EvInput = {
  vehicleNumber: string;
  model: string;
  batteryCapacity: number;
  connectorType: "CCS2" | "Type 2";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function validateEvInput(body: Record<string, unknown> | null): EvInput | string {
  if (!body) return "A valid JSON request body is required.";

  const vehicleNumber =
    typeof body.vehicle_number === "string"
      ? body.vehicle_number.replace(/\s+/g, "").toUpperCase()
      : "";
  if (!/^[A-Z0-9-]{6,12}$/.test(vehicleNumber)) {
    return "Vehicle number must be 6 to 12 letters or digits (for example KA01AB1234).";
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model || model.length > 100) {
    return "Model is required and must be 100 characters or fewer.";
  }

  const batteryValue = body.battery_capacity;
  if (
    (typeof batteryValue !== "number" && typeof batteryValue !== "string") ||
    !/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(String(batteryValue).trim())
  ) {
    return "Battery capacity must be a positive number with at most two decimal places.";
  }
  const batteryCapacity = Number(batteryValue);
  if (!Number.isFinite(batteryCapacity) || batteryCapacity <= 0 || batteryCapacity > 250) {
    return "Battery capacity must be greater than 0 and no more than 250 kWh.";
  }

  if (body.connector_type !== "CCS2" && body.connector_type !== "Type 2") {
    return "Connector type must be CCS2 or Type 2.";
  }

  return {
    vehicleNumber,
    model,
    batteryCapacity,
    connectorType: body.connector_type,
  };
}

function parseEvId(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !/^\d+$/.test(value))
  ) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isDatabaseError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function duplicateVehicleNumber() {
  return NextResponse.json(
    { success: false, message: "A vehicle with this registration number already exists." },
    { status: 409 }
  );
}

export async function GET(request: NextRequest) {
  const authentication = await getAuthenticatedUser(request);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;

  try {
    const [vehicles] = await pool.query<RowDataPacket[]>(
      `SELECT ev_id, vehicle_number, model, battery_capacity, connector_type
       FROM evs
       WHERE user_id = ?
       ORDER BY ev_id`,
      [user.userId]
    );

    return NextResponse.json({ success: true, vehicles });
  } catch (error) {
    console.error("Fetch EVs API error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch vehicles." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authentication = await getAuthenticatedUser(request);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;

  try {
    const input = validateEvInput(await readBody(request));
    if (typeof input === "string") {
      return NextResponse.json({ success: false, message: input }, { status: 400 });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO evs (user_id, vehicle_number, model, battery_capacity, connector_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        user.userId,
        input.vehicleNumber,
        input.model,
        input.batteryCapacity,
        input.connectorType,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        message: "Vehicle added successfully.",
        ev_id: result.insertId,
      },
      { status: 201 }
    );
  } catch (error) {
    if (isDatabaseError(error, "ER_DUP_ENTRY")) return duplicateVehicleNumber();
    console.error("Create EV API error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to add vehicle." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authentication = await getAuthenticatedUser(request);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;

  try {
    const body = await readBody(request);
    const evId = parseEvId(body?.ev_id);
    if (evId === null) {
      return NextResponse.json(
        { success: false, message: "A valid ev_id is required." },
        { status: 400 }
      );
    }

    const input = validateEvInput(body);
    if (typeof input === "string") {
      return NextResponse.json({ success: false, message: input }, { status: 400 });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE evs
       SET vehicle_number = ?, model = ?, battery_capacity = ?, connector_type = ?
       WHERE ev_id = ? AND user_id = ?`,
      [
        input.vehicleNumber,
        input.model,
        input.batteryCapacity,
        input.connectorType,
        evId,
        user.userId,
      ]
    );

    if (result.affectedRows === 0) {
      const [vehicles] = await pool.query<RowDataPacket[]>(
        "SELECT ev_id FROM evs WHERE ev_id = ? AND user_id = ?",
        [evId, user.userId]
      );
      if (vehicles.length === 0) {
        return NextResponse.json(
          { success: false, message: "Vehicle not found for the authenticated user." },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ success: true, message: "Vehicle updated successfully." });
  } catch (error) {
    if (isDatabaseError(error, "ER_DUP_ENTRY")) return duplicateVehicleNumber();
    console.error("Update EV API error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update vehicle." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const authentication = await getAuthenticatedUser(request);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;

  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    const body = await readBody(request);
    const evId = parseEvId(body?.ev_id);
    if (evId === null) {
      return NextResponse.json(
        { success: false, message: "A valid ev_id is required." },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [vehicles] = await connection.query<RowDataPacket[]>(
      "SELECT ev_id FROM evs WHERE ev_id = ? AND user_id = ? FOR UPDATE",
      [evId, user.userId]
    );
    if (vehicles.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        { success: false, message: "Vehicle not found for the authenticated user." },
        { status: 404 }
      );
    }

    const [reservations] = await connection.query<RowDataPacket[]>(
      "SELECT reservation_id FROM reservations WHERE ev_id = ? LIMIT 1",
      [evId]
    );
    if (reservations.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        {
          success: false,
          message: "This vehicle cannot be deleted because reservation history references it.",
        },
        { status: 409 }
      );
    }

    await connection.execute(
      "DELETE FROM evs WHERE ev_id = ? AND user_id = ?",
      [evId, user.userId]
    );
    await connection.commit();
    transactionStarted = false;

    return NextResponse.json({ success: true, message: "Vehicle deleted successfully." });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("EV deletion rollback failed:", rollbackError);
      }
    }
    if (isDatabaseError(error, "ER_ROW_IS_REFERENCED_2")) {
      return NextResponse.json(
        {
          success: false,
          message: "This vehicle cannot be deleted because reservation history references it.",
        },
        { status: 409 }
      );
    }
    console.error("Delete EV API error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete vehicle." },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}
