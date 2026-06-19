window.JUMPER = window.JUMPER || {};

(function () {
  var PHYS = { gravity: 0.8, moveSpeed: 3.2, jumpVel: -13, maxFall: 12 };

  function isSolidPixel(px, py, solidAt) {
    return solidAt(Math.floor(px / 32), Math.floor(py / 32));
  }

  function stepBody(body, input, solidAt) {
    // 1. Horizontal velocity from input (overwrite each frame, no momentum)
    if (input.left && !input.right) {
      body.vx = -PHYS.moveSpeed;
    } else if (input.right && !input.left) {
      body.vx = PHYS.moveSpeed;
    } else {
      body.vx = 0;
    }

    // 2. Jump (only from grounded)
    if (input.jump && body.grounded) {
      body.vy = PHYS.jumpVel;
      body.grounded = false;
    }

    // 3. Gravity
    body.vy = Math.min(body.vy + PHYS.gravity, PHYS.maxFall);

    // 4. Horizontal move + resolve
    body.x += body.vx;

    if (body.vx !== 0) {
      var topRow = Math.floor(body.y / 32);
      var bottomRow = Math.floor((body.y + body.h - 0.01) / 32);

      if (body.vx > 0) {
        var rightCol = Math.floor((body.x + body.w - 0.01) / 32);
        for (var r = topRow; r <= bottomRow; r++) {
          if (solidAt(rightCol, r)) {
            body.x = rightCol * 32 - body.w;
            body.vx = 0;
            break;
          }
        }
      } else if (body.vx < 0) {
        var leftCol = Math.floor(body.x / 32);
        for (var r2 = topRow; r2 <= bottomRow; r2++) {
          if (solidAt(leftCol, r2)) {
            body.x = (leftCol + 1) * 32;
            body.vx = 0;
            break;
          }
        }
      }
    }

    // 5. Vertical move + resolve
    body.grounded = false;
    body.y += body.vy;

    if (body.vy !== 0) {
      var leftColV = Math.floor(body.x / 32);
      var rightColV = Math.floor((body.x + body.w - 0.01) / 32);

      if (body.vy > 0) {
        var bottomRowV = Math.floor((body.y + body.h - 0.01) / 32);
        for (var c = leftColV; c <= rightColV; c++) {
          if (solidAt(c, bottomRowV)) {
            body.y = bottomRowV * 32 - body.h;
            body.vy = 0;
            body.grounded = true;
            break;
          }
        }
      } else if (body.vy < 0) {
        var topRowV = Math.floor(body.y / 32);
        for (var c2 = leftColV; c2 <= rightColV; c2++) {
          if (solidAt(c2, topRowV)) {
            body.y = (topRowV + 1) * 32;
            body.vy = 0;
            break;
          }
        }
      }
    }

    return body;
  }

  window.JUMPER.physics = {
    PHYS: PHYS,
    stepBody: stepBody
  };
})();
