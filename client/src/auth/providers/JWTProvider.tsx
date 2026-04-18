// import axios, { AxiosResponse } from 'axios';
// import {
//   createContext,
//   type Dispatch,
//   type PropsWithChildren,
//   type SetStateAction,
//   useEffect,
//   useState
// } from 'react';
// import * as authHelper from '../_helpers';
// import { type AuthModel, type UserModel } from '@/auth';
// import { type RBAC, MenuAuthContext } from '../AuthContext';

// const API_URL = (import.meta.env.VITE_APP_API_URL || '').trim();
// const withApiBase = (path: string) => (API_URL ? `${API_URL}${path}` : path);
// export const LOGIN_URL = withApiBase('/api/login');
// export const REGISTER_URL = withApiBase('/api/register');
// export const FORGOT_PASSWORD_URL = withApiBase('/api/forgot-password');
// export const RESET_PASSWORD_URL = withApiBase('/api/reset-password');
// export const GET_USER_URL = withApiBase('/api/user');

// interface AuthContextProps {
//   loading: boolean;
//   setLoading: Dispatch<SetStateAction<boolean>>;
//   auth: AuthModel | undefined;
//   saveAuth: (auth: AuthModel | undefined) => void;
//   currentUser: UserModel | null;
//   setCurrentUser: Dispatch<SetStateAction<UserModel | null>>;
//   login: (email: string, password: string) => Promise<void>;
//   loginWithGoogle?: () => Promise<void>;
//   loginWithFacebook?: () => Promise<void>;
//   loginWithGithub?: () => Promise<void>;
//   register: (email: string, password: string, password_confirmation: string) => Promise<void>;
//   requestPasswordResetLink: (email: string) => Promise<void>;
//   changePassword: (
//     email: string,
//     token: string,
//     password: string,
//     password_confirmation: string
//   ) => Promise<void>;
//   getUser: () => Promise<AxiosResponse<any>>;
//   logout: () => void;
//   verify: () => Promise<void>;
// }

// const AuthContext = createContext<AuthContextProps | null>(null);

// const AuthProvider = ({ children }: PropsWithChildren) => {
//   const getStoredCurrentUser = (): UserModel | null => {
//     try {
//       const stored = localStorage.getItem('currentUser');
//       if (!stored) return null;
//       const parsed = JSON.parse(stored);
//       return parsed && typeof parsed === 'object' ? (parsed as UserModel) : null;
//     } catch {
//       return null;
//     }
//   };

//   const [loading, setLoading] = useState(true);
//   const [auth, setAuth] = useState<AuthModel | undefined>(authHelper.getAuth());
//   const [currentUser, setCurrentUser] = useState<UserModel | null>(getStoredCurrentUser);
//   const [rbac, setRbac] = useState<RBAC | null>(null);
  
//   const canAccess = (asset: string, action: string): boolean => {
//     if (!rbac) return false;
//     return rbac.access?.[asset]?.includes(action) ?? false;
//   };

//   const resetAuth = () => {
//     setRbac(null);
//   };
//   const clearSession = () => {
//     setAuth(undefined);
//     setCurrentUser(null);
//     setRbac(null);
//     authHelper.removeAuth();
//     delete axios.defaults.headers.common['Authorization'];
//     localStorage.removeItem('rbac');
//     localStorage.removeItem('currentUser');
//     localStorage.removeItem('PrimaryRole');
//     localStorage.removeItem('username');
//     localStorage.removeItem('userID');
//     localStorage.removeItem('token');
//   };

//   const verify = async () => {
//     if (!authHelper.getAuth()?.access_token) {
//       return;
//     }

//     try {
//       const { data: user } = await getUser();
//       setCurrentUser(user);
//       localStorage.setItem('currentUser', JSON.stringify(user));
//     } catch (error: any) {
//       const status = error?.response?.status;
//       if (status === 401 || status === 403) {
//         clearSession();
//       }
//     }
//   };
//   const saveAuth = (auth: AuthModel | undefined) => {
//     setAuth(auth);
//     if (auth?.access_token) {
//       authHelper.setAuth(auth);
//       axios.defaults.headers.common['Authorization'] = `Bearer ${auth.access_token}`;
//     } else {
//       authHelper.removeAuth();
//       delete axios.defaults.headers.common['Authorization'];
//     }
//   };
//   useEffect(() => {
//     const a = authHelper.getAuth();
//     if (a?.access_token) {
//       axios.defaults.headers.common['Authorization'] = `Bearer ${a.access_token}`;
//     }
//     setLoading(false);
//   }, []);

//   useEffect(() => {
//     const initAuth = async () => {
//       try {
//         setLoading(true);

//         const authData = authHelper.getAuth(); // token from storage
//         if (!authData?.access_token) {
//           clearSession();
//           setCurrentUser(null);
//           return;
//         }

