# Occlusion Lab

**A virtual semi-adjustable articulator in the browser.** Move a 3D mandible through centric, protrusive, lateral and chewing movements, and watch articulating-paper marks, guidance and interferences appear on the teeth, with a live Gothic arch tracing.

Built for BDS students who want to *see* why condylar inclination, Bennett angle and the incisal guide table change which teeth touch.

> **Teaching model, not for clinical use.** Tooth forms are simplified and the articulator kinematics are an idealised model. Do not use it to diagnose, plan or adjust real occlusion.

Created by **Swapnil Agrawal (BDS intern)**.

## Features

- **3D articulator** in an ink-pop toon style: casts on mounting stone, arcon-style frame, condylar housings and incisal pin on the guide table. Orbit, or jump to ¾ / Front / Right / Left / Lingual views.
- **Movements**: Centric, Protrusive, R lateral, L lateral, Open, and a **Chew ▶** cycle (two strokes each side), plus a drag pad for any excursion in between.
- **Articulator settings**: condylar inclination, Bennett angle, incisal guide table angle, articulating paper thickness (20 to 200 µm), and quick setups (Average values, Flat paths / table only, Steep condyles).
- **Teeth guide toggle**: on, the mandible rides up on whichever teeth touch first (the pin lifts off the table); off, the table and condylar paths alone steer it, so colliding cusps show as black overlap marks with the depth that would need reducing.
- **Paper marks**: blue centric stops, red excursive marks, black overlaps, darker core where the gap is smallest. A pale halo around each mark makes them readable at a glance (display aid only; the coloured core is the real contact). Live **contact pins** in 3D show which teeth are touching right now, even when the contact is hidden between the arches.
- **Marks view**: both arches opened like a book, occlusal surfaces up, with excursive marks kept until you clear them.
- **Contacts tab**: FDI dental chart of touching teeth, and plain-language verdicts: canine guidance, group function, anterior guidance, working-side and non-working (balancing) interferences, pin lift, overlap depth.
- **Gothic arch tracing** of the incisal point or the central bearing point, with the plate on upper or lower.
- Works on desktop and phone (bottom sheet layout).

## Run it

Needs Node 18+.

```bash
npm install
npm run dev       # local dev server (Vite)
npm run build     # static build in dist/
npm run preview   # serve the build
```

`dist/` is a plain static site and can be hosted anywhere.

### Screenshots (optional)

`scripts/shot.mjs` serves `dist/` and captures preset states with Playwright (Chromium, SwiftShader WebGL) into `shots/`:

```bash
npm run build
node scripts/shot.mjs              # all shots
node scripts/shot.mjs flat-table   # one shot
```

Each shot has its own timeout (`SHOT_MS`, default 90 s) and a failing shot is logged and skipped. Set `PLAYWRIGHT_MODULE` to point at a Playwright install if it is not at the default path. Test hooks are on `window.__ol` (`go`, `pose`, `setParams`, `view`, `tab`, `summary`, `clearMarks`, `clearTrace`).

## Code map

| File | What it does |
|---|---|
| `src/teeth.js` | Procedural tooth crowns (FDI 1 to 7, both arches) and arch curves |
| `src/model.js` | Builds and seats both arches in centric, gums, reference points |
| `src/heightfield.js` | Rasterised height fields for fast occlusal gap queries |
| `src/engine.js` | Articulator kinematics, contact solve, guidance and interference analysis |
| `src/scene.js` | Toon materials, ink outlines, casts and articulator frame |
| `src/main.js` | UI, paper marks, drag pad, Gothic arch, rendering loop |

Clinical assumptions behind the model are listed in [NOTES.md](NOTES.md).

## Credit

Concept, dental review and design direction: Swapnil Agrawal (BDS intern). Built with [three.js](https://threejs.org) and [Vite](https://vitejs.dev).
