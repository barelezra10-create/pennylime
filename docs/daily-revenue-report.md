# Daily revenue email

The revenue page stores report recipients in `NotificationConfig.dailyRevenueEmails`. The existing payment-status cron sends the previous complete day’s report after midnight Eastern Time and uses `dailyRevenueLastSentDate` to avoid sending that date twice.

An optional dedicated daily trigger can call the same report endpoint at 12:05 AM in the `America/New_York` timezone:

- Method: `POST`
- Path: `/api/cron/daily-revenue`
- Header: `Authorization: Bearer <CRON_SECRET>`

The dedicated endpoint uses the same date guard as the payment-status cron, so both schedules can be active without duplicate reports. You can also send the current day immediately from **Admin → Pipeline → Daily revenue → Send today’s report**.
