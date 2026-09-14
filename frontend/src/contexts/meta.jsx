import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../services/api";
import { useAuth } from "./auth";
import { workspaceFromPath } from "./workspace";

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
    serviceCategories: [],
  });
  const [loading, setLoading] = useState(true);
  // Lookups (teams, agents, categories) differ per app, so reload when an
  // admin switches between the corporate and internal views.
  const workspace = workspaceFromPath(useLocation().pathname);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await api(`/meta?workspace=${workspace}`);
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
  }, [user, workspace]);

  const value = useMemo(() => ({ meta, loading }), [meta, loading]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error("useMeta must be used within MetaProvider");
  return ctx;
}
