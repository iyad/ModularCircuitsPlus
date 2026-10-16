import { createContext, useContext, type ReactNode } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { setTokenGetter } from "./api";

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

/** False in local dev when Auth0 isn't configured; the server then treats every request as a local admin. */
export const authEnabled = Boolean(domain && clientId && audience);

export interface AppAuth {
  enabled: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  userName?: string;
  userPicture?: string;
  login: () => void;
  logout: () => void;
}

const LOCAL_DEV_AUTH: AppAuth = {
  enabled: false,
  isLoading: false,
  isAuthenticated: true,
  userName: "Local dev",
  login: () => {},
  logout: () => {},
};

const AuthContext = createContext<AppAuth>(LOCAL_DEV_AUTH);

export function useAppAuth(): AppAuth {
  return useContext(AuthContext);
}

function Auth0Bridge({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();

  // Assigned during render, not in an effect: child effects (App's data loading) run before a parent's
  // effects, so an effect here would let the first authenticated fetch go out without a token.
  setTokenGetter(isAuthenticated ? () => getAccessTokenSilently() : null);

  const value: AppAuth = {
    enabled: true,
    isLoading,
    isAuthenticated,
    userName: user?.name ?? user?.email,
    userPicture: user?.picture,
    login: () => loginWithRedirect(),
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (!authEnabled) return <>{children}</>;
  return (
    <Auth0Provider
      domain={domain!}
      clientId={clientId!}
      authorizationParams={{ redirect_uri: window.location.origin, audience }}
      // Refresh tokens + localStorage keep users signed in across reloads without relying on third-party cookies.
      useRefreshTokens
      cacheLocation="localstorage"
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  );
}
