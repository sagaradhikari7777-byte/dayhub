import { initialize } from "../lib/db";
initialize()
  .then(() => {
    console.log("DayHub schema is ready");
    process.exit(0);
  })
  .catch(() => {
    console.error("Database migration failed. Check DATABASE_URL.");
    process.exit(1);
  });
