import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function TicketNew() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/tickets?create=1", { replace: true });
  }, [navigate]);

  return <div className="text-sm text-[var(--fg-muted)] p-6">Redirecting to ticket workspace...</div>;
}
