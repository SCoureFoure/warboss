window.JUMPER = window.JUMPER || {};

(function () {
  var TILE = 32;
  var COLS_VISIBLE = 25;
  var ROWS_VISIBLE = 13;
  var LEVEL_PX_W = window.JUMPER.level.WIDTH * TILE; // 6400

  var canvas, ctx;
  var level = window.JUMPER.level;
  var physics = window.JUMPER.physics;

  var player = {
    x: level.SPAWN.x,
    y: level.SPAWN.y,
    w: 24,
    h: 30,
    vx: 0,
    vy: 0,
    grounded: false
  };

  var goombaSpawns = []; // { x, y, w, h, vx, vy, alive, sx, sy }
  var goombas = [];

  var keys = {};
  var won = false;
  var camX = 0;

  function buildGoombas() {
    goombaSpawns = [];
    for (var row = 0; row < level.ROWS; row++) {
      var rowStr = level.LEVEL_ROWS[row];
      for (var col = 0; col < level.WIDTH; col++) {
        if (rowStr[col] === 'g') {
          goombaSpawns.push({
            x: col * 32 + 2,
            y: row * 32,
            w: 28,
            h: 28,
            vx: -1,
            vy: 0,
            alive: true,
            sx: col * 32 + 2,
            sy: row * 32
          });
        }
      }
    }
    goombas = goombaSpawns;
  }

  function solidAt(col, row) {
    return level.isSolid(level.tileAt(col, row));
  }

  function solidAtPx(px, py) {
    return solidAt(Math.floor(px / 32), Math.floor(py / 32));
  }

  function buildInput() {
    return {
      left: !!(keys['a'] || keys['arrowleft']),
      right: !!(keys['d'] || keys['arrowright']),
      jump: !!(keys[' '] || keys['spacebar'] || keys['space'] || keys['w'] || keys['arrowup'])
    };
  }

  function respawn() {
    player.x = level.SPAWN.x;
    player.y = level.SPAWN.y;
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;

    for (var i = 0; i < goombas.length; i++) {
      var g = goombas[i];
      g.alive = true;
      g.x = g.sx;
      g.y = g.sy;
      g.vx = -1;
      g.vy = 0;
    }
  }

  function updateGoomba(g) {
    if (!g.alive) return;

    // gravity
    g.vy = Math.min(g.vy + 0.8, 12);

    // horizontal
    var prevX = g.x;
    g.x += g.vx;
    var leadingX = g.vx < 0 ? g.x : g.x + g.w;
    if (solidAtPx(leadingX, g.y + g.h / 2)) {
      g.x = prevX;
      g.vx = -g.vx;
    }

    // vertical
    g.y += g.vy;
    if (solidAtPx(g.x + g.w / 2, g.y + g.h)) {
      g.y = Math.floor((g.y + g.h) / 32) * 32 - g.h;
      g.vy = 0;
    }
  }

  function update() {
    var input = buildInput();

    if (!won) {
      physics.stepBody(player, input, solidAt);

      for (var i = 0; i < goombas.length; i++) {
        updateGoomba(goombas[i]);
      }

      // player vs goomba
      for (var j = 0; j < goombas.length; j++) {
        var g = goombas[j];
        if (!g.alive) continue;
        var overlap = player.x < g.x + g.w && player.x + player.w > g.x &&
                      player.y < g.y + g.h && player.y + player.h > g.y;
        if (overlap) {
          if (player.vy > 0 && (player.y + player.h - g.y) < 18) {
            g.alive = false;
            player.vy = -8;
          } else {
            respawn();
            break;
          }
        }
      }

      // fall death
      if (player.y > 416) {
        respawn();
      }

      // win check
      var centerCol = Math.floor((player.x + player.w / 2) / 32);
      var centerRow = Math.floor((player.y + player.h / 2) / 32);
      if (level.tileAt(centerCol, centerRow) === 'F') {
        won = true;
      }
    }

    // camera
    camX = player.x + player.w / 2 - 400;
    if (camX < 0) camX = 0;
    if (camX > LEVEL_PX_W - 800) camX = LEVEL_PX_W - 800;
    camX = Math.round(camX);
  }

  function drawTile(ch, col, row) {
    var px = col * 32 - camX;
    var py = row * 32;

    if (ch === 'X') {
      ctx.fillStyle = '#c84c0c';
      ctx.fillRect(px, py, 32, 32);
      ctx.fillStyle = '#e08858';
      ctx.fillRect(px, py, 32, 4);
    } else if (ch === 'B') {
      ctx.fillStyle = '#b5651d';
      ctx.fillRect(px, py, 32, 32);
    } else if (ch === '?') {
      ctx.fillStyle = '#fac000';
      ctx.fillRect(px, py, 32, 32);
      ctx.fillStyle = '#7a4a00';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', px + 16, py + 18);
    } else if (ch === 'P') {
      ctx.fillStyle = '#00a800';
      ctx.fillRect(px, py, 32, 32);
    } else if (ch === 'F') {
      ctx.fillStyle = '#dddddd';
      ctx.fillRect(px + 14, py, 4, 32);
      if (row === 4) {
        ctx.fillStyle = '#00a800';
        ctx.beginPath();
        ctx.moveTo(px + 18, py + 2);
        ctx.lineTo(px + 18, py + 14);
        ctx.lineTo(px + 32, py + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function render() {
    // sky
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var c0 = Math.max(0, Math.min(199, Math.floor(camX / 32)));
    var c1 = Math.max(0, Math.min(199, c0 + 26));

    for (var c = c0; c <= c1; c++) {
      for (var r = 0; r < ROWS_VISIBLE; r++) {
        var ch = level.tileAt(c, r);
        if (ch === ' ' || ch === 'g') continue;
        drawTile(ch, c, r);
      }
    }

    // goombas
    for (var i = 0; i < goombas.length; i++) {
      var g = goombas[i];
      if (!g.alive) continue;
      ctx.fillStyle = '#8b4513';
      ctx.fillRect(g.x - camX, g.y, 28, 28);
      ctx.fillStyle = '#000000';
      ctx.fillRect(g.x - camX + 6, g.y + 10, 4, 4);
      ctx.fillRect(g.x - camX + 18, g.y + 10, 4, 4);
    }

    // player
    ctx.fillStyle = '#e03020';
    ctx.fillRect(player.x - camX, player.y, 24, 30);
    ctx.fillStyle = '#000000';
    ctx.fillRect(player.x - camX + 4, player.y + 6, 4, 4);
    ctx.fillRect(player.x - camX + 16, player.y + 6, 4, 4);

    if (won) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2 - 20);
      ctx.font = '16px sans-serif';
      ctx.fillText('refresh to play again', canvas.width / 2, canvas.height / 2 + 30);
    }
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    var k = e.key.toLowerCase();
    if (k === ' ' || k === 'spacebar' || e.code === 'Space' ||
        k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') {
      e.preventDefault();
    }
    keys[k] = true;
  }

  function onKeyUp(e) {
    var k = e.key.toLowerCase();
    keys[k] = false;
  }

  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');

    buildGoombas();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    requestAnimationFrame(loop);
  }

  window.addEventListener('load', init);
})();
