# Art Direction

**Target:** premium SNES-era pixel art at a 480×270 logical resolution, nearest-neighbor scaled.

## Pipeline
No image-generation service was used. All art is produced by an original procedural pipeline:
`npm run assets` → `scripts/generate-assets/*.mjs` draw pixel-by-pixel into RGBA buffers (Node +
`pngjs`) and write PNGs to `public/assets/`. Re-running is deterministic (seeded noise).

| Module | Output |
|---|---|
| `lib.mjs` | Palette ramps, Bitmap (lines, polygons, ellipses, outlines), Bayer dithering, value noise, sphere shading |
| `font.mjs` | Original variable-width 5×7 pixel font with lowercase, Δ, arrows (AngelCode XML) + title logo |
| `ui.mjs` | 9-slice panels/buttons/cards, 33 icons, cursor, mission patch, favicon, vignette, scanlines |
| `characters.mjs` | Kai (civilian / launch suit / EVA suit: idle, walk, wave, cheer, work), 4 townspeople, operators, 6 portraits |
| `oakland.mjs` | Dusk & night skies, skyline with clock tower, cathedral, port cranes and bridge over Lake Merritt with the Necklace of Lights; BART-style guideway and train; street with Victorians, Auntie Dee's Market, "THE TOWN" mural, rec center, lakeside pergola |
| `spacecraft.mjs` | 38 modular spacecraft parts, 3 launch vehicles with stages/boosters, pad, tower, clouds, hangar and mission-control interiors |
| `space.mjs` | Orthographic Earth from a hand-made land mask, Moon with maria, starfields, 3 lunar surfaces, reentry sky, ocean, flame/smoke/dust/plasma/splash sheets, parachutes, ship |

## Palette
Controlled 6–12 step ramps: sunset sky, deep space, greys, regolith, Oakland greens, brick, teal,
gold, red, orange, blue, purple and three skin ramps. UI uses navy panels with light-blue bevels and
gold accents (a nod to the Town's blue-and-gold).

## Principles
* Dark outlines on sprites; light from the upper-left; ordered dithering for gradients.
* Every scene has its own color identity (dusk orange Oakland, teal mission control, steel-blue
  hangar, black-and-grey Moon, blue Pacific) inside one shared palette.
* Animated details everywhere: train, walkers, lamp flicker, twinkling stars, operators, blinking
  consoles, crane hook, dust motes, flames, smoke, plasma, parachutes, confetti.

## Known weaknesses / next improvements
* Characters are 16×24: readable but simple; a 24×32 hero sprite would add personality.
* The lander in the landing scene is a 0.5× downscale; a dedicated small sprite would be crisper.
* Reentry composition (capsule + plasma) is functional rather than spectacular.
* Earth coastlines come from a coarse 5° mask.
