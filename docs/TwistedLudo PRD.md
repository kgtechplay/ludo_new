# Twisted Ludo PRD

## 1. Product Summary

Twisted Ludo is a browser-based multiplayer Ludo experience focused on:

- fast 2-player online play
- simple onboarding
- account-backed resume and history
- low-friction link sharing

The current product direction is:

- web first
- 2-player primary
- account-aware recovery
- `My Games` as the main control center after creation, pause, or resume

## 2. Product Goals

### Primary Goals

- make starting a game feel lightweight
- make returning to a saved game reliable for signed-in users
- keep the game accessible from laptop, tablet, and mobile browser sizes
- keep game state understandable at all times: waiting, in progress, paused, completed

### UX Goals

- single obvious sign-in entry for logged-out users
- clean top-right actions for signed-in users
- shareable game URLs that stay consistent across create, resume, and reopen flows
- minimal dead ends after pause, resume, or closing a lobby

## 3. Target Users

- friends playing a quick online Ludo match
- users who want to start on one browser and resume later
- users who expect a casual game to work cleanly on both desktop and phone browsers

## 4. Current Supported Scope

### In Scope

- sign-in / sign-up
- 2-player game creation
- join by URL
- waiting lobby
- real-time board updates
- pause / resume
- `My Games`
- database-backed game persistence

### Out of Scope For Now

- 4-player gameplay as a polished supported flow
- native mobile apps
- local pass-and-play
- social systems beyond link sharing

## 5. Core User Flows

### Flow A: Create Game

1. Signed-in user clicks `Create 2-Player Game`
2. Game is created and lobby popup opens
3. User can:
   - copy the share link
   - close the popup and return home
   - click `Start Game` to mark themselves ready

Expected result:

- after clicking `Start Game`, host is returned to `My Games`
- the game should appear there as `Waiting`

### Flow B: Join Shared URL

1. Player 2 opens the shared game URL
2. Player 2 joins the lobby
3. Player 2 clicks `Start Game`

Expected results:

- if player 1 is already ready, the game board loads
- if player 1 is not ready yet, player 2 remains in the waiting lobby

### Flow C: Reopen Waiting Game

1. User opens `My Games`
2. User clicks the waiting game ID
3. Lobby reopens

Expected results:

- if this user already clicked `Start Game`, their row shows `Ready`
- the start button is hidden for that user

### Flow D: Pause And Resume

1. Player pauses an active game
2. Game appears in `My Games`
3. Players resume later from `My Games` or copied URL

Expected results:

- all players must resume before gameplay continues
- once a player resumes, they should not be asked to resume again
- that player should see the game as `Waiting` until the others resume

## 6. Identity And Persistence Rules

### Signed-In Users

Signed-in users should be able to:

- persist waiting, active, paused, and completed games
- reopen games from `My Games`
- reclaim saved seats from a game URL
- resume later from another browser or device

### Guest Users

Guest users may still:

- join and play
- continue within the same browser session

But guest users are not guaranteed to:

- reclaim a paused game later on a fresh browser/device

Product implication:

- if a guest wants durable recovery, the UI should encourage sign-in before leaving or pausing

## 7. My Games Expectations

`My Games` is intended to be the main hub for saved matches.

It should show:

- waiting games
- in-progress games
- paused games
- completed games
- aborted games

Each entry should make it easy to:

- identify the game
- understand the current status
- reopen it when appropriate
- copy its URL when useful

Creator-only behavior:

- the creator should be able to delete the game from `My Games`

## 8. UI Principles

- mobile-friendly layouts without hiding critical actions
- clear status messaging
- icon-driven secondary actions where appropriate
- avoid duplicate buttons for the same action
- prefer a single canonical route into a game: its shared game URL / clickable game id

## 9. Current Product Constraints

- 4-player creation is disabled in the UI
- some multiplayer edge cases still need continued hardening around roll animation and turn sync
- guest recovery is intentionally weaker than signed-in recovery

## 10. Near-Term Priorities

- stabilize multiplayer turn-sync edge cases
- keep `My Games` and lobby flows consistent
- preserve account-backed resume reliability
- update docs and deployment instructions alongside behavior changes
