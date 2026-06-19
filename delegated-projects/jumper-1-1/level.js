window.JUMPER = window.JUMPER || {};

(function() {
  var TILE = 32;
  var WIDTH = 200;
  var ROWS = 13;

  // Step 1: Create 2D array, all air
  var grid = [];
  for (var row = 0; row < ROWS; row++) {
    var newRow = [];
    for (var col = 0; col < WIDTH; col++) {
      newRow.push(' ');
    }
    grid.push(newRow);
  }

  // Step 2: GROUND (rows 11 and 12) except gaps at [70,72], [120,122], [150,151]
  var gaps = [[70, 72], [120, 122], [150, 151]];
  for (var col = 0; col < WIDTH; col++) {
    var isGap = false;
    for (var g = 0; g < gaps.length; g++) {
      if (col >= gaps[g][0] && col <= gaps[g][1]) {
        isGap = true;
        break;
      }
    }
    if (!isGap) {
      grid[11][col] = 'X';
      grid[12][col] = 'X';
    }
  }

  // Step 3: PIPES (2 cols wide, col and col+1)
  // Pipes: (col, heightInTiles)
  var pipes = [[28, 2], [38, 2], [46, 3], [57, 3]];
  for (var p = 0; p < pipes.length; p++) {
    var pipeCol = pipes[p][0];
    var pipeHeight = pipes[p][1];
    var topRow = 11 - pipeHeight; // top row of pipe
    for (var row = topRow; row <= 10; row++) {
      grid[row][pipeCol] = 'P';
      grid[row][pipeCol + 1] = 'P';
    }
  }

  // Step 4: QUESTION blocks '?'
  var questions = [[16, 7], [21, 7], [23, 7], [22, 3]];
  for (var q = 0; q < questions.length; q++) {
    grid[questions[q][1]][questions[q][0]] = '?';
  }

  // Step 5: BRICK blocks 'B'
  var bricks = [[20, 7], [22, 7], [24, 7], [78, 7], [79, 7], [80, 7]];
  for (var b = 0; b < bricks.length; b++) {
    grid[bricks[b][1]][bricks[b][0]] = 'B';
  }

  // Step 6: STAIRCASE before flag
  // For step i=1..6, fill column (180+i-1) from row (11-i) down to row 10 with 'X'
  for (var step = 1; step <= 6; step++) {
    var stairCol = 180 + step - 1; // 180, 181, 182, 183, 184, 185
    var startRow = 11 - step;      // 10, 9, 8, 7, 6, 5
    for (var row = startRow; row <= 10; row++) {
      grid[row][stairCol] = 'X';
    }
  }

  // Step 7: FLAGPOLE 'F' at column 190, rows 4..10
  for (var row = 4; row <= 10; row++) {
    grid[row][190] = 'F';
  }

  // Step 8: GOOMBA spawns 'g' at row 10
  var goombaSpawns = [40, 51, 97, 99, 130];
  for (var g = 0; g < goombaSpawns.length; g++) {
    grid[10][goombaSpawns[g]] = 'g';
  }

  // Convert grid rows to strings
  var levelRows = [];
  for (var row = 0; row < ROWS; row++) {
    levelRows.push(grid[row].join(''));
  }

  // Attach to window.JUMPER
  window.JUMPER.level = {
    TILE: 32,
    WIDTH: 200,
    ROWS: 13,
    LEVEL_ROWS: levelRows,
    SPAWN: { x: 64, y: 288 },
    isSolid: function(ch) {
      return ch === 'X' || ch === 'B' || ch === '?' || ch === 'P';
    },
    tileAt: function(col, row) {
      if (row < 0 || row >= 13 || col < 0 || col >= 200) return ' ';
      return this.LEVEL_ROWS[row][col];
    }
  };
})();
