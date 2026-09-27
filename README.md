# Mini Among Us 3D

A single-player, browser-based 3D take on *Among Us*, built with [Three.js](https://threejs.org/). Explore a Skeld-style ship with AI crewmates, complete tasks, report bodies, vote out suspects — or play as the Impostor and hunt the crew yourself.

**▶ [Play now in your browser](https://raysonwang019-del.github.io/among-us-3d/)** — no download or setup needed. Works on desktop (keyboard controls).

No build step, no dependencies to install. Just static HTML + ES modules.

## Features

- **The Skeld layout** — 14 rooms (Cafeteria, Weapons, O2, Navigation, Shields, Comms, Storage, Admin, MedBay, Upper/Lower Engine, Reactor, Security, Electrical) joined by the same hallway network as the original map, with room props, mood lighting, and a starfield outside.
- **Lobbies of 4–15 players** — you plus 3–14 AI crewmates.
- **Impostor count scales with lobby size**:

  | Players | Impostors |
  |---------|-----------|
  | 4–6     | 1         |
  | 7–10    | 2         |
  | 11–15   | 3         |

- **Play either side** — each round you have a 40% chance of being an Impostor. If there are several, you're told who your fellow Impostors are, and NPC Impostors won't target you.
- **9 special roles** — one is assigned to you each round (see below). AI crewmates carry roles too, shown during meetings.
- **Tasks, bodies, meetings, and voting** — hold to complete tasks, report bodies to call an emergency meeting, and vote someone off.

## Running locally

Only needed if you want to modify the game — to just play, use the link above.

The game uses ES modules, so it must be served over HTTP (opening `index.html` directly via `file://` won't work). From the project folder:

**macOS / Linux**

```bash
python3 -m http.server 8321
```

**Windows** (PowerShell or Command Prompt) — Windows uses `python`, not `python3`:

```powershell
python -m http.server 8321
```

Then open <http://localhost:8321>. A `favicon.ico 404` line in the terminal is harmless. Any static file server works (`npx serve`, VS Code Live Server, etc.).

Three.js is loaded from the unpkg CDN, so an internet connection is needed on first load.

## Controls

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` / arrow keys | Move |
| `E` (hold) | Do a task when standing on a task pad |
| `R` | Report a nearby body |
| `Q` | Kill a nearby crewmate (Impostor only) |
| `F` / `V` / `T` / `G` | Role ability (depends on your role) |

## How to win

**As a Crewmate**
- Complete all 7 tasks, **or**
- Eject every Impostor through voting.
- You lose if an Impostor kills you or the crew is wiped out.

**As an Impostor**
- Eliminate every crewmate.
- You lose if the crew finishes their tasks first (shown as a progress bar that slows as crew die), or if a **witness** reaches the emergency button in the Cafeteria. Crewmates who see you kill get a red **!** and sprint to report — catch them first.

## Roles

### Crewmate roles

| Role | Key | Ability |
|------|-----|---------|
| **Engineer** | `F` | Jump between the 6 vents around the ship. 12s cooldown. |
| **Scientist** | `V` | Toggle a live vitals panel showing who is alive or dead. |
| **Noisemaker** | passive | When killed, an alarm lets you make one final accusation from the grave — name the Impostor to win. |
| **Tracker** | `T` | Tag a nearby crewmate and follow their position on a minimap. |
| **Detective** | passive | See the red footprint trail left by Impostors (fades after 10s). |
| **Guardian Angel** | `G` | Shield a nearby crewmate from kills for 12s. 20s cooldown. |

### Impostor roles

| Role | Key | Ability |
|------|-----|---------|
| **Shapeshifter** | `F` | Disguise as a random crewmate for 8s. Witnesses to a disguised kill eject *that crewmate* instead of you. 18s cooldown. |
| **Phantom** | `F` | Turn invisible for 6s — kills while invisible are never witnessed. 15s cooldown. |
| **Viper** | `Q` | Poison instead of kill. The victim dies 5s later with no witnesses. 12s cooldown. |

## Testing shortcuts

URL parameters let you skip the lobby or force a role:

| Parameter | Example | Effect |
|-----------|---------|--------|
| `players` | `?players=12` | Start directly with a lobby size (4–15) |
| `role` | `?role=impostor` / `?role=crew` | Force your side |
| `prole` | `?prole=Viper` | Force a specific role (must match your side) |

Example: <http://localhost:8321/?players=12&role=crew&prole=Detective>

## Project structure

```text
among-us-3d/
├── index.html      # Page shell, HUD, overlays (lobby, role reveal, meetings, end screen)
└── src/
    ├── main.js     # Game loop, player, AI crew/impostors, tasks, meetings, win conditions
    ├── roles.js    # All 9 role abilities, vitals panel, minimap
    └── world.js    # Skeld map layout, collision, props, lighting, crewmate model
```

## Tech

- [Three.js](https://threejs.org/) r160 via import map
- Vanilla JavaScript ES modules, no framework or bundler
- Procedural geometry and canvas-generated textures — no external art assets

## Disclaimer

This is an unofficial fan project for learning purposes. *Among Us* and its characters are trademarks of Innersloth LLC. This project is not affiliated with or endorsed by Innersloth.
