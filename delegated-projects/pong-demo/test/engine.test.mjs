import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, movePaddle, step } from '../engine.js';

test('createGame returns the fixed initial state', () => {
  assert.deepEqual(createGame(), {
    width: 800,
    height: 600,
    paddleSpeed: 8,
    ball: { x: 394, y: 294, vx: 5, vy: 3, size: 12 },
    left: { x: 20, y: 250, w: 12, h: 100, score: 0 },
    right: { x: 768, y: 250, w: 12, h: 100, score: 0 },
  });
});

test('movePaddle moves down by paddleSpeed', () => {
  const s = createGame();
  movePaddle(s, 'left', 1);
  assert.equal(s.left.y, 258);
});

test('movePaddle clamps at top (y never below 0)', () => {
  const s = createGame();
  s.left.y = 4;
  movePaddle(s, 'left', -1);
  assert.equal(s.left.y, 0);
});

test('movePaddle clamps at bottom (y never above height-h)', () => {
  const s = createGame();
  s.right.y = 498;
  movePaddle(s, 'right', 1);
  assert.equal(s.right.y, 500);
});

test('step advances ball by its velocity', () => {
  const s = createGame();
  step(s);
  assert.equal(s.ball.x, 399);
  assert.equal(s.ball.y, 297);
});

test('step bounces ball off the top wall', () => {
  const s = createGame();
  s.ball = { x: 400, y: 1, vx: 0, vy: -3, size: 12 };
  step(s);
  assert.equal(s.ball.y, 0);
  assert.equal(s.ball.vy, 3);
});

test('step bounces ball off the bottom wall', () => {
  const s = createGame();
  s.ball = { x: 400, y: 588, vx: 0, vy: 3, size: 12 };
  step(s);
  assert.equal(s.ball.y, 588);
  assert.equal(s.ball.vy, -3);
});

test('step reflects ball off the left paddle and repositions it outside', () => {
  const s = createGame();
  s.ball = { x: 33, y: 300, vx: -5, vy: 0, size: 12 };
  step(s);
  assert.equal(s.ball.vx, 5);
  assert.equal(s.ball.x, 32);
});

test('step: ball past right edge scores for left and serves toward right', () => {
  const s = createGame();
  s.ball = { x: 786, y: 300, vx: 5, vy: 0, size: 12 };
  s.right.y = 0; // keep paddle clear of the ball path
  step(s);
  assert.equal(s.left.score, 1);
  assert.equal(s.right.score, 0);
  assert.equal(s.ball.x, 394);
  assert.equal(s.ball.vx, 5);
});

test('step: ball past left edge scores for right and serves toward left', () => {
  const s = createGame();
  s.ball = { x: 2, y: 300, vx: -5, vy: 0, size: 12 };
  s.left.y = 0; // keep paddle clear of the ball path
  step(s);
  assert.equal(s.right.score, 1);
  assert.equal(s.left.score, 0);
  assert.equal(s.ball.x, 394);
  assert.equal(s.ball.vx, -5);
});
