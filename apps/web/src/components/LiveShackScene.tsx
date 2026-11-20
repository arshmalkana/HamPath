"use client";
import { useEffect, useState } from "react";
import { ShackScene, type ShackSceneProps } from "@hampath/ui";

/**
 * The dashboard's shack with a running clock. The first render uses the server's time (so the HTML
 * matches when it hydrates); then the clock and the map's grey line move on at each minute.
 */
export function LiveShackScene({ serverNow, ...props }: Omit<ShackSceneProps, "now"> & { serverNow: string }) {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    tick();
    // Line up with the minute boundary, then tick every minute.
    const first = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000) + 50,
    );
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);
  return <ShackScene now={now} {...props} />;
}
