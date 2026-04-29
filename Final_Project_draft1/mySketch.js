// Companion Spirit + Webcam + Hand Tracking
// Final improved version:
// - Draw with index finger
// - Pinch index + thumb to create spirit
// - Canvas button: Restart
// - Gesture candy: fist -> open palm creates candy on fingertip
// - Canvas button: Ball
// - Pinch to hold ball, release to throw
// - Poke spirit to change color

let video;
let handPose;
let hands = [];

let drawing = [];
let creature = null;
let mode = "draw"; // draw / companion

let fingertip = null;
let thumbtip = null;
let lastFingertip = null;
let fingerVel = null;

let handPoints = [];

let handVisibleFrames = 0;

let candy = null;
let ball = null;

let pinchNow = false;
let pinchPrev = false;

let palmState = "unknown"; // unknown / fist / open
let previousPalmState = "unknown";
let candyCooldown = 0;

let uiButtons = [];

const SAFE_MARGIN = 70;
const MAX_DRAW_JUMP = 55;
const MIN_DRAW_DISTANCE = 4;

function preload() {
  handPose = ml5.handPose();
}

function setup() {
  createCanvas(800, 600);

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  handPose.detectStart(video, gotHands);

  textAlign(CENTER, CENTER);

  uiButtons = [
    { label: "Restart", x: 20, y: 20, w: 90, h: 34, action: "restart" },
    { label: "Ball", x: 120, y: 20, w: 70, h: 34, action: "ball" }
  ];
}

function gotHands(results) {
  hands = results;
}

function draw() {
  background(0);

  drawMirroredVideo();
  drawOverlay();

  updateHandPoints();
  updateGestureState();

  drawHandDebug();

  if (mode === "draw") {
    updateDrawing();
    drawCurrentPath();
  }

  if (mode === "companion" && creature) {
    updateCandyGesture();
    updateCandy();
    updateBall();

    creature.update();
    creature.display();

    if (fingertip) {
      creature.checkFingerInteraction(fingertip.x, fingertip.y);
    }

    drawCandy();
    drawBall();
  }

  drawInstructions();
  drawCanvasButtons();

  pinchPrev = pinchNow;
  previousPalmState = palmState;

  if (fingertip) {
    lastFingertip = fingertip.copy();
  }

  if (candyCooldown > 0) {
    candyCooldown--;
  }
}

// ------------------------------
// Camera and Hand Tracking
// ------------------------------

function drawMirroredVideo() {
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();
}

function drawOverlay() {
  noStroke();
  fill(0, 95);
  rect(0, 0, width, height);
}

function updateHandPoints() {
  fingertip = null;
  thumbtip = null;
  fingerVel = createVector(0, 0);
  handPoints = [];

  if (hands.length > 0) {
    let hand = hands[0];

    for (let i = 0; i < hand.keypoints.length; i++) {
      let kp = hand.keypoints[i];
      handPoints[i] = createVector(width - kp.x, kp.y);
    }

    fingertip = handPoints[8];
    thumbtip = handPoints[4];

    if (lastFingertip) {
      fingerVel = p5.Vector.sub(fingertip, lastFingertip);
    }

    handVisibleFrames++;
    palmState = detectPalmState();
  } else {
    handVisibleFrames = 0;
    lastFingertip = null;
    palmState = "unknown";
  }
}

function updateGestureState() {
  pinchNow = isPinching();
}

function isPinching() {
  if (!fingertip || !thumbtip) return false;
  return dist(fingertip.x, fingertip.y, thumbtip.x, thumbtip.y) < 35;
}

