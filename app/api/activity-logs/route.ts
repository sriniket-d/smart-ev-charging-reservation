
import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

export async function GET() {
  try {
    const db = await getMongoDb();

    const logs = await db
      .collection("activity_logs")
      .find({})
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
          : log.timestamp,
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
