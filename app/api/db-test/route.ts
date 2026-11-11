
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { verifySession } from "@/lib/auth";

type UserRow = RowDataPacket & {
  role: "customer" | "admin";
};

export async function GET(request: NextRequest) {
  const token = request.cookies.get("session")?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const session = await verifySession(token);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const [users] = await pool.execute<UserRow[]>(
      "SELECT role FROM users WHERE user_id = ? LIMIT 1",
      [session.userId]
    );

    if (!users[0] || users[0].role !== "admin" || users[0].role !== session.role) {
      return NextResponse.json(
        { success: false, message: "Administrator access required." },
        { status: 403 }
      );
    }

    await pool.query("SELECT 1");

    return NextResponse.json({
      success: true,
      message: "MySQL connection successful",
    });
  } catch (error) {
    console.error("MySQL connection error:", error);

    return NextResponse.json(
      { success: false, message: "MySQL connection failed" },
      { status: 500 }
    );
  }
}