function detectPalmState() {
  if (handPoints.length < 21) return "unknown";

  // Use palm center instead of wrist.
  // This works better when the palm faces the camera.
  let wrist = handPoints[0];
  let indexMCP = handPoints[5];
  let middleMCP = handPoints[9];
  let ringMCP = handPoints[13];
  let pinkyMCP = handPoints[17];

  let palmCenter = createVector(
    (wrist.x + indexMCP.x + middleMCP.x + ringMCP.x + pinkyMCP.x) / 5,
    (wrist.y + indexMCP.y + middleMCP.y + ringMCP.y + pinkyMCP.y) / 5
  );

  let handScale = dist(wrist.x, wrist.y, middleMCP.x, middleMCP.y);
  if (handScale < 10) return "unknown";

  // For each finger:
  // If fingertip is much farther from palm center than its base knuckle,
  // the finger is probably extended.
  let fingers = [
    { tip: 8, base: 5 },   // index
    { tip: 12, base: 9 },  // middle
    { tip: 16, base: 13 }, // ring
    { tip: 20, base: 17 }  // pinky
  ];

  let extendedCount = 0;
  let foldedCount = 0;

  for (let f of fingers) {
    let tip = handPoints[f.tip];
    let base = handPoints[f.base];

    let tipDist = dist(tip.x, tip.y, palmCenter.x, palmCenter.y);
    let baseDist = dist(base.x, base.y, palmCenter.x, palmCenter.y);

    let ratio = tipDist / max(baseDist, 1);

    if (ratio > 1.55) {
      extendedCount++;
    }

    if (ratio < 1.25) {
      foldedCount++;
    }
  }

  // Thumb is not included because thumb direction changes a lot,
  // especially when palm faces the screen.

  if (extendedCount >= 3) {
    return "open";
  }

  if (foldedCount >= 3) {
    return "fist";
  }

  return "unknown";
}

function drawHandDebug() {
  if (fingertip) {
    noStroke();

    if (mode === "draw") {
      if (canDrawNow()) {
        fill(255, 230, 80);
      } else {
        fill(255, 80, 80);
      }
    } else {
      fill(255, 230, 80);
    }

    circle(fingertip.x, fingertip.y, 18);
  }

  if (thumbtip) {
    noStroke();
    fill(120, 220, 255);
    circle(thumbtip.x, thumbtip.y, 14);
  }

  if (mode === "companion" && hands.length > 0) {
    fill(255);
    noStroke();
    textSize(12);
    text("Hand: " + palmState, width - 85, 35);
  }
}

// ------------------------------
// Drawing Mode
// ------------------------------

function isInsideSafeArea(p) {
  if (!p) return false;

  return (
    p.x > SAFE_MARGIN &&
    p.x < width - SAFE_MARGIN &&
    p.y > SAFE_MARGIN &&
    p.y < height - SAFE_MARGIN
  );
}

function canDrawNow() {
  if (!fingertip) return false;
  if (!isInsideSafeArea(fingertip)) return false;
  if (handVisibleFrames < 8) return false;
  if (fingerVel && fingerVel.mag() > MAX_DRAW_JUMP) return false;
  if (pinchNow) return false;

  return true;
}

function updateDrawing() {
  if (!fingertip) return;

  if (canDrawNow()) {
    if (drawing.length === 0) {
      drawing.push(fingertip.copy());
    } else {
      let last = drawing[drawing.length - 1];
      let d = dist(fingertip.x, fingertip.y, last.x, last.y);

      if (d > MIN_DRAW_DISTANCE && d < MAX_DRAW_JUMP) {
        drawing.push(fingertip.copy());
      }
    }

    if (drawing.length > 280) {
      drawing.shift();
    }
  }

  // Pinch once to create spirit.
  if (pinchNow && !pinchPrev && drawing.length > 20) {
    creature = new Spirit(drawing);
    mode = "companion";
    candy = null;
    ball = null;
  }
}

function drawCurrentPath() {
  // Safe drawing area.
  noFill();
  stroke(255, 70);
  strokeWeight(1);
  rect(SAFE_MARGIN, SAFE_MARGIN, width - SAFE_MARGIN * 2, height - SAFE_MARGIN * 2, 18);

  // Current drawing path.
  noFill();
  stroke(255, 230);
  strokeWeight(5);

  beginShape();
  for (let p of drawing) {
    vertex(p.x, p.y);
  }
  endShape();

  if (pinchNow) {
    fill(255);
    noStroke();
    textSize(18);
    text("Creating spirit...", width / 2, height - 45);
  }
}