//         setAuth(authData);
//         axios.defaults.headers.common['Authorization'] = `Bearer ${authData.access_token}`;

//         // restore RBAC from storage (backend returns it on login)
//         const storedRbac = localStorage.getItem('rbac');
//         if (storedRbac) {
//           setRbac(JSON.parse(storedRbac));
//         }

//         // optional: verify user session (user only)
//         await verify();
//       } catch (err) {
//         resetAuth();
//       } finally {
//         setLoading(false);
//       }
//     };

//     initAuth();
//   }, []);

//   const login = async (identifier: string, password: string) => {
//     try {
//       const res = await axios.post(LOGIN_URL, {
//         Identifier: identifier,
//         Password: password
//       });

//       const { success, message, token, user, rbac } = res.data ?? {};
//       if (success === false) {
//         throw new Error(message || 'Login failed');
//       }
//       if (!token) {
//         throw new Error('Login failed');
//       }
//       console.log('rbac', res.data);
//       saveAuth({
//         access_token: token,
//         api_token: token
//       });
//       localStorage.setItem('token', token);

//       if (user) {
//         setCurrentUser(user);
//         localStorage.setItem('currentUser', JSON.stringify(user));
//         localStorage.setItem('PrimaryRole', user.PrimaryRole);
//         localStorage.setItem('username', user.Username);
//         localStorage.setItem('userID', user.UserID);
//       }
//       setRbac(rbac);
//       console.log('setCurrentUser', setCurrentUser);
//       console.log('rbac', JSON.stringify(rbac));
//       if (rbac) {
//         localStorage.setItem('rbac', JSON.stringify(rbac));
//       } else {
//         localStorage.removeItem('rbac');
//       }

//       return res.data;
//     } catch (err: any) {
//       clearSession();
//       const message =
//         err?.response?.data?.message || err?.message || 'Login failed';
//       throw new Error(message);
//     }
//   };

//   useEffect(() => {
//     const storedRbac = localStorage.getItem('rbac');
//     if (storedRbac) {
//       setRbac(JSON.parse(storedRbac));
//     }
//   }, []);

//   const register = async (email: string, password: string, password_confirmation: string) => {
//     try {
//       const { data: auth } = await axios.post(REGISTER_URL, {
//         email,
//         password,
//         password_confirmation
//       });
//       saveAuth(auth);
//       const { data: user } = await getUser();
//       setCurrentUser(user);
//     } catch (error) {
//       saveAuth(undefined);
//       throw new Error(`Error ${error}`);
//     }
//   };

//   const requestPasswordResetLink = async (email: string) => {
//     await axios.post(FORGOT_PASSWORD_URL, {
//       email
//     });
//   };

//   const changePassword = async (
//     email: string,
//     token: string,
//     password: string,
//     password_confirmation: string
//   ) => {
//     await axios.post(RESET_PASSWORD_URL, {
//       email,
//       token,
//       password,
//       password_confirmation
//     });
//   };

//   const getUser = async () => {
//     return await axios.get<UserModel>(GET_USER_URL);
//   };

//   const logout = () => {
//     clearSession();
//   };

//   // NOTE: RBAC must come from the current user's login response or storage.

//   return (
//     <MenuAuthContext.Provider
//       value={{
//         rbac,
//         setRbac,
//         canAccess,
//         resetAuth
//       }}
//     >
//       <AuthContext.Provider
//         value={{
//           loading,
//           setLoading,
//           auth,
//           saveAuth,
//           currentUser,
//           setCurrentUser,
//           login,
//           register,
//           requestPasswordResetLink,
//           changePassword,
//           getUser,
//           logout,
//           verify
//         }}
//       >
//         {children}
//       </AuthContext.Provider>
//     </MenuAuthContext.Provider>
//   );
// };

// export { AuthContext, AuthProvider };


import axios, { AxiosResponse } from 'axios';
import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  useEffect,
  useState
} from 'react';
import * as authHelper from '../_helpers';
import { type AuthModel, type UserModel } from '@/auth';
import { type RBAC, MenuAuthContext } from '../AuthContext';

const API_URL = (import.meta.env.VITE_APP_API_URL || '').trim();
const withApiBase = (path: string) => (API_URL ? `${API_URL}${path}` : path);
export const LOGIN_URL = withApiBase('/api/login');
export const REGISTER_URL = withApiBase('/api/register');
export const FORGOT_PASSWORD_URL = withApiBase('/api/forgot-password');
export const RESET_PASSWORD_URL = withApiBase('/api/reset-password');
export const GET_USER_URL = withApiBase('/api/user');

const MAX_AUTH_HEADER_BYTES = 6 * 1024;
const getAuthorizationHeaderBytes = (token: string) =>
  new TextEncoder().encode(`Bearer ${token}`).length;
