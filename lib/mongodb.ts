
import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

async function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing from .env.local");
  }

  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      family: 4,
    });

    globalForMongo.mongoClientPromise = client.connect().catch((error) => {
      globalForMongo.mongoClientPromise = undefined;
      throw error;
    });
  }

  return globalForMongo.mongoClientPromise;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || "smart_ev");
}

export type ActivityAction =
  | "reservation.created"
  | "reservation.cancelled";

export interface ActivityInput {
  action: ActivityAction;
  userId: number;
  entityType: "reservation";
  entityId: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export async function logActivity(input: ActivityInput): Promise<void> {
  const db = await getMongoDb();
  const collection = db.collection("activity_logs");

  await collection.createIndex(
    { timestamp: -1 },
    { name: "idx_activity_logs_timestamp" }
  );

  await collection.createIndex(
    { action: 1, timestamp: -1 },
    { name: "idx_activity_logs_action_timestamp" }
  );

  await collection.insertOne({
    ...input,
    timestamp: new Date(),
  });
}
