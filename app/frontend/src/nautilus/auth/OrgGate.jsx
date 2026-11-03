import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { supabase } from '../../../lib/supabaseClient';
import OrgStepPage from './OrgStepPage.jsx';
import { orgErrorMessage } from './orgErrors.js';

// The organization the sign-up form asked for, saved on the account so it
// survives the email-confirmation round trip: { mode: "join", code } or
// { mode: "create", name }.
function pendingOrgOf(session) {
  const pending = session?.user?.user_metadata?.pending_org;
  if (pending?.mode === 'join' && pending.code) return pending;
  if (pending?.mode === 'create' && pending.name) return pending;
  return null;
}

function clearPendingOrg() {
  // Best effort: if it fails, the next sign-in finds the organization already
  // set up and skips the pending one.
  return supabase?.auth.updateUser({ data: { pending_org: null } }).catch(() => {});
}

// Every signed-in account belongs to one organization. Before the workspace
// opens, this checks GET /api/me:
//   - an organization: render children(organization) — { organization_id, name, access_role }
//   - none, but the sign-up form chose one: create or join it, then render
//   - none at all (e.g. a Google sign-up): show "One more step"
// `recheck` (passed to children) runs the check again, e.g. after the API
// answers no_organization.
export default function OrgGate({ session, onLogOut, children }) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Creating or joining must happen once per account even though React may
  // run this effect twice (StrictMode in development).
  const running = useRef(null);
  const userId = session?.user?.id;

  useEffect(() => {
    let current = true;
    const key = `${userId}:${attempt}`;
    if (running.current?.key !== key) {
      running.current = { key, promise: settle(session) };
    }
    running.current.promise.then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
    // `session` changes on every token refresh; the account is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, attempt]);

  const recheck = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  // From "One more step": create or join, then open the workspace. A refusal
  // rejects, so the page shows why.
  async function finish(call) {
    await call();
    await clearPendingOrg();
    const me = await api.getMe();
    setState({ status: 'ready', organization: me.organization });
  }

  if (state.status === 'loading') {
    return <p role="status" style={{ padding: "24px" }}>Loading workspace…</p>;
  }

  if (state.status === 'unavailable') {
    return (
      <div role="alert" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
        <p style={{ margin: 0 }}>Couldn’t load your workspace. {state.message}</p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={recheck}>Try again</button>
          <button type="button" onClick={onLogOut}>Sign out</button>
        </div>
      </div>
    );
  }

  if (state.status === 'needs-org') {
    return (
      <OrgStepPage
        email={session.user.email}
        error={state.error}
        defaultValues={state.defaultValues}
        onJoin={(code) => finish(() => api.joinOrganization(code))}
        onCreate={(name) => finish(() => api.createOrganization(name))}
        onSignOut={onLogOut}
      />
    );
  }

  return children(state.organization, recheck);
}

// Works out what to show for this account, carrying out the sign-up's choice
// on the way when there is one.
async function settle(session) {
  let me;
  try {
    me = await api.getMe();
  } catch (error) {
    return { status: 'unavailable', message: error.message };
  }
  if (me.organization) return { status: 'ready', organization: me.organization };

  const pending = pendingOrgOf(session);
  if (!pending) return { status: 'needs-org', error: '', defaultValues: {} };

  const defaultValues = pending.mode === 'join' ? { joinCode: pending.code } : { orgName: pending.name };
  try {
    if (pending.mode === 'join') await api.joinOrganization(pending.code);
    else await api.createOrganization(pending.name);
    await clearPendingOrg();
    const after = await api.getMe();
    if (after.organization) return { status: 'ready', organization: after.organization };
    return { status: 'needs-org', error: '', defaultValues };
  } catch (error) {
    // Don't retry a refused code on every sign-in; the step page offers it again.
    await clearPendingOrg();
    return { status: 'needs-org', error: orgErrorMessage(error), defaultValues };
  }
}
