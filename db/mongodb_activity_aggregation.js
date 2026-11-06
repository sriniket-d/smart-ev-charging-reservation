// Smart EV Reservation System
// MongoDB aggregation: count application activity events by action

// Select database: smart_ev

db.activity_logs.aggregate([
  {
    $group: {
      _id: "$action",
      eventCount: { $sum: 1 }
    }
  },
  {
    $project: {
      _id: 0,
      action: "$_id",
      eventCount: 1
    }
  },
  {
    $sort: {
      action: 1
    }
  }
]);