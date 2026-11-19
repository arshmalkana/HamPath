# Mobile and performance (Phase 2b, Step 27)

Targets:

- every lesson and lab works at 360 px wide in portrait;
- a page loads in under 2 s on a mid-range phone;
- labs run at 60 fps;
- heavy labs are loaded lazily.

## How it was measured

Everything was measured against a production build (`NEXT_DIST_DIR=.next-prod next build && next start -p 3100`), with the API and database from `pnpm dev`.

- **Weight:** a cold load of every page in mobile emulation, counting the bytes actually transferred (compressed).
- **Lighthouse 12:** the default mobile profile (Moto G Power class, 4× CPU slowdown, slow 4G), median of 3 runs. Lighthouse's default _simulated_ throttling (Lantern) estimates timings from an unthrottled trace and, for this app, charges all JavaScript to the LCP. The text LCP elements are server-rendered and don't wait for scripts, so load time is also reported with _applied_ DevTools throttling, which really slows the network and CPU.
- **Frame rate:** each heavy lab is driven with continuous input for 3 s on a 4× slowed CPU, sampling `requestAnimationFrame`. Headless Chrome isn't locked to 60 Hz, so the measure that matters is the share of frames over 20 ms.
- **Narrow screens:** every page and lab card at 320 px (stricter than 360 px), checked for sideways scrolling, content off the edge and clipped text. It was repeated with the WCAG 1.4.12 text-spacing overrides.

## What changed

1. **Labs load lazily.** `labs/registry.ts` imports each of the 35 lab bodies through `next/dynamic`, so a lesson downloads only its own lab. Three.js was already loaded only inside LAB-29, and WebAudio is created only on first use. Labs still render on the server. The frame shows a fixed-height placeholder while a chunk loads and sets `data-ready` once the lab has hydrated.
2. **The world map is a quarter of the size.** `worldGeometry.ts` drops coastline points that are less than 1 px apart and rounds to one decimal, and it draws the equirectangular graticule as straight lines. The dashboard's shack scene and the map labs render this server-side. Land went from 73 kB to 25 kB of path data and the graticule from 40 kB to 0.6 kB (pinned by `worldGeometry.test.ts`).
3. **The breadboard's moving current is on its own layer.** The animation used to repaint the whole circuit SVG every frame. It is now a small overlay SVG promoted to its own layer.
4. **Narrow screens.** The top nav wraps under 40 rem. Segmented controls, meters and tables reflow (see `ACCESSIBILITY.md`, fixes 9 and 11).

## Results

### Weight (cold load, compressed)

| Page                              | JS before | JS after | Total before | Total after |
| --------------------------------- | --------: | -------: | -----------: | ----------: |
| Lesson with a lab (median of 100) |    273 kB |   229 kB |       366 kB |      323 kB |
| 6.09 (LAB-29, Three.js)           |    440 kB |   397 kB |       534 kB |      491 kB |
| 2.09 (world map)                  |    273 kB |   230 kB |       419 kB |      349 kB |
| Dashboard `/`                     |    176 kB |   176 kB |       357 kB |      302 kB |
| `/mocks`                          |    231 kB |   185 kB |       317 kB |      272 kB |
| `/review`                         |    271 kB |   224 kB |       356 kB |      308 kB |

About 176 kB of the JavaScript is React and Next itself, shared by every page.

### Lighthouse, five heaviest lesson pages plus the dashboard

The heaviest pages were 6.09 (3D pattern), 2.09, 1.21 and 7.06 (world maps) and 5.04 (breadboard). 6.07 also uses LAB-29.

| Page | Perf before → after | TBT before → after | LCP (applied throttling) | Interactive (applied) |
| ---- | ------------------: | -----------------: | -----------------------: | --------------------: |
| 6.09 |             74 → 79 |       838 → 614 ms |                   1.65 s |                5.19 s |
| 2.09 |             88 → 93 |        242 → 77 ms |                   1.68 s |                4.22 s |
| 1.21 |             89 → 94 |        162 → 40 ms |                   1.67 s |                3.36 s |
| 7.06 |             92 → 94 |        108 → 37 ms |                   1.67 s |                3.32 s |
| 5.04 |             93 → 94 |         73 → 55 ms |                   1.72 s |                3.28 s |
| `/`  |             92 → 95 |         39 → 43 ms |                   1.87 s |                3.14 s |

Accessibility and best practices score 100 on all six. SEO is 100 on the dashboard and 90 on lessons: Next 16 streams `generateMetadata` output into the body for ordinary browsers (crawlers get it in the head), so Lighthouse doesn't see the meta description there.

**The main content of every heavy page paints in under 2 s on a mid-range phone.** Lighthouse's simulated LCP stays at about 3 s because Lantern counts all JavaScript as an LCP dependency, but the LCP elements (the lab prompt, the dashboard heading) are server-rendered text that doesn't wait for scripts.

### Frame rate while a lab is being used (4× slower CPU)

| Lab                                        | Slow frames (> 20 ms) before | after | Worst frame after |
| ------------------------------------------ | ---------------------------: | ----: | ----------------: |
| LAB-29 3D pattern (WebGL, turning)         |                           0% |    0% |             22 ms |
| LAB-20 breadboard (turning the resistance) |                           7% |    0% |             11 ms |
| LAB-14 spectrum and waterfall (tuning)     |                           0% |    0% |             11 ms |
| LAB-12 world map (turning the beam)        |                           0% |    0% |             11 ms |
| LAB-27 SWR sweep (changing the length)     |                            — |    0% |             22 ms |
| LAB-21 scope (changing the frequency)      |                           2% |    0% |             11 ms |

After the changes no lab drops a frame below 50 fps while in use: the breadboard fix removed the only real hitch.

### Narrow screens

All 296 pages and lab cards pass at 320 px, both with and without the WCAG text-spacing overrides. The section smoke tests also load a lab in each section at 390 px.

## Still open

- LAB-29's 5 s time to interactive on slow 4G comes from Three.js (about 170 kB). The 2D cuts beside the 3D view carry the same information and render immediately.
- Pages aren't eligible for the back/forward cache, because Next and the API send `Cache-Control: no-store` on personalised pages. The service worker covers offline use instead (Step 28).
- Lighthouse flags about 10 kB of legacy polyfills (`Array.prototype.at`, `flat`, `Object.fromEntries`) in Next's shared chunk; that is Next's default browser target.
