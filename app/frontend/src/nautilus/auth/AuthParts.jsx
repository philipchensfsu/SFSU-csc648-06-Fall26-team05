// Small pieces shared by the sign-in and sign-up pages.

// A message above the main button: an error (red) or a notice (aqua), or nothing at all.
export function Message({ error, notice }) {
  if (!error && !notice) return null;
  return (
    <p role={error ? 'alert' : 'status'} className={error ? 'au-msg au-msg-error' : 'au-msg'}>
      {error || notice}
    </p>
  );
}

// One password requirement under the sign-up password field: a green tick once it's met, a grey dot until then.
export function PasswordRule({ label, met }) {
  if (met) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#106B43' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12 5 5L20 7" />
        </svg>
        {label}
        <span className="au-sr"> (done)</span>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#557479' }}>
      <span style={{ width: '14px', height: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#8FA9AD' }} />
      </span>
      {label}
    </span>
  );
}
