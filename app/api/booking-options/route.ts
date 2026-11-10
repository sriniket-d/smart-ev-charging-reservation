
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  // Keep request-dependent authentication outside the catch so Next.js can
  // handle the Route Handler's dynamic rendering boundary.
  const authentication = await getAuthenticatedUser(request);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;

  try {
    const [vehicles] = await pool.query(
      `SELECT ev_id, user_id, vehicle_number, model, connector_type
       FROM evs
       WHERE user_id = ?
       ORDER BY ev_id`,
      [user.userId]
    );

    const [chargingPoints] = await pool.query(`
      SELECT
        cp.point_id,
        cp.station_id,
        cp.connector_type,
        cp.power_kw,
        cp.status,
        cs.station_name,
        cs.location,
        cs.city,
        tp.tariff_id,
        tp.rate_per_kwh
      FROM charging_points cp
      JOIN charging_stations cs
        ON cp.station_id = cs.station_id
      JOIN tariff_plans tp
        ON cp.station_id = tp.station_id
      WHERE cp.status = 'Available'
      ORDER BY cp.point_id
    `);

    return NextResponse.json({
      success: true,
      vehicles,
      chargingPoints,
    });
  } catch (error) {
    console.error("Booking options API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to load booking options",
      },
      { status: 500 }
    );
  }
}