const isAuthorizationHeaderSafe = (token: string) =>
  getAuthorizationHeaderBytes(token) <= MAX_AUTH_HEADER_BYTES;
const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    if (typeof window === 'undefined') return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = window.atob(padded);

    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};
const isTokenExpired = (token: string): boolean => {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp ?? 0);
  if (!exp) return false;

  return exp * 1000 <= Date.now();
};


interface AuthContextProps {
  loading: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  auth: AuthModel | undefined;
  saveAuth: (auth: AuthModel | undefined, persistent?: boolean) => void;
  currentUser: UserModel | null;
  setCurrentUser: Dispatch<SetStateAction<UserModel | null>>;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  loginWithGoogle?: () => Promise<void>;
  loginWithFacebook?: () => Promise<void>;
  loginWithGithub?: () => Promise<void>;
  register: (email: string, password: string, password_confirmation: string) => Promise<void>;
  requestPasswordResetLink: (email: string) => Promise<void>;
  changePassword: (
    email: string,
    token: string,
    password: string,
    password_confirmation: string
  ) => Promise<void>;
  getUser: () => Promise<AxiosResponse<any>>;
  logout: () => void;
  verify: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | null>(null);

const AuthProvider = ({ children }: PropsWithChildren) => {
  const getStoredCurrentUser = (): UserModel | null => {
    try {
      const stored = authHelper.getAuthSessionItem('currentUser');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === 'object' ? (parsed as UserModel) : null;
    } catch {
      return null;
    }
  };

  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<AuthModel | undefined>(authHelper.getAuth());
  const [currentUser, setCurrentUser] = useState<UserModel | null>(getStoredCurrentUser);
  const [rbac, setRbac] = useState<RBAC | null>(null);
  
  const canAccess = (asset: string, action: string): boolean => {
    if (!rbac) return false;
    return rbac.access?.[asset]?.includes(action) ?? false;
  };

  const resetAuth = () => {
    setRbac(null);
  };

  const setSessionField = (key: string, value: string, persistent = false) => {
    authHelper.setAuthSessionItem(key, value, persistent);
  };

  const removeSessionField = (key: string) => {
    authHelper.removeAuthSessionItem(key);
  };

  const clearSession = () => {
    setAuth(undefined);
    setCurrentUser(null);
    setRbac(null);
    authHelper.removeAuth();
    delete axios.defaults.headers.common['Authorization'];
    removeSessionField('rbac');
    removeSessionField('currentUser');
    removeSessionField('PrimaryRole');
    removeSessionField('username');
    removeSessionField('userID');
    removeSessionField('token');
  };

  const redirectToLogin = () => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname.startsWith('/auth/')) return;

