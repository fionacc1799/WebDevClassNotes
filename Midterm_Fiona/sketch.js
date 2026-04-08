let streams = [];
let petals = [];
let sparkles = [];

function setup() {
  createCanvas(900, 900);
  angleMode(DEGREES);
  noStroke();

  for (let i = 0; i < 22; i++) {
    let x = map(i, 0, 21, 40, width - 40) + random(-15, 15);
    streams.push(new FlowerStream(x));
  }
}

function draw() {
  drawBackgroundGlow();

  for (let s of streams) {
    s.update();
    s.displayGlow();
    s.spawn();
  }

  for (let i = petals.length - 1; i >= 0; i--) {
    petals[i].update();
    petals[i].display();
    if (petals[i].offscreen()) {
      petals.splice(i, 1);
    }
  }

  for (let i = sparkles.length - 1; i >= 0; i--) {
    sparkles[i].update();
    sparkles[i].display();
    if (sparkles[i].dead()) {
      sparkles.splice(i, 1);
    }
  }

  addSoftMist();
}

function drawBackgroundGlow() {
  background(170, 210, 45);

  for (let y = 0; y < height; y += 3) {
    let t = map(y, 0, height, 0, 1);
    let c = lerpColor(color(185, 220, 70), color(160, 205, 35), t);
    stroke(c);
    line(0, y, width, y);
  }
  noStroke();

  fill(255, 255, 255, 22);
  ellipse(width * 0.25, height * 0.2, 220, 420);
  ellipse(width * 0.75, height * 0.3, 260, 500);
  ellipse(width * 0.5, height * 0.65, 320, 480);
}

function addSoftMist() {
  fill(255, 255, 255, 10);
  for (let i = 0; i < 6; i++) {
    ellipse(random(width), random(height), random(120, 220), random(60, 120));
  }
}

class FlowerStream {
  constructor(x) {
    this.baseX = x;
    this.offset = random(1000);
    this.w = random(18, 42);
    this.brightness = random(45, 90);
  }

  update() {
    this.currentX =
      this.baseX +
      sin(frameCount * 0.6 + this.offset) * 18 +
      map(mouseX, 0, width, -20, 20) * 0.25;
  }

  displayGlow() {
    for (let i = 0; i < 5; i++) {
      fill(255, 255, 255, 12 - i * 2);
      rect(this.currentX - this.w / 2 - i * 5, 0, this.w + i * 10, height, 40);
    }
  }

  spawn() {
    let count = random() < 0.65 ? 1 : 2;

    for (let i = 0; i < count; i++) {
      petals.push(
        new FlowerParticle(
          this.currentX + random(-this.w * 0.35, this.w * 0.35),
          random(-40, 0)
        )
      );
    }

    if (random() < 0.35) {
      sparkles.push(
        new Sparkle(
          this.currentX + random(-this.w * 0.4, this.w * 0.4),
          random(height)
        )
      );
    }
  }
}

class FlowerParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;

    this.size = random(5, 14);
    this.speedY = random(1.4, 3.6);
    this.speedX = random(-0.3, 0.3);

    this.swingOffset = random(360);
    this.swingAmount = random(4, 14);

    this.rot = random(360);
    this.rotSpeed = random(-1.2, 1.2);

    this.alpha = random(170, 240);

    this.type = random(["white", "pink", "blue", "dot"]);
    this.trail = [];

    this.depth = random(0.7, 1.3);
  }

  update() {
    let wind = sin(frameCount * 1.2 + this.swingOffset) * 0.25;
    let mouseWind = map(mouseX, 0, width, -0.35, 0.35);

    this.speedX += wind * 0.03 + mouseWind * 0.01;
    this.speedX *= 0.98;

    this.x += this.speedX + sin(frameCount * 1.5 + this.swingOffset) * 0.25 * this.depth;
    this.y += this.speedY * this.depth;
    this.rot += this.rotSpeed;

    if (mouseIsPressed) {
      let d = dist(mouseX, mouseY, this.x, this.y);
      if (d < 140) {
        this.y += 2.4;
        this.x += map(this.x - mouseX, -140, 140, -0.8, 0.8);
      }
    }

    this.trail.push({ x: this.x, y: this.y, a: this.alpha * 0.14 });
    if (this.trail.length > 8) {
      this.trail.shift();
    }
  }

  display() {
    for (let t of this.trail) {
      fill(255, 255, 255, t.a);
      ellipse(t.x, t.y, this.size * 0.8, this.size * 1.6);
    }

    push();
    translate(this.x, this.y);
    rotate(this.rot);

    if (this.type === "dot") {
      fill(255, 255, 255, this.alpha);
      ellipse(0, 0, this.size * 0.45);
    } else {
      let c = this.getColor();
      fill(red(c), green(c), blue(c), this.alpha);
      drawFlower(0, 0, this.size);

      fill(255, 255, 255, 70);
      ellipse(0, 0, this.size * 0.18);
    }

    pop();
  }

  getColor() {
    if (this.type === "white") return color(255, 255, 255);
    if (this.type === "pink") return color(255, 210, 230);
    return color(120, 170, 255);
  }

  offscreen() {
    return this.y > height + 40;
  }
}

class Sparkle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = random(2, 7);
    this.alpha = random(35, 80);
    this.pulse = random(360);
  }

  update() {
    this.pulse += 3;
    this.alpha *= 0.992;
  }

  display() {
    fill(255, 255, 255, this.alpha + sin(this.pulse) * 12);
    ellipse(this.x, this.y, this.r + sin(this.pulse) * 0.8);
  }

  dead() {
    return this.alpha < 3;
  }
}

function drawFlower(x, y, s) {
  push();
  translate(x, y);

  let petals = 5;
  for (let i = 0; i < petals; i++) {
    push();
    rotate(i * (360 / petals));
    ellipse(0, -s * 0.38, s * 0.42, s * 0.62);
    pop();
  }

  pop();
}

function mousePressed() {
  for (let i = 0; i < 40; i++) {
    petals.push(
      new FlowerParticle(
        mouseX + random(-60, 60),
        mouseY + random(-20, 20)
      )
    );
  }
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    petals = [];
    sparkles = [];
  }
}