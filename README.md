# Smart EV Charging Station Reservation System

A DBMS Experiential Learning Level 3 project by Sriniket Deeduvanu and Surya R Naik. It uses Next.js for the web interface and API layer, MySQL for relational booking data, and MongoDB for activity events.

## Implemented functionality

- Customer registration and login using bcrypt password hashes and signed server-managed sessions, with in-app account details and logout.
- My EV: authenticated, MySQL-backed vehicle listing, registration, editing and deletion.
- EV validation, duplicate registration protection, owner-scoped updates and deletion protection for vehicles referenced by reservation history.
- MySQL-backed booking options and reservation history.
- Reservation creation and cancellation with server-side ownership and time validation.
- Charging-point locking and overlapping active-reservation checks.
- A pending payment record is inserted in the same MySQL transaction as a new reservation. Its amount is initialized to zero until a simulated charging session finalizes it; no real payment gateway is integrated.
- MongoDB activity events for successful login, reservation creation/cancellation, and station creation/update/deletion.
- Authenticated activity-log retrieval and an Activity screen. Customers see their own events; administrators can inspect the full audit stream.
- Admin-only MySQL station and charging-point management with unique human-readable point codes and reservation-history protection.
- An advanced SQL demonstration script, a reservation-details view, overlap-prevention triggers and reservation indexes.

## Technology stack

- Next.js App Router, React, TypeScript and Tailwind CSS
- MySQL 8 / InnoDB through `mysql2`
- MongoDB through the official Node.js driver
- bcrypt password hashing and signed session cookies
- Git and GitHub

## Database responsibilities

**MySQL** stores users, EVs, charging stations, charging points, tariff plans, reservations, charging sessions and payments. These records need relational integrity, joins, constraints and transactions.

**MongoDB** stores flexible activity documents in the `activity_logs` collection. The collection demonstrates a second database paradigm through event insertion, indexes, filtered retrieval and aggregation.

See:
- [ER diagram](./docs/er-diagram.md)
- [Architecture and data flow](./docs/architecture.md)
- [MongoDB data model](./docs/mongodb-data-model.md)
- [Test cases and verification status](./docs/test-cases.md)
- [Project overview, objectives and conclusion](./docs/project-overview.md)
- [Data dictionary](./docs/data-dictionary.md)

## Requirements

- Node.js and npm
- MySQL 8
- MongoDB Atlas or a local MongoDB instance

## Setup

1. Clone the repository and enter its folder:

   ```sh
   git clone https://github.com/sriniket-d/smart-ev-charging-reservation.git
   cd smart-ev-charging-reservation
   ```

2. Create the database schema. **Warning:** `db/schema.sql` contains `DROP TABLE` statements and removes existing project data. Inspect it and run it only against a development database when a reset is intended.

   If you already have a working project database with data you need to keep, **do not run `db/schema.sql`**. Run only the point-code migration below against that existing database.

   ```sh
   mysql -u YOUR_MYSQL_USER -p < db/schema.sql
   # For an existing database created before charging-point codes were added, run this migration once:
   mysql -u YOUR_MYSQL_USER -p smart_ev_charging_test < db/migrations/20261106_add_charging_point_code.sql

   mysql -u YOUR_MYSQL_USER -p smart_ev_charging_test < db/seed.sql
   mysql -u YOUR_MYSQL_USER -p smart_ev_charging_test < db/views.sql
   mysql -u YOUR_MYSQL_USER -p smart_ev_charging_test < db/triggers.sql
   mysql -u YOUR_MYSQL_USER -p smart_ev_charging_test < db/advanced_queries.sql
   ```

   The seed file includes placeholder bcrypt hashes for demo accounts. Register a real test account through the application, or replace the placeholder hashes with valid hashes before trying to log in with seeded users.

3. Copy `.env.example` to `.env.local` and update the values for your local environment. Never commit `.env.local` or real credentials.

   ```dotenv
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=YOUR_MYSQL_USER
   DB_PASSWORD=YOUR_MYSQL_PASSWORD
   DB_NAME=smart_ev_charging_test
   SESSION_SECRET=replace_with_a_long_random_secret
   MONGODB_URI=mongodb://127.0.0.1:27017
   MONGODB_DB=smart_ev
   ```

   For MongoDB Atlas, use the Atlas connection URI for `MONGODB_URI`. Use a long, private random value for `SESSION_SECRET`.

4. Install dependencies and start the application:

   ```sh
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Sign in or create an account at `/login`; the main screen shows the current account and provides an in-app sign-out control.

## Main API routes

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Register a customer |
| `POST` | `/api/auth/login` | Verify credentials and create a session |
| `GET` | `/api/auth/session` | Return the signed-in user's account details and validate the current role |
| `POST` | `/api/auth/logout` | Clear the session cookie and sign out |
| `GET` | `/api/stations` | Read station summaries from MySQL |
| `GET`, `POST`, `PATCH`, `DELETE` | `/api/admin/stations` | Admin-only station and charging-point management; changes are transactional and persisted in MySQL |
| `GET` | `/api/booking-options` | Load the signed-in user's EVs and available booking options |
| `GET`, `POST`, `PATCH`, `DELETE` | `/api/evs` | List, register, edit and delete the signed-in user's EVs |
| `GET` | `/api/reservations` | Read allowed reservation history |
| `POST` | `/api/reservations` | Create a reservation and pending payment in one MySQL transaction |
| `DELETE` | `/api/reservations` | Cancel an eligible reservation |
| `GET` | `/api/activity-logs` | Read recent MongoDB activity for the signed-in user (or all events for an admin) |

## SQL and MongoDB demonstrations

- `db/schema.sql`: relational tables, primary/foreign keys, checks and indexes.
- `db/advanced_queries.sql`: safe temporary-table DDL examples, rollback-protected DML examples, joins, grouping, HAVING, aggregates, a subquery and index inspection.
- `db/views.sql`: creates `advanced_reservation_details`.
- `db/triggers.sql`: prevents overlapping active reservations during insert and update.
- `db/mongodb_activity_aggregation.js`: groups activity events by action and counts them.

Run the SQL scripts against a disposable development database first. The DML demonstration in `advanced_queries.sql` rolls back its test inserts and deletes.

## Development checks

```sh
npm run lint
npm run build
```

## Current limitations

- Station name, location, point-count and connector/power values are persisted; the current tariff is updated in place, so the schema does not keep an immutable historical tariff snapshot for each reservation.
- Payment is simulated. The pending payment row is created with amount zero and no payment gateway is connected.
- Charging sessions are demonstration records; physical charging hardware is out of scope.
- Activity events currently cover login, reservation creation/cancellation, and admin station creation/update/deletion.

## Team

- Sriniket Deeduvanu — database design, SQL implementation and core backend integration.
- Surya R Naik — Next.js interface, frontend workflows, MongoDB activity logs and UI integration.

Both members contribute to integration, testing, documentation and the final demonstration.
