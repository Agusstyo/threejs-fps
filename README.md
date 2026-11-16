# threejs-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Agusstyo/threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Agusstyo/threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Ashworks: Ember Yard is a round-based tactical FPS for the browser, built on three.js. Two teams of four fight over a dusk smelting yard: Ember Squad attacks with a plantable charge, the Warden Line defends two sites — the furnace hall and the container depot. Rounds are won by elimination or by the charge, money earned each round is spent in a buy phase on rifles, SMGs, a scattergun, armour and frag grenades, and every opponent is a bot that follows waypoint routes, holds posts, reacts to sight and gunfire, plants, defuses and throws frags back. The whole game is static files with a vendored three.js — no build step, no network calls — and every texture and sound is generated in code at load.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

## How to play

You lead Ember Squad and carry the charge. Each round opens with a 15-second buy phase: press 1–5 (or click the menu) to pick up a Longarm rifle, Badger SMG or Mule scattergun, a frag grenade and a plate vest. When the round goes live, push one of the two sites — the furnace hall in the west or the depot in the east — hold E inside the site circle to plant, then defend the 40-second fuse. If the charge drops, a teammate will fetch it; if the Wardens plant-kill your team or defuse, the round is theirs. First team to 5 rounds takes the match.

Move with WASD, aim with the mouse, right-click to aim down sights, R reloads, Ctrl crouches (tighter spread, lower profile), Shift sprints, Space jumps, G throws a frag, and the mouse wheel swaps weapons. Accuracy rewards stopping: spread grows hard while moving or airborne, and headshots pay a heavy multiplier.

---
<sub>Entered on [make.fun](https://make.fun/?ref=hh8nsv3m&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
