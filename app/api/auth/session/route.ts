import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const authentication = await getAuthenticatedUser(request);
  if (!authentication.ok) return authentication.response;
  const user = authentication.user;

  return NextResponse.json({
    success: true,
    user: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}
