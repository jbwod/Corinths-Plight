var config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'phaser-example',
    scene: {
        preload: preload,
        create: create
    }
};

var offsetX = 0, offsetY = 0; // Starting offsets
var hexSize = 16; // Initial half-width of the hexagon
var hexagons = []; // This array will hold all hexagons
var graphics; // Reference to the graphics object to be used globally


var game = new Phaser.Game(config);

function preload() {
    // Load your world map image
    this.load.image('worldMap', './world_map.png');
}

function create() {
    var camera = this.cameras.main;
    camera.setBounds(0, 0, 2265, 1317);
    camera.setZoom(1);
    this.add.image(0, 0, 'worldMap').setOrigin(0);

    graphics = this.add.graphics({ lineStyle: { width: 1, color: 0xffffff } });
    drawHexagons();

    // Enable dragging of the camera
    enableCameraDrag(this);
    addControls(this);

    this.input.on('wheel', function (pointer, gameObjects, deltaX, deltaY, deltaZ) {
        camera.setZoom(Math.max(0.1, camera.zoom + deltaY * -0.001)); // Adjust zoom factor here
    });
}

function enableCameraDrag(scene) {
    scene.input.on('pointerdown', function (pointer) {
        scene.dragPoint = new Phaser.Geom.Point(pointer.x, pointer.y);
    });
    scene.input.on('pointermove', function (pointer) {
        if (scene.dragPoint) {
            scene.cameras.main.scrollX -= (pointer.x - scene.dragPoint.x) / scene.cameras.main.zoom;
            scene.cameras.main.scrollY -= (pointer.y - scene.dragPoint.y) / scene.cameras.main.zoom;
            scene.dragPoint.setTo(pointer.x, pointer.y);
        }
    });
    scene.input.on('pointerup', function () {
        scene.dragPoint = null;
    });
}

function drawHexagons() {
    graphics.clear(); // Clear previous drawings
    hexagons = []; // Clear previous hexagons array
    var hexWidth = hexSize * 1.5;
    var hexHeight = Math.sqrt(3) * hexSize;
    var boardWidth = Math.ceil(2265 / hexWidth);
    var boardHeight = Math.ceil(1300 / hexHeight);

    for (var i = 0; i < boardHeight; i++) {
        for (var j = 0; j < boardWidth; j++) {
            var x = (hexWidth * j) + offsetX;
            var y = (hexHeight * i) + offsetY;
            if (j % 2 === 1) {
                y += hexHeight / 2;
            }

            var hexagon = new Hexagon(x, y, hexSize);
            drawHexagon(x, y, hexSize, graphics);
            hexagons.push(hexagon);
        }
    }
}

function drawHexagon(x, y, radius, graphics) {
    graphics.beginPath();
    // Adjust the angle for flat top hexagons
    for (let i = 0; i < 6; i++) {
        var angle = Math.PI / 3 + (2 * Math.PI / 6 * i);
        var x_i = x + radius * Math.cos(angle);
        var y_i = y + radius * Math.sin(angle);
        if (i === 0) {
            graphics.moveTo(x_i, y_i);
        } else {
            graphics.lineTo(x_i, y_i);
        }
    }
    graphics.lineStyle(1, 0xffffff);
    graphics.closePath();
    graphics.strokePath();
}

function Hexagon(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.data = {}; // Store additional properties like terrain type, resources, etc.
}

graphics.setInteractive(new Phaser.Geom.Polygon(hexagon.getPoints()), Phaser.Geom.Polygon.Contains);
graphics.on('pointerdown', function () {
    console.log('Hexagon clicked:', hexagon.data);
    // Here you can also update properties, trigger UI updates, etc.
});

function addControls(scene) {
    scene.input.keyboard.on('keydown-RIGHT', function (event) {
        offsetX += 1;
        drawHexagons();
    });
    scene.input.keyboard.on('keydown-LEFT', function (event) {
        offsetX -= 1;
        drawHexagons();
    });
    scene.input.keyboard.on('keydown-UP', function (event) {
        offsetY -= 1;
        drawHexagons();
    });
    scene.input.keyboard.on('keydown-DOWN', function (event) {
        offsetY += 1;
        drawHexagons();
    });
    scene.input.keyboard.on('keydown-Z', function (event) {
        hexSize += 0.1;
        drawHexagons();
    });
    scene.input.keyboard.on('keydown-X', function (event) {
        hexSize = Math.max(1, hexSize - 0.1); // Prevent hexSize from becoming zero or negative
        drawHexagons();
    });
}