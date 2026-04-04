# Lessons

## 2026-04-04

- When a revamp route goes blank, do not keep layering new layout code onto it. Reduce it to a known-good data-backed route first, then add visual sections back incrementally.
- If Next dev starts throwing missing chunk errors like `Cannot find module './819.js'`, treat it as a `.next` cache/runtime corruption issue first. Stop the dev server, remove `frontend/.next`, and restart `next dev` cleanly without mixing old build artifacts into it.