    localStorage.setItem('lastPath', window.location.pathname);
    window.location.assign('/auth/classic/login');
  };

  const forceReauthForLargeToken = (token: string) => {
  const size = getAuthorizationHeaderBytes(token);
  console.error(`[auth] token too large for header: ${size} bytes`);
  clearSession();

  if (typeof window !== "undefined") {
    sessionStorage.setItem(
      "auth_error_message",
      "Session expired. Please login again."
    );
    window.location.assign("/auth/login");
  }
};

  const verify = async () => {
    const activeAuth = authHelper.getAuth();
    if (!activeAuth?.access_token) {
      clearSession();
      return;
    }

    if (isTokenExpired(String(activeAuth.access_token))) {
      clearSession();
      return;
    }

    try {
      const { data: user } = await getUser();
      setCurrentUser(user);
      const persistent = authHelper.getAuthStorageKey() === authHelper.AUTH_LOCAL_STORAGE_KEY;
      setSessionField('currentUser', JSON.stringify(user), persistent);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        clearSession();
      }
    }
  };

  // const saveAuth = (auth: AuthModel | undefined) => {
  //   if (auth?.access_token) {
  //     const token = String(auth.access_token);
  //     if (!isAuthorizationHeaderSafe(token)) {
  //       console.error(
  //         `Authorization header too large (${getAuthorizationHeaderBytes(token)} bytes). Session cleared to prevent HTTP 431.`
  //       );
  //       clearSession();
  //       return;
  //     }

  //     const nextAuth: AuthModel = {
  //       ...auth,
  //       access_token: token,
  //       api_token: token,
  //     };
  //     setAuth(nextAuth);
  //     authHelper.setAuth(nextAuth);
  //     axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  //     return;
  //   }

  //   setAuth(undefined);
  //   authHelper.removeAuth();
  //   delete axios.defaults.headers.common['Authorization'];
  // };
  

  const saveAuth = (auth: AuthModel | undefined, persistent = false) => {
  if (auth?.access_token) {
    const token = String(auth.access_token);

    if (!isAuthorizationHeaderSafe(token)) {
      forceReauthForLargeToken(token);
      return;
    }

    const nextAuth: AuthModel = {
      ...auth,
      access_token: token,
      api_token: token,
    };

    setAuth(nextAuth);
    authHelper.setAuth(nextAuth, persistent);
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    return;
  }

  setAuth(undefined);
  authHelper.removeAuth();
  delete axios.defaults.headers.common["Authorization"];
};

  useEffect(() => {
    const cleanup = authHelper.setupSessionSync();
    const a = authHelper.getAuth();
    if (a?.access_token) {
      const token = String(a.access_token);
      if (isAuthorizationHeaderSafe(token) && !isTokenExpired(token)) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } else {
        clearSession();
      }
    }
    setLoading(false);
    return cleanup;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== authHelper.AUTH_LOGOUT_BROADCAST_KEY || !event.newValue) {
        return;
      }

      clearSession();
      redirectToLogin();
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        setLoading(true);

        let authData = authHelper.getAuth(); // token from storage
        if (!authData?.access_token) {
          await authHelper.requestSessionAuthFromPeer();
          authData = authHelper.getAuth();
        }

        if (!authData?.access_token) {
          clearSession();
          setCurrentUser(null);
          return;
        }

        setAuth(authData);
        if (
          !isAuthorizationHeaderSafe(String(authData.access_token)) ||
          isTokenExpired(String(authData.access_token))
        ) {
          clearSession();
          return;
        }
        axios.defaults.headers.common['Authorization'] = `Bearer ${authData.access_token}`;

        // restore RBAC from storage (backend returns it on login)
        const storedRbac = authHelper.getAuthSessionItem('rbac');
        if (storedRbac) {
          setRbac(JSON.parse(storedRbac));
        }

        // optional: verify user session (user only)
        await verify();
      } catch (err) {
        resetAuth();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (identifier: string, password: string, remember = false) => {
    try {
      const res = await axios.post(LOGIN_URL, {
        Identifier: identifier,
        Password: password
      });

      const { success, message, token, user, rbac } = res.data ?? {};
      if (success === false) {
        throw new Error(message || 'Login failed');
      }
      if (!token) {
        throw new Error('Login failed');
      }
      console.log('rbac', res.data);
      saveAuth({
        access_token: token,
        api_token: token
      }, remember);
      setSessionField('token', token, remember);

      if (user) {
        setCurrentUser(user);
        setSessionField('currentUser', JSON.stringify(user), remember);
        setSessionField('PrimaryRole', String(user.PrimaryRole ?? ''), remember);
        setSessionField('username', String(user.Username ?? ''), remember);
        setSessionField('userID', String(user.UserID ?? ''), remember);
      }
      setRbac(rbac);
      console.log('setCurrentUser', setCurrentUser);
      console.log('rbac', JSON.stringify(rbac));
      if (rbac) {
        setSessionField('rbac', JSON.stringify(rbac), remember);
      } else {
        removeSessionField('rbac');
      }

      return res.data;
    } catch (err: any) {
      clearSession();
      const message =
        err?.response?.data?.message || err?.message || 'Login failed';
      throw new Error(message);
    }
  };

  useEffect(() => {
    const storedRbac = authHelper.getAuthSessionItem('rbac');
    if (storedRbac) {
      setRbac(JSON.parse(storedRbac));
    }
  }, []);

  const register = async (email: string, password: string, password_confirmation: string) => {
    try {
      const { data: auth } = await axios.post(REGISTER_URL, {
        email,
        password,
        password_confirmation
      });
      saveAuth(auth);
      const { data: user } = await getUser();
      setCurrentUser(user);
    } catch (error) {
      saveAuth(undefined);
      throw new Error(`Error ${error}`);
    }
  };

  const requestPasswordResetLink = async (email: string) => {
    await axios.post(FORGOT_PASSWORD_URL, {
      email
    });
  };

  const changePassword = async (
    email: string,
    token: string,
    password: string,
    password_confirmation: string
  ) => {
    await axios.post(RESET_PASSWORD_URL, {
      email,
      token,
      password,
      password_confirmation
    });
  };

  const getUser = async () => {
    return await axios.get<UserModel>(GET_USER_URL);
  };

  const logout = () => {
    clearSession();
    authHelper.broadcastLogout();
    redirectToLogin();
  };

  // NOTE: RBAC must come from the current user's login response or storage.

  return (
    <MenuAuthContext.Provider
      value={{
        rbac,
        setRbac,
        canAccess,
        resetAuth
      }}
    >
      <AuthContext.Provider
        value={{
          loading,
          setLoading,
          auth,
          saveAuth,
          currentUser,
          setCurrentUser,
          login,
          register,
          requestPasswordResetLink,
          changePassword,
          getUser,
          logout,
          verify
        }}
      >
        {children}
      </AuthContext.Provider>
    </MenuAuthContext.Provider>
  );
};

export { AuthContext, AuthProvider };
