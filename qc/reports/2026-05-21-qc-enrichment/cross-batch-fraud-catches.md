# Cross-Batch Fraud Detection Report

## Summary

Both batches (J26-640 run first, J26-788 run second) produced **0 cross-batch catches**.

This is expected for the first two batches:
- J26-640 ran with empty history → 0 cross-batch catches (correct)
- J26-788 ran with J26-640 history → 0 cross-batch catches (no duplicate tickets or suspicious patterns found between batches)

## Cross-Batch History State

- Batches processed: ['J26-640', 'J26-788']
- Tickets tracked: 168
- Passenger trips: 168
- Employees in annual budget tracker: 99

## Catch Categories (will fire on future batches when patterns emerge)

| Category | Severity | Trigger |
|----------|----------|--------|
| CROSS_BATCH_DUPLICATE_TICKET | HARD | Same ticket_no in two batches |
| POTENTIAL_REBOOKING_FRAUD | MEDIUM | Same pax + amount ±10% + same route ±14 days |
| FREQUENT_TRAVELER_OVER_BUDGET | MEDIUM | YTD total > 90% of annual grade cap |
| PASSENGER_AMOUNT_PATTERN | LOW | 3+ trips at same SAR within 60 days |