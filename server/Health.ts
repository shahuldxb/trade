import { getPoolByDB } from "./db";

const dbList = ["cosmicdust", "TF_genie", "mlc","universal"];

export async function getAllHealth() {
  const results = await Promise.all(
    dbList.map(async (db) => {
      try {
        const pool = await getPoolByDB(db);
        if (!pool) {
          throw new Error(`Connection pool unavailable for ${db}`);
        }

        await pool.request().query("SELECT 1");

        return { database: db, status: "HEALTHY" };
      } catch (err: any) {
        return { database: db, status: "DOWN", error: err.message };
      }
    })
  );

  return {
    server: "UP",
    databases: results,
    time: new Date()
  };
}