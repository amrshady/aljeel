// ============================================================================
// motion.js — tiny, dependency-free motion helpers (Phase 8 polish).
//
// Everything here is transform/opacity only (60fps-friendly, GPU-composited)
// and bails out instantly under prefers-reduced-motion, so the finance UI stays
// usable and calm when the OS asks for less motion. No animation library.
//
//   • prefersReducedMotion() — live media-query read (re-checked each call).
//   • flip(nodes, mutate)    — FLIP: measure rects (First), run the layout
//                              mutation (Last), invert via transform, then play
//                              back to identity. Used for the run-detail tab
//                              strip's collapsing-columns animation.
//   • crossFade(holder, node)— swap a holder's child with an opacity fade-in of
//                              the new node. Used for the StateChip transition.
// ============================================================================

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the OS / browser asks for reduced motion. Read live every call. */
export function prefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia(REDUCE_QUERY).matches;
  } catch (_e) {
    return false;
  }
}

const EASE = 'cubic-bezier(.2, .7, .2, 1)';

/**
 * FLIP animation over a set of nodes whose positions change as a result of
 * `mutate()`. We record each node's box (First), run the mutation (Last), then
 * apply an inverting transform and transition it back to none.
 *
 * Translate-only by default (no scaleX) so text/icons never distort — the
 * canonical "collapsing columns" look without the squish. Pass {scale:true}
 * to also invert width via scaleX where distortion is acceptable.
 *
 * @param {Iterable<HTMLElement>} nodes
 * @param {() => void} mutate         synchronous layout change (e.g. class swap)
 * @param {{duration?:number, scale?:boolean}} [opts]
 */
export function flip(nodes, mutate, { duration = 200, scale = false } = {}) {
  const list = [...nodes].filter(Boolean);
  if (prefersReducedMotion() || !list.length) { mutate(); return; }

  const first = new Map();
  for (const n of list) first.set(n, n.getBoundingClientRect());

  mutate(); // Last: layout reflows to its new state.

  for (const n of list) {
    const a = first.get(n);
    const b = n.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    const sx = scale && b.width ? a.width / b.width : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01) continue;

    // Invert: jump the node back to where it was, with no transition.
    n.style.transition = 'none';
    n.style.transformOrigin = 'left center';
    n.style.transform = `translate(${dx}px, ${dy}px)${scale ? ` scaleX(${sx})` : ''}`;
    n.getBoundingClientRect(); // force reflow so the inverted state is committed

    // Play: next frame, transition the transform away to identity.
    requestAnimationFrame(() => {
      n.style.transition = `transform ${duration}ms ${EASE}`;
      n.style.transform = '';
    });

    const clear = () => {
      n.style.transition = '';
      n.style.transform = '';
      n.style.transformOrigin = '';
      n.removeEventListener('transitionend', clear);
    };
    n.addEventListener('transitionend', clear);
    setTimeout(clear, duration + 80); // safety net if transitionend never fires
  }
}

/**
 * Replace a holder's content with `newNode`, fading the new node in. Under
 * reduced motion it's an instant swap.
 *
 * @param {HTMLElement} holder
 * @param {HTMLElement} newNode
 * @param {{duration?:number}} [opts]
 */
export function crossFade(holder, newNode, { duration = 180 } = {}) {
  if (prefersReducedMotion()) { holder.replaceChildren(newNode); return; }
  newNode.style.opacity = '0';
  newNode.style.transition = `opacity ${duration}ms ${EASE}`;
  holder.replaceChildren(newNode);
  requestAnimationFrame(() => { newNode.style.opacity = '1'; });
  setTimeout(() => { newNode.style.transition = ''; newNode.style.opacity = ''; }, duration + 60);
}
