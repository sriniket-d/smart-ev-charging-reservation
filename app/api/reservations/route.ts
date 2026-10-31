
import { verifySession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

async function getAuthenticatedUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;

  if (!token) {
    return null;
  }

  return verifySession(token);
}

// GET: Customers can view their own reservations; admins can view all.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    const query = `
      SELECT
        r.reservation_id,
        r.user_id,
        r.start_time,
        r.end_time,
        r.status,
        u.name AS user_name,
        e.model AS ev_model,
        e.vehicle_number,
        cp.point_id,
        cp.connector_type,
        cp.power_kw,
        cs.station_name,
        cs.location,
        cs.city
      FROM reservations r
      JOIN users u ON r.user_id = u.user_id
      JOIN evs e ON r.ev_id = e.ev_id
      JOIN charging_points cp ON r.point_id = cp.point_id
      JOIN charging_stations cs ON cp.station_id = cs.station_id
      ${user.role === "admin" ? "" : "WHERE r.user_id = ?"}
      ORDER BY r.start_time ASC
    `;

    const [rows] =
      user.role === "admin"
        ? await pool.query(query)
        : await pool.query(query, [user.userId]);

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Reservations API error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}

// POST: Create a reservation for the authenticated user.
export async function POST(request: NextRequest) {
  let connection;
  let transactionStarted = false;

  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { ev_id, point_id, tariff_id, start_time, end_time } = body;

    if (
      !Number.isInteger(ev_id) ||
      !Number.isInteger(point_id) ||
      !Number.isInteger(tariff_id) ||
      typeof start_time !== "string" ||
      typeof end_time !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing reservation fields" },
        { status: 400 }
      );
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return NextResponse.json(
        { success: false, message: "End time must be after start time" },
        { status: 400 }
      );
    }

    if (start <= new Date()) {
      return NextResponse.json(
        { success: false, message: "Reservation must be in the future" },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    // Lock the charging point while validating and creating the reservation.
    const [points] = await connection.query(
      `SELECT station_id, status
       FROM charging_points
       WHERE point_id = ?
       FOR UPDATE`,
      [point_id]
    );

    const pointRows = points as {
      station_id: number;
      status: string;
    }[];

    if (pointRows.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return NextResponse.json(
        { success: false, message: "Charging point not found" },
        { status: 404 }
      );
    }

    if (pointRows[0].status !== "Available") {
      await connection.rollback();
      transactionStarted = false;

      return NextResponse.json(
        { success: false, message: "Charging point is not available" },
        { status: 409 }
      );
    }

    const [tariffs] = await connection.query(
      `SELECT tariff_id
       FROM tariff_plans
       WHERE tariff_id = ? AND station_id = ?`,
      [tariff_id, pointRows[0].station_id]
    );

    if ((tariffs as unknown[]).length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return NextResponse.json(
        {
          success: false,
          message: "Tariff does not belong to the selected station",
        },
        { status: 400 }
      );
    }

    // Never trust a user_id supplied by the browser.
    const [vehicles] = await connection.query(
      "SELECT ev_id FROM evs WHERE ev_id = ? AND user_id = ?",
      [ev_id, user.userId]
    );

    if ((vehicles as unknown[]).length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return NextResponse.json(
        {
          success: false,
          message: "Vehicle not found for the authenticated user",
        },
        { status: 403 }
      );
    }

    // Reject overlapping active reservations for the same charging point.
    const [conflicts] = await connection.query(
      `SELECT reservation_id
       FROM reservations
       WHERE point_id = ?
         AND status IN ('Booked', 'Confirmed')
         AND start_time < ?
         AND end_time > ?
       LIMIT 1
       FOR UPDATE`,
      [point_id, end, start]
    );

    if ((conflicts as unknown[]).length > 0) {
      await connection.rollback();
      transactionStarted = false;

      return NextResponse.json(
        {
          success: false,
          message: "Charging point is already reserved for that time slot",
        },
        { status: 409 }
      );
    }

    const [result] = await connection.query(
      `INSERT INTO reservations
        (user_id, ev_id, point_id, tariff_id, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Booked')`,
      [user.userId, ev_id, point_id, tariff_id, start, end]
    );

    const insertResult = result as { insertId: number };

    await connection.commit();
    transactionStarted = false;

    return NextResponse.json(
      {
        success: true,
        message: "Reservation created successfully",
        reservation_id: insertResult.insertId,
      },
      { status: 201 }
    );
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Reservation rollback failed:", rollbackError);
      }
    }

    console.error("Create reservation API error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create reservation" },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}

// DELETE: A customer can cancel only their own active reservation.
export async function DELETE(request: NextRequest) {
  let connection;
  let transactionStarted = false;

  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { reservation_id } = body;

    if (!Number.isInteger(reservation_id)) {
      return NextResponse.json(
        { success: false, message: "Valid reservation_id is required" },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.query(
      `SELECT reservation_id, status
       FROM reservations
       WHERE reservation_id = ? AND user_id = ?
       FOR UPDATE`,
      [reservation_id, user.userId]
    );

    const reservations = rows as {
      reservation_id: number;
      status: string;
    }[];

    if (reservations.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return NextResponse.json(
        { success: false, message: "Reservation not found for this user" },
        { status: 404 }
      );
    }

    if (!["Booked", "Confirmed"].includes(reservations[0].status)) {
      await connection.rollback();
      transactionStarted = false;

      return NextResponse.json(
        { success: false, message: "This reservation cannot be cancelled" },
        { status: 409 }
      );
    }

    await connection.query(
      `UPDATE reservations
       SET status = 'Cancelled'
       WHERE reservation_id = ? AND user_id = ?`,
      [reservation_id, user.userId]
    );

    await connection.commit();
    transactionStarted = false;

    return NextResponse.json({
      success: true,
      message: "Reservation cancelled successfully",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Cancellation rollback failed:", rollbackError);
      }
    }

    console.error("Cancel reservation API error:", error);

    return NextResponse.json(
      { success: false, message: "Failed to cancel reservation" },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}
