import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const fetchMembership = async (userId) => {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, org_id, account_role, employee_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data
    ? { id: data.id, orgId: data.org_id, accountRole: data.account_role, employeeId: data.employee_id }
    : null;
};

// Auth is deliberately its own context, not folded into AppState: it has a
// different lifecycle (must resolve before org data can be fetched, gates
// routing) and things outside AppState's concern (the invite Edge Function
// call, Layout's identity display) depend on it directly.
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(undefined); // undefined = not yet resolved
  const [membership, setMembership] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session ?? null);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session === undefined) {
      return undefined;
    }

    if (!session) {
      setMembership(null);
      setMembershipLoading(false);
      return undefined;
    }

    let isCurrent = true;
    setMembershipLoading(true);

    fetchMembership(session.user.id)
      .then((nextMembership) => {
        if (isCurrent) {
          setMembership(nextMembership);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setMembership(null);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setMembershipLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [session]);

  const signOut = () => supabase.auth.signOut();

  const refreshMembership = async () => {
    if (!session) {
      return;
    }

    setMembershipLoading(true);

    try {
      setMembership(await fetchMembership(session.user.id));
    } finally {
      setMembershipLoading(false);
    }
  };

  const value = useMemo(() => ({
    session: session ?? null,
    user: session?.user ?? null,
    membership,
    loading: session === undefined || membershipLoading,
    signOut,
    refreshMembership,
  }), [session, membership, membershipLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
