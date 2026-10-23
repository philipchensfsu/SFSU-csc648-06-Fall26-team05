import { memo } from 'react';

// cursor bubbles: a bubble that follows the pointer + small bubbles left behind
function CursorBubbles({ pool, ringRef }) {
  return (
    <div className="cb-layer" aria-hidden="true">{pool.map((b, i) => <span key={i} className="cb" ref={b.ref} style={{ width: b.size, height: b.size }} />)} <span className="cb-ring" ref={ringRef} /></div>
  );
}

export default memo(CursorBubbles);
