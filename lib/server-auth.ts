import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { verifySession, type SessionPayload } from "@/lib/auth";

type AccountRow = RowDataPacket & {
  user_id: number;
  name: string;
  email: string;
  role: string;
};

export type AuthenticatedUser = SessionPayload & {
  name: string;
  email: string;
};

export type AuthenticationResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; response: NextResponse };

function unauthorized(request: NextRequest, message: string): AuthenticationResult {
  const response = NextResponse.json(
    { success: false, message },
    { status: 401 }
  );

  if (request.cookies.get("session")) {
    response.cookies.set("session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }

  return { ok: false, response };
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticationResult> {
  const token = request.cookies.get("session")?.value;
  if (!token) {
    return unauthorized(request, "Authentication required.");
  }

  const session = await verifySession(token);
  if (!session) {
    return unauthorized(request, "Invalid or expired session.");
  }

  let rows: AccountRow[];
  try {
    [rows] = await pool.execute<AccountRow[]>(
      `SELECT user_id, name, email, role
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [session.userId]
    );
  } catch (error) {
    console.error("Authentication account lookup error:", error);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Could not verify account permissions." },
        { status: 500 }
      ),
    };
  }

  const account = rows[0];
  if (
    !account ||
    (account.role !== "customer" && account.role !== "admin") ||
    account.role !== session.role
  ) {
    return unauthorized(
      request,
      "Your session is no longer valid. Please sign in again."
    );
  }

  return {
    ok: true,
    user: {
      userId: account.user_id,
      name: account.name,
      email: account.email,
      role: account.role,
    },
  };
}

export function requireRole(
  user: AuthenticatedUser,
  role: SessionPayload["role"],
  message: string
): NextResponse | null {
  if (user.role === role) return null;

  return NextResponse.json(
    { success: false, message },
    { status: 403 }
  );
}
