import { NextResponse } from "next/server";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Signed out successfully.",
  });

  clearSessionCookie(response);
  return response;
}
