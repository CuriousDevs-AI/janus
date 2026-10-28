# Decision log

One line per decision. Newest items go at the bottom.

- Item 0 (task status): no code change. The status select in `TasksView` already calls `mirrorTaskStatus`; verified in the browser that a change to `doing` sends `POST /api/backend/project-records/{project}/tasks/{task}/status` (200), the server returns `doing`, and the value survives reload.
- Item 0 (test data): verification used a test owner and test person in the local demo tenant; the browser test data was not committed.