// ------------------------------
// Canvas Buttons
// ------------------------------

function drawCanvasButtons() {
  push();

  textAlign(CENTER, CENTER);
  textSize(13);

  for (let b of uiButtons) {
    let hovering =
      mouseX > b.x &&
      mouseX < b.x + b.w &&
      mouseY > b.y &&
      mouseY < b.y + b.h;

    noStroke();

    if (hovering) {
      fill(255, 235);
    } else {
      fill(255, 180);
    }

    rect(b.x, b.y, b.w, b.h, 10);

    fill(0);
    text(b.label, b.x + b.w / 2, b.y + b.h / 2);
  }

  pop();
}

function mousePressed() {
  for (let b of uiButtons) {
    let inside =
      mouseX > b.x &&
      mouseX < b.x + b.w &&
      mouseY > b.y &&
      mouseY < b.y + b.h;

    if (inside) {
      if (b.action === "restart") {
        restartProject();
      }

      if (b.action === "ball") {
        spawnBall();
      }

      return false;
    }
  }
}

function restartProject() {
  drawing = [];
  creature = null;
  candy = null;
  ball = null;
  mode = "draw";
  handVisibleFrames = 0;
  lastFingertip = null;
  palmState = "unknown";
  previousPalmState = "unknown";
}

// ------------------------------
// Candy Gesture
// ------------------------------

function updateCandyGesture() {
  if (!creature) return;
  if (!fingertip) return;
  if (candyCooldown > 0) return;

  // Gesture: fist -> open palm
  // This creates one candy on the index fingertip.
  if (previousPalmState === "fist" && palmState === "open") {
    spawnCandy();
    candyCooldown = 45;
  }
}

function spawnCandy() {
  if (!fingertip) return;
  if (mode !== "companion") return;

  candy = {
    pos: fingertip.copy(),
    eaten: false
  };
}

function updateCandy() {
  if (!candy || !fingertip || !creature) return;

  // Candy follows fingertip.
  candy.pos = p5.Vector.lerp(candy.pos, fingertip, 0.35);

  let d = dist(candy.pos.x, candy.pos.y, creature.pos.x, creature.pos.y);

  if (d < creature.size * 0.65) {
    creature.feed();
    candy = null;
  }
}

function drawCandy() {
  if (!candy) return;

  push();
  translate(candy.pos.x, candy.pos.y);

  let pulse = 1 + sin(frameCount * 0.15) * 0.08;
  scale(pulse);

  noStroke();

  fill(255, 130, 190);
  circle(0, 0, 22);

  fill(255, 245, 120);
  circle(-5, -4, 5);
  circle(5, 3, 4);

  fill(255, 220);
  triangle(-13, 0, -25, -8, -25, 8);
  triangle(13, 0, 25, -8, 25, 8);

  pop();
}

// ------------------------------
// Ball Interaction
// ------------------------------

function spawnBall() {
  if (!fingertip) return;
  if (mode !== "companion") return;

  ball = {
    pos: fingertip.copy(),
    vel: createVector(0, 0),
    held: true,
    radius: 22
  };
}

function updateBall() {
  if (!ball || !creature) return;

  if (fingertip && pinchNow) {
    // Pinch to hold the ball.
    ball.held = true;
    ball.pos = p5.Vector.lerp(ball.pos, fingertip, 0.45);
    ball.vel = fingerVel.copy();
  } else {
    // Release to throw.
    if (ball.held && !pinchNow) {
      ball.held = false;

      if (fingerVel) {
        ball.vel = fingerVel.copy();
        ball.vel.mult(1.4);
      }
    }

    ball.vel.y += 0.22;
    ball.vel.mult(0.985);
    ball.pos.add(ball.vel);

    // Wall bounce.
    if (ball.pos.x < ball.radius || ball.pos.x > width - ball.radius) {
      ball.vel.x *= -0.8;
      ball.pos.x = constrain(ball.pos.x, ball.radius, width - ball.radius);
    }

    if (ball.pos.y < ball.radius || ball.pos.y > height - ball.radius) {
      ball.vel.y *= -0.8;
      ball.pos.y = constrain(ball.pos.y, ball.radius, height - ball.radius);
    }
  }

  // Bounce against spirit.
  let d = dist(ball.pos.x, ball.pos.y, creature.pos.x, creature.pos.y);

  if (d < creature.size * 0.65 + ball.radius) {
    let away = p5.Vector.sub(ball.pos, creature.pos);

    if (away.mag() < 1) {
      away = createVector(random(-1, 1), random(-1, 1));
    }

    away.normalize();
    ball.vel = away.mult(9);

    creature.bounceReact(ball.pos.x, ball.pos.y);
  }
}

