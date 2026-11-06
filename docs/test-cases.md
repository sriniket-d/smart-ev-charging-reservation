# Test Cases and Verification Status

This matrix records the manual checks demonstrated during local verification on 6 November 2026. Pending and partial results remain explicitly identified; do not treat them as passed without further evidence.

## Previously executed manual checks

| ID | Scenario | Expected result | Status / evidence |
|---|---|---|---|
| EV-01 | Register a valid EV | New row saved for signed-in owner | Passed manually; MySQL row verified |
| EV-02 | Edit an owned EV | Updated model/capacity saved | Passed manually; MySQL row verified |
| EV-03 | Register a duplicate vehicle number | API rejects duplicate with conflict response | Passed manually |
| EV-04 | Delete EV referenced by reservation history | API rejects deletion; historical EV remains | Passed manually; reservation join verified |
| EV-05 | Delete an EV without reservation history | EV row is removed | Passed manually; zero rows remained |
| EV-06 | Request EV list without a session | API returns 401 | Passed manually |
| EV-07 | Another customer edits an EV they do not own | API returns not found and original row is unchanged | Passed manually |
| RES-01 | Create a valid reservation | Reservation is stored in MySQL | Passed manually; reservation created |
| RES-02 | Cancel an eligible reservation | Reservation status becomes Cancelled and activity event is recorded | Passed manually for an earlier test reservation |
| AUTH-01 | Sign in successfully | User reaches the main dashboard | Passed manually |

Retain screenshots or SQL query output for these checks in the final submission.

## Tests required after the activity/payment/admin changes

| ID | Scenario | Expected result | Status |
|---|---|---|---|
| AUTH-02 | Register a new customer | Registration succeeds and the UI shows the success state | Pending re-check |
| AUTH-03 | Sign out from the main application sidebar | Session cookie is cleared and the user is returned to the sign-in/create-account page | Passed manually; logout API returned HTTP 200 and redirected to `/login` |
| AUTH-04 | Change a user's MySQL role while an old session exists | Session endpoint clears the stale session; signing in again issues the updated role | Pending |
| AUTH-05 | Load the main application with no session | Sidebar offers Sign in / Create account; protected API calls remain unauthorized | Pending |
| ACT-01 | Call activity-log endpoint without a session | HTTP 401; no activity data returned | Pending |
| ACT-02 | Customer retrieves activity | Only that customer's events are returned | Passed manually; customer user ID 4 returned only user ID 4 events; console check `Only own activity: true` |
| ACT-03 | Admin retrieves activity | Recent application-wide events are returned | Passed manually; admin user ID 3 retrieved 11 events across user IDs 1, 3, 4 and 5 |
| ACT-04 | Successful login with MongoDB available | An `auth.login` document is inserted | Passed manually; Compass showed `auth.login` for user ID 3 in local `smart_ev.activity_logs` |
| ACT-05 | Login while MongoDB is unavailable | Login still succeeds; logging error is isolated | Passed manually; Atlas connection timed out, but login API returned HTTP 200 |
| ACT-06 | Admin creates, updates and deletes a station | Matching `station.created`, `station.updated` and `station.deleted` events are written | Partial; `station.updated` verified in local MongoDB after switching connection. `station.created` and `station.deleted` not yet rechecked locally |
| PAY-01 | Create a valid reservation | Reservation and Pending payment row are both inserted | Passed manually; reservation #14 and payment #4 verified in MySQL |
| PAY-02 | Force payment-row insertion to fail in a local test database | Reservation insert rolls back with the transaction | Pending |
| RES-03 | Submit an overlapping active booking for the same point | API rejects it with HTTP 409 | Passed manually; UI rejected the repeated 09:30–10:30 slot with the overlap error |
| SQL-01 | Run `db/advanced_queries.sql` after schema, seed, views, triggers and point-code migration | Safe DDL/DML demo runs; temporary test data is rolled back | User reported successful execution; trigger output and reservation indexes separately verified in Workbench |
| DB-01 | Apply point-code migration to an existing database | Existing points receive unique non-null `point_code` values | Passed manually; three existing points had codes and missing-code count was 0; unique index verified |
| ADMIN-01 | Customer calls `GET /api/admin/stations` | HTTP 403; no station-management data is returned | Passed manually; customer session received 403 in browser console |
| ADMIN-02 | Request admin station data without a session | HTTP 401 | Pending |
| ADMIN-03 | Admin creates a station with multiple charging points | Station, point codes and tariff are committed together in MySQL | Passed manually; `VoltReserve Test Station`, `TST-01` and `TST-02` appeared in Admin UI |
| ADMIN-04 | Admin edits station details and increases point count | Station and points are updated; new codes follow the original prefix | Passed manually; MySQL verified 80 kW, ₹16/kWh and `TST-01` through `TST-03` |
| ADMIN-05 | Admin reduces point count where removed points have reservation history | API rejects the update with HTTP 409; all existing records remain | Pending |
| ADMIN-06 | Admin deletes a station with reservation history | API rejects deletion with HTTP 409 | Passed manually; UI displayed the reservation-history protection error and retained the station |
| ADMIN-07 | Admin deletes a station with no reservation history | Points, tariff and station are removed in one transaction | Passed manually; UI confirmed successful deletion and station count decreased from 3 to 2 |
| ADMIN-08 | Admin submits duplicate point codes | API rejects the request with HTTP 409 and rolls back all inserts | Pending |

## Local setup for admin verification

1. For an existing database, run the migration once:

   ```powershell
   mysql -u YOUR_MYSQL_USER -p smart_ev_charging_test < db/migrations/20261106_add_charging_point_code.sql
   ```

   A fresh database created from the updated `db/schema.sql` already contains the column; the migration is safe to run again.

2. Register a test user through the application, then promote only that local test account to admin:

   ```sql
   UPDATE users
   SET role = 'admin'
   WHERE email = 'your-admin-test-email@example.com';
   ```

   Sign out and sign in again so the new role is included in the session cookie. Do not promote or modify a shared/production account.

3. Sign in with a separate customer account to verify the 403 response.

## Build checks

Run locally on the admin feature branch:

```powershell
npm run lint
npm run build
```

Verified locally on 6 November 2026: `npm run lint` returned without reported errors, and `npm run build` completed successfully, including TypeScript checks and route generation.

## Database verification queries

After testing a reservation, inspect the reservation and associated pending payment:

```sql
SELECT
    r.reservation_id,
    r.status AS reservation_status,
    p.payment_id,
    p.amount,
    p.payment_method,
    p.payment_status
FROM reservations AS r
LEFT JOIN payments AS p
    ON p.reservation_id = r.reservation_id
WHERE r.reservation_id = <RESERVATION_ID>;
```

Verify station and point-code persistence:

```sql
SELECT
    s.station_id,
    s.station_name,
    s.city,
    cp.point_id,
    cp.point_code,
    cp.connector_type,
    cp.power_kw,
    cp.status
FROM charging_stations AS s
LEFT JOIN charging_points AS cp
    ON cp.station_id = s.station_id
ORDER BY s.station_id, cp.point_id;
```

After testing MongoDB activity, inspect recent records:

```javascript
db.activity_logs.find().sort({ timestamp: -1 }).limit(20);
```

To verify customer data isolation, sign in as two different customers and call `GET /api/activity-logs` with each session. Compare returned `userId` values. An admin session should return the all-user audit stream.
