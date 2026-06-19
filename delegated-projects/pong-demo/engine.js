export function createGame() {
  return {
    width: 800,
    height: 600,
    paddleSpeed: 8,
    ball: { x: 394, y: 294, vx: 5, vy: 3, size: 12 },
    left: { x: 20, y: 250, w: 12, h: 100, score: 0 },
    right: { x: 768, y: 250, w: 12, h: 100, score: 0 }
  };
}

export function movePaddle(state, side, dir) {
  if (side !== 'left' && side !== 'right') {
    return state;
  }

  const paddle = state[side];
  paddle.y = paddle.y + dir * state.paddleSpeed;

  // Clamp to [0, state.height - paddle.h]
  if (paddle.y < 0) {
    paddle.y = 0;
  } else if (paddle.y > state.height - paddle.h) {
    paddle.y = state.height - paddle.h;
  }

  return state;
}

export function step(state) {
  // Phase 1: Move
  state.ball.x += state.ball.vx;
  state.ball.y += state.ball.vy;

  // Phase 2: Walls (top/bottom)
  if (state.ball.y <= 0) {
    state.ball.y = 0;
    state.ball.vy = -state.ball.vy;
  }
  if (state.ball.y + state.ball.size >= state.height) {
    state.ball.y = state.height - state.ball.size;
    state.ball.vy = -state.ball.vy;
  }

  // Phase 3: Paddle reflection
  // LEFT paddle
  if (state.ball.vx < 0) {
    const p = state.left;
    if (state.ball.x <= p.x + p.w &&
        state.ball.x + state.ball.size >= p.x &&
        state.ball.y + state.ball.size >= p.y &&
        state.ball.y <= p.y + p.h) {
      state.ball.vx = -state.ball.vx;
      state.ball.x = p.x + p.w;
    }
  }

  // RIGHT paddle
  if (state.ball.vx > 0) {
    const p = state.right;
    if (state.ball.x <= p.x + p.w &&
        state.ball.x + state.ball.size >= p.x &&
        state.ball.y + state.ball.size >= p.y &&
        state.ball.y <= p.y + p.h) {
      state.ball.vx = -state.ball.vx;
      state.ball.x = p.x - state.ball.size;
    }
  }

  // Phase 4: Scoring
  if (state.ball.x < 0) {
    state.right.score += 1;
    state.ball.x = 394;
    state.ball.y = 294;
    state.ball.vy = 3;
    state.ball.vx = -5;
  } else if (state.ball.x + state.ball.size > state.width) {
    state.left.score += 1;
    state.ball.x = 394;
    state.ball.y = 294;
    state.ball.vy = 3;
    state.ball.vx = 5;
  }

  return state;
}