function drawBall() {
  if (!ball) return;

  push();
  translate(ball.pos.x, ball.pos.y);

  noStroke();
  fill(120, 190, 255);
  circle(0, 0, ball.radius * 2);

  fill(255, 180);
  circle(-7, -7, 8);

  noFill();
  stroke(255, 180);
  strokeWeight(2);
  arc(0, 0, ball.radius * 1.4, ball.radius * 1.4, -0.6, 1.3);

  pop();
}

// ------------------------------
// Instructions
// ------------------------------

function drawInstructions() {
  fill(255);
  noStroke();
  textSize(14);

  if (mode === "draw") {
    text(
      "Draw inside the box with your index finger. Pinch index + thumb to create your spirit.",
      width / 2,
      height - 42
    );

    fill(255, 180);
    textSize(12);
    text(
      "Red fingertip = not drawing yet. Yellow fingertip = drawing.",
      width / 2,
      height - 20
    );
  } else {
    text(
      "Gesture: make a fist, then open your palm to create candy. Move candy to spirit to feed it. Click Ball, pinch to hold, release to throw.",
      width / 2,
      height - 28
    );
  }
}

// ------------------------------
// Spirit Class
// ------------------------------

class Spirit {
  constructor(path) {
    this.path = path.map(p => p.copy());

    this.pos = createVector(width / 2 + 100, height / 2);
    this.vel = createVector(0, 0);

    this.features = this.analyzePath();

    this.size = this.features.size;
    this.aspect = this.features.aspect;
    this.curviness = this.features.curviness;
    this.rotation = this.features.angle;
    this.closedness = this.features.closedness;
    this.spikiness = this.features.spikiness;

    this.bodyColor = color(
      this.features.colorR,
      this.features.colorG,
      this.features.colorB
    );

    this.baseColor = this.bodyColor;

    this.shapePoints = this.buildShapeFromPath();

    this.squish = 1;
    this.energy = 0;
    this.happiness = 0;

    this.blinkTimer = int(random(80, 160));
    this.eyeOpen = true;

    this.floatOffset = random(TWO_PI);
    this.mood = "calm";
  }

