
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

type ExistingUser = RowDataPacket & {
  user_id: number;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";
    const address =
      typeof body.address === "string" ? body.address.trim() : null;

    if (!name || !email || !phone || !password) {
      return NextResponse.json(
        { error: "Name, email, phone, and password are required." },
        { status: 400 }
      );
    }

    if (name.length > 100 || email.length > 255 || phone.length > 20) {
      return NextResponse.json(
        { error: "One or more fields exceed the allowed length." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 72) {
      return NextResponse.json(
        { error: "Password must be between 8 and 72 characters." },
        { status: 400 }
      );
    }

    if (address && address.length > 255) {
      return NextResponse.json(
        { error: "Address must not exceed 255 characters." },
        { status: 400 }
      );
    }

    const [existingUsers] = await pool.execute<ExistingUser[]>(
      `SELECT user_id
       FROM users
       WHERE email = ? OR phone = ?
       LIMIT 1`,
      [email, phone]
    );

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: "An account with this email or phone already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO users (name, email, phone, password_hash, address, role)
       VALUES (?, ?, ?, ?, ?, 'customer')`,
      [name, email, phone, passwordHash, address]
    );

    return NextResponse.json(
      {
        message: "Registration successful.",
        user: {
          userId: result.insertId,
          name,
          email,
          phone,
          address,
          role: "customer",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // Unique database constraints also protect against simultaneous registrations.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    ) {
      return NextResponse.json(
        { error: "An account with this email or phone already exists." },
        { status: 409 }
      );
    }

    console.error("Registration error:", error);

    return NextResponse.json(
      { error: "Unable to register. Please try again." },
      { status: 500 }
    );
  }
}
