import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "./auth";

const MetaContext = createContext(null);

export function MetaProvider({ children }) {
  const { user } = useAuth();
  const [meta, setMeta] = useState({
    statuses: [],
    priorities: [],
    types: [],
    channels: [],
    teams: [],
    roles: [],
    agents: [],
    organizations: [],
    departments: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await api("/meta");
        if (active) setMeta(data);
      } catch {
        if (active) setMeta((prev) => ({ ...prev }));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [user]);

  const value = useMemo(() => ({ meta, loading }), [meta, loading]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error("useMeta must be used within MetaProvider");
  return ctx;
}