  analyzePath() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let p of this.path) {
      minX = min(minX, p.x);
      maxX = max(maxX, p.x);
      minY = min(minY, p.y);
      maxY = max(maxY, p.y);
    }

    let w = max(maxX - minX, 1);
    let h = max(maxY - minY, 1);
    let aspect = constrain(w / h, 0.45, 2.2);

    let pathLength = 0;

    for (let i = 1; i < this.path.length; i++) {
      pathLength += dist(
        this.path[i - 1].x,
        this.path[i - 1].y,
        this.path[i].x,
        this.path[i].y
      );
    }

    let curviness = 0;
    let sharpTurns = 0;

    for (let i = 2; i < this.path.length; i++) {
      let a = p5.Vector.sub(this.path[i - 1], this.path[i - 2]);
      let b = p5.Vector.sub(this.path[i], this.path[i - 1]);

      if (a.mag() > 0 && b.mag() > 0) {
        let turn = abs(a.angleBetween(b));
        curviness += turn;

        if (turn > 0.8) {
          sharpTurns++;
        }
      }
    }

    let start = this.path[0];
    let end = this.path[this.path.length - 1];

    let endDist = dist(start.x, start.y, end.x, end.y);
    let closedness = constrain(1 - endDist / max(w, h, 1), 0, 1);

    let angle = atan2(end.y - start.y, end.x - start.x);

    return {
      size: constrain(pathLength * 0.12, 65, 165),
      aspect: aspect,
      curviness: constrain(curviness, 1, 42),
      spikiness: constrain(sharpTurns / 10, 0, 1),
      closedness: closedness,
      angle: angle,
      colorR: map(curviness, 0, 35, 120, 255, true),
      colorG: map(w, 0, width * 0.8, 150, 255, true),
      colorB: map(h, 0, height * 0.8, 180, 255, true)
    };
  }

  buildShapeFromPath() {
    let pts = this.resamplePath(this.path, 70);

    let cx = 0;
    let cy = 0;

    for (let p of pts) {
      cx += p.x;
      cy += p.y;
    }

    cx /= pts.length;
    cy /= pts.length;

    let centered = [];
    let maxDist = 1;

    for (let p of pts) {
      let v = createVector(p.x - cx, p.y - cy);
      centered.push(v);
      maxDist = max(maxDist, v.mag());
    }

    let normalized = [];

    for (let v of centered) {
      let n = v.copy();
      n.div(maxDist);
      n.mult(this.size * 0.52);
      normalized.push(n);
    }

    return normalized;
  }

  resamplePath(path, targetCount) {
    if (path.length <= 2) {
      return path.map(p => p.copy());
    }

    let result = [];
    let totalLength = 0;
    let distances = [0];

    for (let i = 1; i < path.length; i++) {
      totalLength += dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
      distances.push(totalLength);
    }

    for (let i = 0; i < targetCount; i++) {
      let target = map(i, 0, targetCount - 1, 0, totalLength);
      let index = 1;

      while (index < distances.length - 1 && distances[index] < target) {
        index++;
      }

      let prevD = distances[index - 1];
      let nextD = distances[index];

      let amt = 0;

      if (nextD - prevD !== 0) {
        amt = (target - prevD) / (nextD - prevD);
      }

      let p = p5.Vector.lerp(path[index - 1], path[index], amt);
      result.push(p);
    }

    return result;
  }

  update() {
    let faceX = width / 2;
    let faceY = height / 2;

    let orbitX = cos(frameCount * 0.018 + this.floatOffset) * 120;
    let orbitY = sin(frameCount * 0.025 + this.floatOffset) * 55;

    let target = createVector(faceX + orbitX, faceY + orbitY);

    let force = p5.Vector.sub(target, this.pos);
    force.mult(0.035);

    this.vel.add(force);
    this.vel.mult(0.88);
    this.pos.add(this.vel);

    this.energy *= 0.94;
    this.happiness *= 0.97;

    this.squish = lerp(this.squish, 1, 0.07);

    this.blinkTimer--;

    if (this.blinkTimer <= 0) {
      this.eyeOpen = false;

      if (this.blinkTimer < -8) {
        this.eyeOpen = true;
        this.blinkTimer = int(random(90, 180));
      }
    }
  }

  checkFingerInteraction(x, y) {
    let d = dist(x, y, this.pos.x, this.pos.y);

    if (d < this.size * 1.8 && d > this.size * 0.75) {
      this.energy = min(this.energy + 0.04, 1);
      this.mood = "curious";
    }

    if (d < this.size * 0.75) {
      this.poke(x, y);
    }
  }

  poke(x, y) {
    this.mood = "poked";
    this.energy = 1;
    this.squish = 0.45;

    this.bodyColor = color(
      random(130, 255),
      random(130, 255),
      random(130, 255)
    );

    let pushForce = p5.Vector.sub(this.pos, createVector(x, y));

    if (pushForce.mag() < 1) {
      pushForce = createVector(random(-1, 1), random(-1, 1));
    }

    pushForce.setMag(7);
    this.vel.add(pushForce);
  }

  feed() {
    this.mood = "happy";
    this.happiness = 1;
    this.energy = 1;
    this.squish = 1.25;

    this.bodyColor = lerpColor(this.bodyColor, color(255, 180, 220), 0.35);
  }

  bounceReact(x, y) {
    this.mood = "surprised";
    this.energy = 1;
    this.squish = 0.6;

    let pushForce = p5.Vector.sub(this.pos, createVector(x, y));

    if (pushForce.mag() < 1) {
      pushForce = createVector(random(-1, 1), random(-1, 1));
    }

    pushForce.setMag(6);
    this.vel.add(pushForce);
  }

  display() {
    push();

    translate(this.pos.x, this.pos.y);

    let breathe = 1 + sin(frameCount * 0.06) * 0.04;
    let excited = 1 + this.energy * 0.12 + this.happiness * 0.08;

    rotate(this.rotation * 0.15 + sin(frameCount * 0.02) * 0.08);
    scale(breathe, this.squish * excited);

    this.drawAura();
    this.drawBody();
    this.drawFace();
    this.drawMoodParticles();

    pop();
  }

  drawAura() {
    noStroke();

    fill(
      red(this.bodyColor),
      green(this.bodyColor),
      blue(this.bodyColor),
      35 + this.energy * 80 + this.happiness * 60
    );

    for (let i = 0; i < 4; i++) {
      let a = frameCount * 0.02 + i * HALF_PI;
      let x = cos(a) * this.size * 0.35;
      let y = sin(a) * this.size * 0.25;

      circle(x, y, this.size * (0.9 + i * 0.12));
    }
  }

  drawBody() {
    noStroke();
    fill(this.bodyColor);

    beginShape();

    for (let i = 0; i < this.shapePoints.length; i++) {
      let p = this.shapePoints[i];
      let a = atan2(p.y, p.x);

      let organicNoise = noise(
        cos(a) * 1.2 + frameCount * 0.012,
        sin(a) * 1.2 + this.floatOffset
      );

      let wobble =
        sin(a * this.curviness * 0.25 + frameCount * 0.05) *
        (3 + this.energy * 7 + this.spikiness * 5);

      let v = p.copy();

      if (v.mag() > 0) {
        v.setMag(v.mag() + wobble + organicNoise * 8);
      }

      curveVertex(v.x * this.aspect, v.y);
    }

    endShape(CLOSE);
  }

  drawFace() {
    fill(25);
    noStroke();

    let eyeY = -this.size * 0.04;
    let eyeGap = this.size * 0.16;

    if (this.eyeOpen) {
      if (this.mood === "surprised") {
        ellipse(-eyeGap, eyeY, 10, 13);
        ellipse(eyeGap, eyeY, 10, 13);
      } else if (this.mood === "happy") {
        noFill();
        stroke(25);
        strokeWeight(2);
        arc(-eyeGap, eyeY, 12, 8, PI, TWO_PI);
        arc(eyeGap, eyeY, 12, 8, PI, TWO_PI);
        noStroke();
      } else {
        ellipse(-eyeGap, eyeY, 8, 8);
        ellipse(eyeGap, eyeY, 8, 8);
      }
    } else {
      stroke(25);
      strokeWeight(2);
      line(-eyeGap - 5, eyeY, -eyeGap + 5, eyeY);
      line(eyeGap - 5, eyeY, eyeGap + 5, eyeY);
      noStroke();
    }

    noFill();
    stroke(25);
    strokeWeight(2);

    if (this.mood === "poked") {
      arc(0, this.size * 0.13, 24, 16, PI, TWO_PI);
    } else if (this.mood === "surprised") {
      ellipse(0, this.size * 0.12, 14, 18);
    } else {
      arc(0, this.size * 0.1, 26, 16, 0, PI);
    }
  }

  drawMoodParticles() {
    if (this.happiness < 0.1) return;

    noStroke();
    fill(255, 210, 230, 180 * this.happiness);

    for (let i = 0; i < 5; i++) {
      let a = frameCount * 0.04 + i * TWO_PI / 5;
      let x = cos(a) * this.size * 0.75;
      let y = sin(a) * this.size * 0.55 - this.size * 0.2;

      circle(x, y, 6 + sin(frameCount * 0.1 + i) * 2);
    }
  }
}