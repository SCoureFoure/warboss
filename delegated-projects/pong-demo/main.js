import { createGame, movePaddle, step } from './engine.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const state = createGame();

const keys = {
  KeyW: false,
  KeyS: false,
  ArrowUp: false,
  ArrowDown: false
};

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    event.preventDefault();
  }
  if (event.code in keys) {
    keys[event.code] = true;
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    event.preventDefault();
  }
  if (event.code in keys) {
    keys[event.code] = false;
  }
});

function draw() {
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.fillStyle = 'white';

  // Paddles
  ctx.fillRect(state.left.x, state.left.y, state.left.w, state.left.h);
  ctx.fillRect(state.right.x, state.right.y, state.right.w, state.right.h);

  // Ball
  ctx.fillRect(state.ball.x, state.ball.y, state.ball.size, state.ball.size);

  // Dashed center net line
  ctx.save();
  ctx.strokeStyle = 'white';
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(state.width / 2, 0);
  ctx.lineTo(state.width / 2, state.height);
  ctx.stroke();
  ctx.restore();

  // Scores
  ctx.font = '32px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(state.left.score), state.width / 2 - 60, 50);
  ctx.fillText(String(state.right.score), state.width / 2 + 60, 50);
}

function loop() {
  const leftDir = (keys.KeyS ? 1 : 0) + (keys.KeyW ? -1 : 0);
  const rightDir = (keys.ArrowDown ? 1 : 0) + (keys.ArrowUp ? -1 : 0);

  movePaddle(state, 'left', leftDir);
  movePaddle(state, 'right', rightDir);

  step(state);

  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
