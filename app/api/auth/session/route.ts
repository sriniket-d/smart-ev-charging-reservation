import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { verifySession } from "@/lib/auth";

type UserRow = RowDataPacket & {
  user_id: number;
  name: string;
  email: string;
  role: "customer" | "admin";
};

function unauthorized(message: string) {
  const response = NextResponse.json(
    { success: false, message },
    { status: 401 }
  );

  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("session")?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "You are not signed in." },
      { status: 401 }
    );
  }

  const session = await verifySession(token);
  if (!session) {
    return unauthorized("Your session has expired. Please sign in again.");
  }

  try {
    const [rows] = await pool.execute<UserRow[]>(
      `SELECT user_id, name, email, role
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [session.userId]
    );

    const user = rows[0];
    if (!user) {
      return unauthorized("This account no longer exists. Please sign in again.");
    }

    // The database role is authoritative. A role change invalidates the old
    // JWT so that the user must authenticate again with the updated role.
    if (user.role !== session.role) {
      return unauthorized("Your account permissions changed. Please sign in again.");
    }

    return NextResponse.json({
      success: true,
      user: {
        userId: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Session lookup error:", error);
    return NextResponse.json(
      { success: false, message: "Could not retrieve account details." },
      { status: 500 }
    );
  }
}
