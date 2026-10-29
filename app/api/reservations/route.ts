import { logActivity } from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const [rows] = await pool.query(`
      SELECT
        r.reservation_id,
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
      ORDER BY r.start_time ASC
    `);

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Reservations API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch reservations",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let connection;

  try {
    const body = await request.json();

    const { user_id, ev_id, point_id, tariff_id, start_time, end_time } = body;

    if (
      !Number.isInteger(user_id) ||
      !Number.isInteger(ev_id) ||
      !Number.isInteger(point_id) ||
      !Number.isInteger(tariff_id) ||
      typeof start_time !== "string" ||
      typeof end_time !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or missing reservation fields",
        },
        { status: 400 },
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
        {
          success: false,
          message: "End time must be after start time",
        },
        { status: 400 },
      );
    }

    if (start <= new Date()) {
      return NextResponse.json(
        {
          success: false,
          message: "Reservation must be in the future",
        },
        { status: 400 },
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [points] = await connection.query(
      `SELECT station_id, status
       FROM charging_points
       WHERE point_id = ?
       FOR UPDATE`,
      [point_id],
    );

    const pointRows = points as {
      station_id: number;
      status: string;
    }[];

    if (pointRows.length === 0) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message: "Charging point not found",
        },
        { status: 404 },
      );
    }

    if (pointRows[0].status !== "Available") {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message: "Charging point is not available",
        },
        { status: 409 },
      );
    }

    const [tariffs] = await connection.query(
      `SELECT tariff_id
       FROM tariff_plans
       WHERE tariff_id = ? AND station_id = ?`,
      [tariff_id, pointRows[0].station_id],
    );

    if ((tariffs as unknown[]).length === 0) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message: "Tariff does not belong to the selected station",
        },
        { status: 400 },
      );
    }

    const [users] = await connection.query(
      "SELECT user_id FROM users WHERE user_id = ?",
      [user_id],
    );

    if ((users as unknown[]).length === 0) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404 },
      );
    }

    const [vehicles] = await connection.query(
      "SELECT ev_id FROM evs WHERE ev_id = ? AND user_id = ?",
      [ev_id, user_id],
    );

    if ((vehicles as unknown[]).length === 0) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message: "Vehicle not found for this user",
        },
        { status: 400 },
      );
    }

    const [conflicts] = await connection.query(
      `SELECT reservation_id
       FROM reservations
       WHERE point_id = ?
         AND status IN ('Booked', 'Confirmed')
         AND start_time < ?
         AND end_time > ?
       LIMIT 1
       FOR UPDATE`,
      [point_id, end, start],
    );

    if ((conflicts as unknown[]).length > 0) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message: "Charging point is already reserved for that time slot",
        },
        { status: 409 },
      );
    }

    const [result] = await connection.query(
      `INSERT INTO reservations
        (user_id, ev_id, point_id, tariff_id, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Booked')`,
      [user_id, ev_id, point_id, tariff_id, start, end],
    );

    await connection.commit();

    const insertResult = result as { insertId: number };

    try {
      await logActivity({
        action: "reservation.created",
        userId: user_id,
        entityType: "reservation",
        entityId: insertResult.insertId,
        metadata: {
          pointId: point_id,
          evId: ev_id,
          tariffId: tariff_id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
      });
    } catch (activityError) {
      console.error(
        "Reservation saved in MySQL, but MongoDB logging failed:",
        activityError,
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Reservation created successfully",
        reservation_id: insertResult.insertId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Create reservation API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to create reservation",
      },
      { status: 500 },
    );
  } finally {
    connection?.release();
  }
}

export async function DELETE(request: NextRequest) {
  let connection;

  try {
    const body = await request.json();
    const { reservation_id, user_id } = body;

    if (!Number.isInteger(reservation_id) || !Number.isInteger(user_id)) {
      return NextResponse.json(
        {
          success: false,
          message: "Valid reservation_id and user_id are required",
        },
        { status: 400 },
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT reservation_id, status
       FROM reservations
       WHERE reservation_id = ? AND user_id = ?
       FOR UPDATE`,
      [reservation_id, user_id],
    );

    const reservations = rows as {
      reservation_id: number;
      status: string;
    }[];

    if (reservations.length === 0) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message: "Reservation not found for this user",
        },
        { status: 404 },
      );
    }

    if (!["Booked", "Confirmed"].includes(reservations[0].status)) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message: "This reservation cannot be cancelled",
        },
        { status: 409 },
      );
    }

    await connection.query(
      `UPDATE reservations
       SET status = 'Cancelled'
       WHERE reservation_id = ? AND user_id = ?`,
      [reservation_id, user_id],
    );

    await connection.commit();

    try {
      await logActivity({
        action: "reservation.cancelled",
        userId: user_id,
        entityType: "reservation",
        entityId: reservation_id,
      });
    } catch (activityError) {
      console.error(
        "Reservation cancelled in MySQL, but MongoDB logging failed:",
        activityError,
      );
    }

    return NextResponse.json({
      success: true,
      message: "Reservation cancelled successfully",
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Cancel reservation API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to cancel reservation",
      },
      { status: 500 },
    );
  } finally {
    connection?.release();
  }
}
