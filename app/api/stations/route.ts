import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  try {
    const [rows] = await pool.query(
      `SELECT
        cs.station_id,
        cs.station_name,
        cs.location,
        cs.city,
        cs.latitude,
        cs.longitude,
        COALESCE(point_summary.total_points, 0) AS total_points,
        COALESCE(point_summary.available_points, 0) AS available_points,
        point_summary.connector_types,
        point_summary.min_power_kw,
        point_summary.max_power_kw,
        tariff_summary.min_rate_per_kwh,
        tariff_summary.max_rate_per_kwh
      FROM charging_stations AS cs
      LEFT JOIN (
        SELECT
          station_id,
          COUNT(*) AS total_points,
          SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) AS available_points,
          GROUP_CONCAT(DISTINCT connector_type ORDER BY connector_type SEPARATOR ',') AS connector_types,
          MIN(power_kw) AS min_power_kw,
          MAX(power_kw) AS max_power_kw
        FROM charging_points
        GROUP BY station_id
      ) AS point_summary
        ON point_summary.station_id = cs.station_id
      LEFT JOIN (
        SELECT
          station_id,
          MIN(rate_per_kwh) AS min_rate_per_kwh,
          MAX(rate_per_kwh) AS max_rate_per_kwh
        FROM tariff_plans
        GROUP BY station_id
      ) AS tariff_summary
        ON tariff_summary.station_id = cs.station_id
      ORDER BY cs.station_name`
    );

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Charging stations API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch charging stations",
      },
      { status: 500 }
    );
  }
}