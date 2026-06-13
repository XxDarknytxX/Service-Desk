/**
 * BootProvider — app-level transition overlay.
 *
 * Renders the LoadingScreen as a fixed overlay that lives ABOVE the router, so
 * it survives route changes. `boot({ onCovered })` plays one continuous motion
 * instead of three hard switches:
 *   enter → in : the orb blooms up from small + transparent as the login
 *                dissolves behind it (login → loader feels like one fade)
 *   hold       : brief beat while the orb breathes
 *   (covered)  : onCovered() swaps the route underneath while fully covered
 *   in → exit  : the orb zooms out + fades, revealing the app rising in
 *                underneath (loader → app feels like a zoom-through)
 */

import { createContext, useCallback, useContext, useRef, useState } from "react";
import LoadingScreen from "../components/ui/LoadingScreen";

const BootContext = createContext(() => {});

export function useBoot() {
  return useContext(BootContext);
}

const BLOOM = 720;  // orb blooms in (matches opacity/transform transitions)
const HOLD = 520;   // beat while fully covered
const SWAP = 90;    // let the freshly-mounted route paint before revealing it
const EXIT = 820;   // orb zooms out + fades, app rises in

export function BootProvider({ children }) {
  const [active, setActive] = useState(false);
  const [state, setState] = useState("enter");
  const timers = useRef([]);

  const boot = useCallback(({ onCovered } = {}) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    setActive(true);
    setState("enter");
    // double rAF so the orb paints small + transparent before blooming in
    requestAnimationFrame(() => requestAnimationFrame(() => setState("in")));

    const push = (fn, ms) => timers.current.push(setTimeout(fn, ms));
    push(() => onCovered && onCovered(), BLOOM + HOLD);          // swap route while covered
    push(() => setState("exit"), BLOOM + HOLD + SWAP);          // zoom out → reveal app
    push(() => setActive(false), BLOOM + HOLD + SWAP + EXIT);   // unmount once faded
  }, []);

  return (
    <BootContext.Provider value={boot}>
      {children}
      {active && <LoadingScreen state={state} />}
    </BootContext.Provider>
  );
}
