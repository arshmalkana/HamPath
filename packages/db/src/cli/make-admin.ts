/** Give an existing account a role:  pnpm db:make-admin you@example.com [admin|instructor|learner] */
import "../index.ts";
import { createPool } from "../pool.ts";

const [email, role = "admin"] = process.argv.slice(2);
if (!email || !["admin", "instructor", "learner"].includes(role)) {
  console.error("usage: pnpm db:make-admin <email> [admin|instructor|learner]");
  process.exit(1);
}
const pool = createPool();
try {
  const r = await pool.query(`UPDATE "user" SET role = $2 WHERE email = $1 RETURNING id`, [email, role]);
  console.log(r.rowCount ? `${email} is now ${role}` : `No account for ${email}; sign in once first.`);
  if (!r.rowCount) process.exitCode = 1;
} finally {
  await pool.end();
}
