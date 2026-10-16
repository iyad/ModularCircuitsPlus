import { useAppAuth } from "../auth";

/** Sign-in / signed-in-user control. Renders nothing when Auth0 isn't configured (local dev). */
export function AccountButton() {
  const auth = useAppAuth();
  if (!auth.enabled || auth.isLoading) return null;

  const buttonStyle = {
    background: "transparent",
    color: "#94a3b8",
    border: "1px solid #334155",
    borderRadius: 4,
    padding: "2px 10px",
    cursor: "pointer",
    fontSize: 11,
    fontFamily: "monospace",
  };

  if (!auth.isAuthenticated) {
    return (
      <button onClick={auth.login} style={{ ...buttonStyle, color: "#fff", background: "#1d4ed8", border: "1px solid #3b82f6" }}>
        Sign in
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {auth.userPicture && (
        <img src={auth.userPicture} alt="" width={20} height={20} referrerPolicy="no-referrer" style={{ borderRadius: "50%", flexShrink: 0 }} />
      )}
      <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {auth.userName}
      </span>
      <button onClick={auth.logout} style={{ ...buttonStyle, flexShrink: 0 }}>
        Sign out
      </button>
    </div>
  );
}
