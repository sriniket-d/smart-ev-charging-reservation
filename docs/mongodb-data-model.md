# MongoDB Activity-Log Data Model

## Why MongoDB?

MySQL stores the application's normalized operational data. MongoDB is used for append-oriented activity events whose metadata may differ by action. This makes MongoDB a functional second database paradigm rather than an unused connection.

## Collection

Database: `MONGODB_DB` (defaults to `smart_ev`)

Collection: `activity_logs`

Example login document:

```json
{
  "_id": "ObjectId(...)",
  "action": "auth.login",
  "userId": 12,
  "entityType": "user",
  "entityId": 12,
  "metadata": {
    "role": "customer"
  },
  "timestamp": "2026-11-05T10:30:00.000Z"
}
```

Example reservation event:

```json
{
  "_id": "ObjectId(...)",
  "action": "reservation.created",
  "userId": 12,
  "entityType": "reservation",
  "entityId": 45,
  "metadata": {
    "pointId": 3,
    "evId": 8,
    "tariffId": 2
  },
  "timestamp": "2026-11-05T10:35:00.000Z"
}
```

Current actions are `auth.login`, `reservation.created`, `reservation.cancelled`, `station.created`, `station.updated` and `station.deleted`. Passwords, session tokens and other authentication secrets must never be written to activity metadata. (Station action metadata contains the station name and point count only.) Passwords, session tokens and other authentication secrets must never be written to activity metadata.

## Indexes

The server-side logger ensures these indexes exist:

| Index | Purpose |
|---|---|
| `timestamp: -1` | Fast newest-first event listing |
| `userId: 1, timestamp: -1` | Fast customer-specific newest-first history |
| `action: 1, timestamp: -1` | Filtering or aggregating events by action over time |

## Retrieval strategy

`GET /api/activity-logs` requires a valid signed session:

- Customer: query only documents whose `userId` equals the authenticated session's user ID.
- Admin: query the full collection.
- Both views sort newest first and return at most 50 documents.

The Activity screen displays the returned data. It does not query MongoDB directly from the browser.

## Aggregation

Run `db/mongodb_activity_aggregation.js` in `mongosh` after activity documents exist. The pipeline groups the event stream by `action` and counts events per action. It demonstrates MongoDB's `$group`, `$project` and `$sort` stages.

## Failure handling

MongoDB activity writes are best-effort. A MongoDB outage is logged on the server but does not roll back a MySQL reservation or prevent a valid login. MySQL remains authoritative for the corresponding business operation.
