# Smart EV Charging Station Reservation System

A DBMS mini project by Sriniket Deeduvanu and Surya R Naik. The application uses Next.js for its frontend and API routes, MySQL for reservation data, and MongoDB for reservation activity logs.

## Current features

- Browse booking options from MySQL, including EVs, available charging points, station information, and tariffs.
- Create, cancel, and view reservation history using MySQL.
- Record reservation creation and cancellation events in MongoDB's `activity_logs` collection.
- Explore advanced MySQL examples in [`db/advanced_queries.sql`](./db/advanced_queries.sql), including the `advanced_reservation_details` view and two tested MySQL 8 triggers that prevent overlapping active reservations on the same charging point.

The `db/advanced_queries.sql` script includes an advanced reservation
view, two overlap-prevention triggers, SQL query examples, and a
temporary-table transaction demonstration. Executing the relevant
statements creates the view and triggers in MySQL. Optional ALTER
and DROP VIEW examples remain commented out. Review and deliberately enable those statements if you want to create the database objects.

## Technology

- Next.js, React, and TypeScript
- MySQL 8 with InnoDB
- MongoDB (a local MongoDB instance is used in development)

The MySQL schema contains `users`, `evs`, `charging_stations`, `charging_points`, `tariff_plans`, `reservations`, `charging_sessions`, and `payments`. The seed script adds demonstration records.

## Requirements

- Node.js and npm
- MySQL 8
- MongoDB running locally for development

## Setup

1. Clone the repository and enter its folder:

   ```sh
   git clone https://github.com/sriniket-d/smart-ev-charging-reservation.git
   cd smart-ev-charging-reservation
   ```

2. Before running [`db/schema.sql`](./db/schema.sql), inspect the script. It contains `DROP TABLE` statements that remove existing tables and their data. Run it only after confirming that resetting the target database is safe.

3. Using a MySQL client, run `db/schema.sql`, then run `db/seed.sql` to add the sample records. The schema creates and uses the `smart_ev_charging_test` database.

4. Create `.env.local` in the project root and configure the database connections. Replace placeholders with values for your local setup; do not commit real passwords or other credentials.

   ```dotenv
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=<YOUR_MYSQL_USER>
   DB_PASSWORD=<YOUR_MYSQL_PASSWORD>
   DB_NAME=smart_ev_charging_test
   MONGODB_URI=mongodb://<LOCAL_MONGODB_HOST>:<LOCAL_MONGODB_PORT>
   MONGODB_DB=smart_ev
   ```

   Start MongoDB locally before using features that write or read activity logs.

5. Install dependencies and start the development server:

   ```sh
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/db-test` | Check the MySQL connection. |
| `GET` | `/api/stations` | Return charging stations from MySQL. |
| `GET` | `/api/booking-options` | Load vehicles and available charging points with station and tariff details from MySQL. |
| `GET` | `/api/reservations` | Return reservation history from MySQL. |
| `POST` | `/api/reservations` | Validate and create a reservation in MySQL; log its creation in MongoDB. |
| `DELETE` | `/api/reservations` | Cancel an eligible reservation in MySQL; log its cancellation in MongoDB. |
| `GET` | `/api/activity-logs` | Return recent MongoDB reservation activity logs. |

## Development checks

```sh
npm run lint
npm run build
```

## Current limitations

- Dashboard station cards still use demo data; the stations API exists, but those cards are not currently MySQL-backed.
- My EV and admin tools use in-memory demo data and do not persist their changes to MySQL.
- Booking options and reservation history use MySQL.
- Authentication and payment processing are not fully implemented. The current reservation flow uses the demonstration user with `user_id` 1; do not treat it as production account authorization.

## Team

- Sriniket Deeduvanu - PES2UG24CS521
- Surya R Naik - PES2UG24CS540
