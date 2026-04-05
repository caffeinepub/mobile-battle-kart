# Mobile Battle Kart

## Current State
New project. Empty workspace.

## Requested Changes (Diff)

### Add
- Full-screen canvas 2D top-down kart battle game
- Player kart with lime green color, moves with virtual joystick
- Virtual joystick (bottom-left) for movement/direction
- Red shoot button (bottom-right) to fire bullets
- Bullet projectiles fired in facing direction
- Enemy AI karts that move and shoot at the player
- Collision detection: bullets hit karts, karts hit walls/obstacles
- Arena with walls and obstacles
- Health system for player and enemies
- Score display at top
- Game over screen with restart
- Keyboard controls as fallback (WASD/arrows + space)

### Modify
N/A

### Remove
N/A

## Implementation Plan
1. Create Game component using Canvas API with requestAnimationFrame loop
2. Implement player kart: position, angle, speed, health
3. Implement virtual joystick touch controls
4. Implement shoot button with bullet spawning
5. Add enemy karts with basic AI (chase + shoot)
6. Add arena walls and obstacle tiles
7. Collision detection for bullets vs karts, karts vs walls
8. Score tracking, HUD overlay (health bar, score)
9. Game over / restart flow
10. Keyboard fallback controls
