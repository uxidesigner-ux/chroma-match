# Game-feel pass

Scope: presentation only. Match rules, scores, deterministic replays, rewards,
phase durations and input availability remain unchanged. No new dependency.

Working hypothesis: graduated feedback and the player's own portrait will make
successful moves feel more rewarding. This is not a measured retention claim.

Acceptance criteria:
- Normal clears emit brief gem-coloured chips; special creation/strikes emit
  local rings and radial sparks, never a full-screen flash.
- Chains 2 / 3 / 4 / 6 have distinct emphasis. At 3+, the saved avatar joins
  the badge without consuming board space or intercepting input.
- Level clear / personal best opt into a finite celebration, not generic dialogs.
  Score and the next action remain immediately available.
- Particles, rings and floating text are bounded and cleared on leaving a run.
- System reduced motion applies immediately, including mid-run: no camera
  shake, flying particles, expanding rings, avatar movement or confetti.
  Score feedback remains stationary. Essential board state transitions remain.
- All three skins and four languages remain supported; mobile board target
  size is unchanged. Keyboard focus stays on the result action.
- Unit tests, production build, editor/release tests and browser checks pass.

Non-goals: special-gem fusion rules, progression rewards, skeletal avatar dance,
new sounds, paid assets, deployment. Avatar reactions animate the cached portrait;
they do not run a second real-time 3D scene over the game.

Motion: impact 360–480ms, combo entrance 340ms, portrait cheer 480ms,
result entrance 480ms, confetti one shot under 1500ms. No infinite decoration.
