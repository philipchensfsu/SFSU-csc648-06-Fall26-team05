import { memo } from 'react';

// Fish food: the tin at the top of the hero, and the flakes (the pinch in hand and the ones sinking in the
// water). The behaviour lives in SeaPage ("fish food"); these only draw. `f` comes from SeaPage.getFood().

// where each flake of the pinch sits around the pointer: x, y (px), turn (deg)
const PINCH = [[-7, -2, 18], [-2, -6, -30], [4, -4, 52], [8, 1, -12], [3, 3, 36], [-4, 4, -48], [0, -1, 70], [6, 6, -20]];

// The tin: a button. Mouse or pen: it hands the cursor a pinch; click again (or Esc) to put it back.
// Keyboard: it sprinkles straight from the tin. Touch: tap it, then tap the water.
export const FoodTin = memo(function FoodTin({ f }) {
  const { tinRef, onTin } = f;
  return (
    <button type="button" className="food-tin" ref={tinRef} onClick={onTin} aria-label="Feed the fish">
      <svg viewBox="0 0 40 50" width="40" height="50" aria-hidden="true">
        <g className="tin-food">
          <rect x="11" y="10.5" width="4" height="3" rx="1" className="fk0" />
          <rect x="16.5" y="9" width="4" height="3" rx="1" className="fk1" transform="rotate(-20 18.5 10.5)" />
          <rect x="22" y="10" width="4" height="3" rx="1" className="fk2" transform="rotate(25 24 11.5)" />
          <rect x="26" y="11" width="3.5" height="2.6" rx="1" className="fk0" />
        </g>
        <rect className="s3" x="7" y="12" width="26" height="34" rx="5" />
        <rect className="s1" x="7" y="41" width="26" height="5" rx="2.5" />
        <rect className="sw" x="9.5" y="15.5" width="2.4" height="23" rx="1.2" opacity=".55" />
        <rect className="sw" x="11" y="20" width="20" height="15" rx="3" />
        <path className="s2" d="M14 24.5 L17.4 27.5 L14 30.5 Z" />
        <ellipse className="s2" cx="22.6" cy="27.5" rx="6" ry="3.7" />
        <circle className="sw" cx="25.4" cy="26.6" r="1" />
        <g className="tin-lid">
          <rect className="s2" x="5" y="6" width="30" height="8" rx="3" />
          <rect className="s2" x="14" y="2.5" width="12" height="5" rx="2" />
          <rect className="s4" x="7.5" y="8.5" width="25" height="1.6" rx=".8" opacity=".6" />
        </g>
      </svg>
      <span className="food-tip" aria-hidden="true">
        <span className="tip-idle">Feed the fish</span>
        <span className="tip-hold">Click the water to sprinkle</span>
        <span className="tip-touch">Tap the water to sprinkle</span>
      </span>
    </button>
  );
});

// The flakes: a fixed layer over the page, like the cursor bubbles.
export const FoodLayer = memo(function FoodLayer({ f }) {
  const { pinchRef, pinch, pool } = f;
  return (
    <div className="food-layer" aria-hidden="true">
      <span className="food-pinch" ref={pinchRef}>
        {pinch.map((p, i) => (
          <i key={i} ref={p.ref} className={'food-flake fk' + (i % 3)} style={{ left: PINCH[i][0] + 'px', top: PINCH[i][1] + 'px', transform: 'rotate(' + PINCH[i][2] + 'deg)' }} />
        ))}
      </span>
      {pool.map((p, i) => (
        <i key={i} ref={p.ref} className={'food-flake food-drop fk' + (i % 3)} />
      ))}
    </div>
  );
});
