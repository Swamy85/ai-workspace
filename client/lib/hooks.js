import { useEffect } from 'react';

/** Call `handler` when a mousedown happens outside `ref`, or Escape is pressed. */
export function useDismiss(ref, handler, active = true) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && handler();
    const onKey = (e) => e.key === 'Escape' && handler();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, handler, active]);
}
