let app = new PIXI.Application({
    width: 800,
    height: 600,
    backgroundColor: 0x1099bb,
    view: document.getElementById('pixiCanvas')
});
document.body.appendChild(app.view);

let points = [
    { x: 400, y: 280, flipX: false, flipY: false, mountOffset: { x: 0, y: -10 }, sprite: "" }, // Top mount
    { x: 400, y: 320, flipX: false, flipY: true, mountOffset: { x: 0, y: 10 }, sprite: "" }  // Bottom mount
];

const components = [
    { name: 'Turret', texture: 'turret' },
    { name: 'Heavy Turret', texture: 'heavy_turret' },
    { name: 'Scanner', texture: 'scanner' },
    { name: 'Railgun', texture: 'railgun' }
];

let line = new PIXI.Graphics();
app.stage.addChild(line);

PIXI.Loader.shared.add('corvette', './sprites/external/corvette/corvette.png');
components.forEach(comp => {
    PIXI.Loader.shared.add(comp.texture, `./sprites/external/common/${comp.texture}.png`);
});
PIXI.Loader.shared.load(setup);

function setup(loader, resources) {
    const libraryDiv = document.getElementById('componentsLibrary');
    components.forEach(comp => {
        const img = document.createElement('img');
        img.src = resources[comp.texture].texture.baseTexture.resource.url;
        img.style.width = "100px";
        img.draggable = true;
        img.addEventListener('dragstart', function(event) {
            event.dataTransfer.setData("component", JSON.stringify(comp));
        });
        libraryDiv.appendChild(img);
    });
    const shipSprite = new PIXI.Sprite(resources['corvette'].texture);
    shipSprite.x = app.screen.width / 2;
    shipSprite.y = app.screen.height / 2;
    shipSprite.anchor.set(0.5);
    app.stage.addChild(shipSprite);

    points.forEach(createInteractivePoint);

    app.view.addEventListener('dragover', event => event.preventDefault());

    app.view.addEventListener('drop', function(event) {
        event.preventDefault();
        let component = JSON.parse(event.dataTransfer.getData("component"));
        const rect = app.view.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        createSpriteAtPosition(component, x, y);
    });
}

function createInteractivePoint(data) {
    const point = new PIXI.Graphics();
    point.beginFill(0xFF0000);
    point.drawCircle(0, 0, 10); // Visible point for debugging
    point.endFill();
    point.x = data.x;
    point.y = data.y;
    point.data = { ...data, sprite: null }; // Copy all data including mountOffset
    app.stage.addChild(point);
    console.log("Interactive point created at: ", data.x, data.y);
}

function createSpriteAtPosition(component, x, y) {
    let texture = PIXI.Loader.shared.resources[component.texture].texture;
    let sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.x = x;
    sprite.y = y;
    sprite.interactive = true;
    sprite.buttonMode = true;
    sprite.data = {
        component: component,
        original: { x: x, y: y }  // Ensure this is correctly set
    };
    sprite.on('pointerdown', onDragStart)
          .on('pointerup', onDragEnd)
          .on('pointermove', onDragMove);
    app.stage.addChild(sprite);
    console.log("Sprite created with data:", sprite.data); // Log data at creation
}

function onDragStart(event) {
    // Ensuring that data is not overwritten unintentionally
    if (!this.data) {
        this.data = event.data;  // Only set if not already set
    }
    this.alpha = 0.5;
    this.dragging = true;
    line.visible = true;
    line.moveTo(this.x, this.y);
    console.log("Drag started with data:", this.data); // Log data at drag start
}

function onDragMove(event) {
    if (this.dragging) {
        const newPosition = this.parent.toLocal(event.data.global);  // Correctly get local position
        this.x = newPosition.x;
        this.y = newPosition.y;
        line.clear();
        line.lineStyle(2, 0xFF0000);
        line.moveTo(newPosition.x, newPosition.y);
        line.lineTo(findNearestPoint(newPosition).x, findNearestPoint(newPosition).y);
        console.log("Dragging to position:", newPosition); // Log the position while dragging
    }
}


function onDragEnd(event) {
    this.alpha = 1;
    this.dragging = false;
    line.clear();
    line.visible = false;

    // Use the correct method to get the new position based on the event data
    const newPosition = this.parent.toLocal(event.data.global); // Correcting the reference to get the local position

    const nearest = findNearestPoint(newPosition);
    console.log("Nearest point found:", nearest); // Logging to check if the nearest point is being found correctly

    if (nearest) {
         // Ensure the point is not already occupied
         if (!nearest.sprite) {
            this.x = nearest.x;
            this.y = nearest.y;
            nearest.sprite = this;  // Assign this sprite to the point
            this.scale.x = nearest.flipX ? -1 : 1;  // Apply flipping based on the point data
            this.scale.y = nearest.flipY ? -1 : 1;
            console.log("Snapped to nearest point at: ", nearest.x, nearest.y);
        }
        else {
            console.log("Point already occupied, reverting to original position.");
            revertToOriginalPosition(this);
        }
    } else {
        console.log("No valid point found, reverting to original position.");
        revertToOriginalPosition(this);
    }
    this.data = null;
}

function revertToOriginalPosition(sprite) {
    if (sprite.data && sprite.data.original) {
        sprite.x = sprite.data.original.x;
        sprite.y = sprite.data.original.y;
    } else {
        console.error("Error: Missing original position data", sprite);
    }
}


function findNearestPoint(position) {
    let nearest = null;
    let minDistance = Infinity;
    points.forEach(point => {
        let distance = Math.pow((point.x - position.x), 2) + Math.pow((point.y - position.y), 2);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = point;
        }
    });
    return nearest;
}
