import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getMongoDb } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("session")?.value;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 }
    );
  }

  const user = await verifySession(token);

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired session." },
      { status: 401 }
    );
  }

  try {
    const db = await getMongoDb();
    // Customers can see only their own activity. Administrators can inspect
    // the full audit stream for the application.
    const filter = user.role === "admin" ? {} : { userId: user.userId };

    const logs = await db
      .collection("activity_logs")
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    const data = logs.map((log) => ({
      id: log._id.toString(),
      action: log.action,
      userId: log.userId,
      entityType: log.entityType,
      entityId: log.entityId,
      timestamp:
        log.timestamp instanceof Date
          ? log.timestamp.toISOString()
          : log.timestamp ?? null,
      metadata: log.metadata ?? {},
    }));

    return NextResponse.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Activity logs API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Could not retrieve activity logs. Check MongoDB configuration and Atlas access.",
      },
      { status: 503 }
    );
  }
}
