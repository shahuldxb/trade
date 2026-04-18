import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function useHealthCheck() {
  const hasRun = useRef(false); 

  useEffect(() => {
    if (hasRun.current) return; 
    hasRun.current = true;

    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();

        const downDBs = data.databases
          .filter((db: any) => db.status === "DOWN")
          .map((db: any) => db.database);

        if (downDBs.length > 0) {
          toast.error(`🔴 Server Issue: ${downDBs.join(", ")}`, {
            duration: 5000,
          });
        } else {
          toast.success("🟢 Server is Healthy", {
            duration: 3000,
          });
        }

      } catch (err) {
        toast.error("🔴 Health API failed");
      }
    };

    checkHealth();

    const interval = setInterval(checkHealth, 600000);

    return () => clearInterval(interval);
  }, []);
}