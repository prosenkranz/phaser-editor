/////////////////////////////////////////////////////////////////
// Phaser Point-And-Click Trigger Region Editor
// Copyright (c) 2016 Pascal Rosenkranz
/////////////////////////////////////////////////////////////////

const MODE_TRANSFORM = 0; // select + transform
const MODE_CREATE = 1;
const MODE_EDIT = 2;	// edit poly shape

const POINT_HELPER_SIZE = 10;
const DRAGPOINT_HELPER_RADIUS = 5;

// return document.getElementById(id)
function $(id) {
	return document.getElementById(id);
}


function getModeName(mode) {
	switch (mode) {
		case MODE_TRANSFORM: return "Select/Transform";
		case MODE_CREATE: return "Create";
		case MODE_EDIT: return "Edit";
		default: "Unknown";
	}
}
function getModeColor(mode) {
	switch (mode) {
		case MODE_TRANSFORM: return "#ee3";
		case MODE_CREATE: return "#f44";
		case MODE_EDIT: return "#f4f";
		default: return "#aaa";
	}
}

// Calculates min/max from point array
function calculateAABB(points) {
	var bb = { min: { x:999999, y:999999 }, max: { x:-999999, y:-999999 } };
	if (points.length > 0) {
		points.forEach(function(point) {
			if (point.x < bb.min.x) bb.min.x = point.x;
			if (point.y < bb.min.y) bb.min.y = point.y;
			if (point.x > bb.max.x) bb.max.x = point.x;
			if (point.y > bb.max.y) bb.max.y = point.y;
		});
	}

	return bb;
}

function offsetAABB(aabb, v) {
	return {
		min: { x: aabb.min.x - v, y: aabb.min.y - v },
		max: { x: aabb.max.x + v, y: aabb.max.y + v }
	}
}

// aabb = { min: {x,y}, max: {x,y} }
// point = { x: ..., y: ... }
function aabbContainsPoint(aabb, point) {
	return (point.x >= aabb.min.x && point.x <= aabb.max.x
		&& point.y >= aabb.min.y && point.y <= aabb.max.y);
}

function polyContainsPoint(poly, point) {
	if (poly.points.length == 0)
		return false;
	if (!aabbContainsPoint(poly.aabb, point))
		return false;

	// TODO: Don't re-fill this array for each hit test. Instead, fill up this array when poly is stored
	var pps = [];
	for (var i = 0; i < poly.points.length; ++i) {
		pps[pps.length] = new Phaser.Point(poly.points[i].x, poly.points[i].y);
	}

	var phPoly = new Phaser.Polygon(pps);
	return phPoly.contains(point.x, point.y);
}


function mouseHoversPoint(mousePos, point, helperSz) {
	var halfHelperSz = helperSz * 0.5;
	return aabbContainsPoint({
			min: { x: point.x - halfHelperSz, y: point.y - halfHelperSz },
			max: { x: point.x + halfHelperSz, y: point.y + halfHelperSz }
		}, mousePos);
}

function mouseHoversDragpoint(mousePos, dragPoint, pointRadius, objCenter, objAngle) {
	// Rotate point around object center
	var point = new Phaser.Point(dragPoint.x, dragPoint.y);
	point = point.rotate(objCenter.x, objCenter.y, objAngle, true);

	// Do hit-test
	var pp = {
		x: point.x - mousePos.x,
		y: point.y - mousePos.y
	};
	return (pp.x * pp.x + pp.y * pp.y <= pointRadius * pointRadius);
}






CEditor = function() {

	var WIDTH = 1100;
	var HEIGHT = WIDTH * 9 / 16;

	var $this = this;

	var game = new Phaser.Game(WIDTH, HEIGHT, Phaser.CANVAS, 'editor', { preload: preload, create: create, update: update, render: render });

	var propFields = new CPropertyFields();

	this.config = new CEditorConfig();
	this.config.onConfigLoaded = function() {
		scenes.loadScenes();
		editor.assets.loadAssetsList();
		loadBackgrounds();
	}

	var scenes = new CSceneManager();
	var scene = new CScene(game);
	var selectedPoly = null;
	var curPoly = {
		points: []
	};

	var selectedObject = null;
	var scalePointHovered = false;
	var rotatePointHovered = false;
	var rotating = false;
	var scaling = false;

	var mode;

	var pointHelperSz = 10;

	var transformOldPos = { x: 0, y: 0 };
	var transformPoly = null;
	var transformPoint = null;
	var focusPoint = null; // for edit mode
	var focusPoly = null; // poly of focusPoint
	var transformObject = null;

	this.getCanvasSize = function() {
		return { w: game.width, h: game.height };
	}



	// -------------------------------------------------------------------------
	// 		P r e l o a d
	// -------------------------------------------------------------------------
	function preload() {
		game.load.image('no-scene-background', 'no-scene-background.jpg');
	}

	// -------------------------------------------------------------------------
	// 		C r e a t e
	// -------------------------------------------------------------------------
	function create() {
		game.clearBeforeRender = false;
		game.physics.startSystem(Phaser.Physics.P2JS);

		scene.init();
		scene.setBackground('no-scene-background');

		game.input.onDown.add(onMouseDown, $this);
		game.input.onUp.add(onMouseUp, $this);

		polys = new Array();
		$this.setMode(MODE_CREATE);

		game.input.keyboard.addKey(Phaser.Keyboard.ONE).onDown.add(function() { if (document.activeElement != document.body) return; this.setMode(MODE_TRANSFORM); }, $this);
		game.input.keyboard.addKey(Phaser.Keyboard.TWO).onDown.add(function() { if (document.activeElement != document.body) return; this.setMode(MODE_CREATE); }, $this);
		game.input.keyboard.addKey(Phaser.Keyboard.THREE).onDown.add(function() { if (document.activeElement != document.body) return; this.setMode(MODE_EDIT); }, $this);
		game.input.keyboard.addKey(Phaser.Keyboard.DELETE).onDown.add(function() { if (document.activeElement != document.body) return; onDeleteButton(); }, $this);
		game.input.keyboard.addKey(Phaser.Keyboard.ESC).onDown.add(function() { if (document.activeElement != document.body) return; cancelCreatePoly(); }, $this);

		game.input.keyboard.removeKeyCapture(Phaser.Keyboard.ONE);
		game.input.keyboard.removeKeyCapture(Phaser.Keyboard.TWO);
		game.input.keyboard.removeKeyCapture(Phaser.Keyboard.THREE);
		game.input.keyboard.removeKeyCapture(Phaser.Keyboard.DELETE);
	}


	// -------------------------------------------------------------------------
	// 		U p d a t e
	// -------------------------------------------------------------------------
	function update() {
		var mousePos = {
			x: game.input.activePointer.x,
			y: game.input.activePointer.y
		};

		if (mode == MODE_EDIT) {
			if (focusPoint == null || !mouseHoversPoint(mousePos, focusPoint, POINT_HELPER_SIZE)) {
				focusPoint = null;
				focusPoly = null;
				// Find new hovered (focus-) point
				// This is done by doing a broadphase-test first, then check all points of a minimized set of polys.
				for (var i = 0; i < scene.polys.length; ++i) {
					var poly = scene.polys[i];
					if (aabbContainsPoint(offsetAABB(poly.aabb, POINT_HELPER_SIZE * 0.5), mousePos)) {
						var found = false;
						for (var j = 0; j < poly.points.length; ++j) {
							if (mouseHoversPoint(mousePos, poly.points[j], POINT_HELPER_SIZE)) {
								found = true;
								focusPoint = poly.points[j];
								focusPoly = poly;
								break;
							}
						}

						if (found)
							break;
					}
				}
			}
		}

		if (mode == MODE_TRANSFORM && selectedObject != null) {
			rotatePointHovered = false;
			scalePointHovered = false;

			var sprite = selectedObject.sprite;
			var objPos = { x: sprite.body.x, y: sprite.body.y };
			var objSz = { w: sprite.width, h: sprite.height };
			var objAngle = sprite.body.angle;

			if (mouseHoversDragpoint(mousePos, {x: objPos.x, y: objPos.y - objSz.h * 0.5}, DRAGPOINT_HELPER_RADIUS, objPos, objAngle)) {
				rotatePointHovered = true;
			}
			else if (mouseHoversDragpoint(mousePos, { x: objPos.x + objSz.w * 0.5, y: objPos.y + objSz.h * 0.5 }, DRAGPOINT_HELPER_RADIUS, objPos, objAngle)) {
				scalePointHovered = true;
			}
		}

		if (game.input.activePointer.isDown) {
			if (mode == MODE_TRANSFORM) {
				var diff = { x: mousePos.x - transformOldPos.x, y: mousePos.y - transformOldPos.y };

				// Transform poly
				if (transformPoly != null) {
					for (var i = 0; i < transformPoly.points.length; ++i) {
						transformPoly.points[i].x += diff.x;
						transformPoly.points[i].y += diff.y;
					}
					transformPoly.aabb.min.x += diff.x;
					transformPoly.aabb.min.y += diff.y;
					transformPoly.aabb.max.x += diff.x;
					transformPoly.aabb.max.y += diff.y;
					transformOldPos = mousePos;
				}

				// Transform object
				if (transformObject != null) {
					var center = { x: transformObject.sprite.body.x, y: transformObject.sprite.body.y };
					var c2m = new Phaser.Point(mousePos.x - center.x, mousePos.y - center.y); // center to mouse
					if (rotating) {
						// Rotate object
						var up = new Phaser.Point(0, -1);
						var alpha = Math.acos(up.dot(c2m.normalize())) * 180.0 / Math.PI;
						if (mousePos.x < center.x)
							alpha = 360 - alpha;

						transformObject.sprite.body.angle = alpha;
					}
					else if (scaling) {
						// Scale object
						var objSz = { w: transformObject.sprite.width, h: transformObject.sprite.height };
						var c2mScreen = c2m.rotate(0, 0, -transformObject.sprite.body.angle, true);
						var topLeft = new Phaser.Point(-objSz.w * 0.5, -objSz.h * 0.5);
						var diag = c2mScreen.subtract(topLeft.x, topLeft.y);
						transformObject.sprite.width = diag.x;
						transformObject.sprite.height = diag.y;
						transformObject.sprite.body.setRectangle(diag.x, diag.y);

						var newCenter = topLeft.add(diag.x * 0.5, diag.y * 0.5);
						newCenter = newCenter.rotate(0, 0, transformObject.sprite.body.angle, true);
						transformObject.sprite.body.x += newCenter.x;
						transformObject.sprite.body.y += newCenter.y;
					}
					else {
						// Translate object
						transformObject.sprite.body.x += diff.x;
						transformObject.sprite.body.y += diff.y;
					}
					transformOldPos = mousePos;
				}
			}

			if (mode == MODE_EDIT && transformPoint != null && transformPoly != null) {
				// Transform point
				var diff = { x: mousePos.x - transformOldPos.x, y: mousePos.y - transformOldPos.y };
				transformPoint.x += diff.x;
				transformPoint.y += diff.y;
				transformPoly.aabb = calculateAABB(transformPoly.points);
				transformOldPos = mousePos;
			}
		}
	}


	// -------------------------------------------------------------------------
	// 		O n   M o u s e   D o w n
	// -------------------------------------------------------------------------
	function onMouseDown() {
		var objects = scene.objects;
		var pos = {
			x: game.input.mousePointer.x,
			y: game.input.mousePointer.y
		}

		if (mode == MODE_CREATE) {
			selectPoly(null);
			if (curPoly.points.length > 0) {
				// Check if path start clicked --> close path
				var p0 = curPoly.points[0];
				var boundRect = new Phaser.Rectangle(p0.x - pointHelperSz * 0.5, p0.y - pointHelperSz * 0.5, pointHelperSz, pointHelperSz);
				if (Phaser.Rectangle.containsPoint(boundRect, new Phaser.Point(pos.x, pos.y))) {
					// Add poly
					var points = curPoly.points.slice(0); // clone
					scene.addPoly('polygon', points);
					curPoly.points = [];

					// Immediately select it
					selectPoly(scene.polys[scene.polys.length - 1]);

					this.setMode(MODE_TRANSFORM);

					return;
				}
			}

			addPoint(pos.x, pos.y);
		}

		if (mode == MODE_TRANSFORM) {
			var found = false;

			// handle dragpoints
			if (selectedObject != null) {
				if (rotating || scaling) {
					found = true;
				}
				else if (rotatePointHovered || scalePointHovered) {
					transformObject = selectedObject;
					transformOldPos = pos;
					found = true;
					rotating = rotatePointHovered;
					scaling = scalePointHovered;
				}
			}

			// Handle object selection
			if (!found) {
				for (var i = 0; i < objects.length; ++i) {
					var intersected = game.physics.p2.hitTest(pos, [ objects[i].sprite ]);
					if (intersected.length !== 0) {
						this.selectObject(objects[i]);
						transformObject = selectedObject;
						transformOldPos = pos;
						found = true;
						break;
					}
				}
			}

			if (!found)
				this.selectObject(null);

			// Handle poly selection
			if (!found) {
				var hitPoly = scene.getHitPoly(pos);
				selectPoly(hitPoly);
				if (hitPoly != null) {
					transformOldPos = pos;
					transformPoly = hitPoly;
				}
			}
		}

		if (mode == MODE_EDIT && focusPoint != null && focusPoly != null) {
			transformPoint = focusPoint;
			transformPoly = focusPoly;
			transformOldPos = pos;
		}
	}

	// -------------------------------------------------------------------------
	// 		O n   M o u s e    U p
	// -------------------------------------------------------------------------
	function onMouseUp() {
		// Stop transforming
		transformPoly = null;
		transformObject = null;
		transformPoint = null;
		rotating = false;
		scaling = false;
	}


	// -------------------------------------------------------------------------
	// 		K e y b o a r d   E v e n t s
	// -------------------------------------------------------------------------
	function onDeleteButton() {
		if (mode == MODE_TRANSFORM) {
			if (selectedPoly != null) {
				deleteSelectedPoly();
			}
			else if (selectedObject != null) {
				scene.deleteObject(selectedObject.getName());
				selectedObject = null;
			}
		}
	}

	// -------------------------------------------------------------------------
	// 		R e n d e r
	// -------------------------------------------------------------------------
	function render() {
		game.context.globalAlpha = 1.0;

		// Render polys
		if (scene.polys.length > 0) {
			scene.polys.forEach(function(poly) {
				var polyStyle;
				if (poly.selected)
					 polyStyle = { outlineColor: '#dd2', helperColor: '#dd4', closeOutline: true };
				 else if (mode == MODE_EDIT)
					 polyStyle = { outlineColor: '#d2d', helperColor: '#d4d', closeOutline: true };
				else
					polyStyle = { outlineColor: '#22d', helperColor: '#44d', closeOutline: true };

				drawPoly(poly.points, polyStyle);
			});
		}

		// Render Edit-Poly
		if (curPoly.points.length > 0)
			drawPoly(curPoly.points, { outlineColor: '#f00', helperColor: '#f00', closeOutline: false });

		// Render selected Object helper
		var ctx = game.context;
		if (selectedObject != null) {
			var body = selectedObject.sprite.body;
			var sprite = selectedObject.sprite;

			ctx.save();
			ctx.translate(body.x, body.y);
			ctx.rotate(body.angle * Math.PI/180);

			// draw OBB
			ctx.strokeStyle = "#f33";
			ctx.lineWidth = 2;
			ctx.strokeRect(-sprite.width * 0.5, -sprite.height * 0.5, sprite.width, sprite.height);

			// draw rotation drag point
			ctx.fillStyle = (rotatePointHovered ? "#66f" : "#00f");
			drawDragpoint(0, -sprite.height * 0.5);

			// draw scale drag box
			ctx.fillStyle = (scalePointHovered ? "#afa" : "#0f0");
			drawDragpoint(sprite.width * 0.5, sprite.height * 0.5);

			game.debug.text("angle = " + body.angle, 10, 30);

			ctx.restore();
		}


		game.debug.text("mode = " + getModeName(mode), 10, 15);
	}

	function drawDragpoint(x, y) {
		var ctx = game.context;
		ctx.beginPath();
		ctx.arc(x, y, DRAGPOINT_HELPER_RADIUS, 0, 2 * Math.PI);
		ctx.fill();
	}

	// Does NOT close the path
	function drawPath(points) {
		game.context.beginPath();
		game.context.moveTo(points[0].x, points[0].y);
		for (var i = 1; i < points.length; ++i) {
			game.context.lineTo(points[i].x, points[i].y);
		}
	}

	// style - defines render style: outlineColor, helperColor, closeOutline, selected
	function drawPoly(points, style) {
		// draw the poly
		game.context.fillStyle = "rgba(0, 0, 0, 0.3)";
		drawPath(points);
		game.context.closePath();
		game.context.fill();

		// draw (unfinished) poly outline
		game.context.lineWidth = 1;
		game.context.setLineDash([10, 5]);
		game.context.strokeStyle = style.outlineColor;
		drawPath(points);
		if (style.closeOutline)
			game.context.closePath();
		game.context.stroke();

		// draw point helpers
		points.forEach(function(point) {
			game.context.fillStyle = (point == focusPoint ? "#ff0" : style.helperColor);
			game.context.fillRect(
				point.x - pointHelperSz * 0.5, point.y - pointHelperSz * 0.5,
				pointHelperSz, pointHelperSz);
		});
	}











	// -----------------------------------------------------------------------------------------------
	// EDIT MODE

	this.setMode = function(newMode) {
		cancelCreatePoly();
		mode = newMode;

		if (mode != MODE_TRANSFORM) {
			selectPoly(null);
			cancelCreatePoly();
		}

		if (mode != MODE_EDIT) {
			focusPoint = null;
			transformPoint = null;
		}

		var modeTxt = document.getElementById('mode');
		modeTxt.innerHTML = getModeName(mode);
		modeTxt.style.color = getModeColor(mode);
	}




	// -----------------------------------------------------------------------------------------------
	// POLYGONS

	function addPoint(x, y) {
		curPoly.points[curPoly.points.length] = { x: x, y: y };
	}

	// pass null to unselect all
	function selectPoly(poly) {
		selectedPoly = null;
		scene.polys.forEach(function(p) {
			if (p == poly) {
				p.selected = true;
				selectedPoly = poly;
			}
			else {
				p.selected = false;
			}
		});

		if (selectedPoly != null) {
			propFields.props.name.value = selectedPoly.name;
			propFields.show(true);
		}
		else {
			propFields.show(false);
		}
	}

	function deleteSelectedPoly() {
		for (var i = 0; i < scene.polys.length; ++i) {
			if (scene.polys[i].selected) {
				scene.polys.splice(i, 1);
				break;
			}
		}

		propFields.show(false);
	}

	function cancelCreatePoly() {
		curPoly.points = [];
	}



	// -----------------------------------------------------------------------------------------------
	// ASSETS & DYNAMIC OBJECTS

	this.assets = new CAssetManager(game);

	this.insertAsset = function(name) {
		this.assets.loadAsset(name, function(assetName) {
			var o = scene.addObject(name, assetName);
			this.selectObject(o);
			this.setMode(MODE_TRANSFORM);
		}, this);
	}


	// pass null to unselect all
	this.selectObject = function(obj) {
		selectedObject = obj;
		selectPoly(null);
		if (obj != null) {
			propFields.props.name.value = obj.getName();
			propFields.show(true);
		}
		else {
			propFields.show(false);
		}
	}

	this.getSelectedObject = function() {
		return selectedObject;
	}






	// -----------------------------------------------------------------------------------------------
	// CONTROLLER:

	this.onPropertyNameChange = function(newval) {
		if (selectedObject != null)
			selectedObject.setName(newval);
		else if (selectedPoly != null)
			selectedPoly.name = newval;
	}




	// -----------------------------------------------------------------------------------------------
	// BACKGROUNDS:

	var backgroundsDiv = $('backgrounds');
	var loadedBackgrounds = [];

	window.loadBackgrounds = function() {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function() {
			if (req.readyState == 4 && req.status == 200) {
				var d = JSON.parse(req.responseText);
				var s = "";
				loadedBackgrounds = d;
				d.forEach(function(bg) {
					s += "<div><button class='add-resource' onclick='setBackground(\"" + bg.name + "\",\"" + bg.file + "\")'>Use</button>" + bg.name + "</div>";
				});
				backgroundsDiv.innerHTML = s;
			}
		}
		req.open("GET", editor.config.assetsDir + "backgrounds.json", true);
		req.send();
	}

	window.setBackground = function(name, file) {
		if (!game.cache.checkImageKey(name)) {
			game.load.image(name, editor.config.assetsDir + file);
			game.load.onFileComplete.addOnce(function(progress, key) {
					scene.setBackground(key);
				}, $this, 0);
			game.load.start();
		}
		else {
			scene.setBackground(name);
		}
	}



	// -----------------------------------------------------------------------------------------------
	// LOGGING

	this.log = function(msg) {
		console.log("[Editor] " + msg);
	}



	this.init = function() {
		// onConfigLoaded will trigger assets to be loaded
		this.config.loadConfig();
	}






	// -------------------------------------------------------------------------
	// 		E x p o r t   /   I m p o r t
	// -------------------------------------------------------------------------

	// Returns the scene as a json string
	var serializeScene = function() {
		var d = {
			exportScreenWidth: game.width,
			exportScreenHeight: game.height,
			sceneBackground: scene.getBackgroundName(),
			polygons: [],
			objects: []
		};

		// Serialize polygons:
		scene.polys.forEach(function(poly) {
			var p = d.polygons[d.polygons.length] = {
				name: poly.name,
				points: []
			};
			for (var i = 0; i < poly.points.length; ++i) {
				p.points[p.points.length] = poly.points[i].x;
				p.points[p.points.length] = poly.points[i].y;
			}
		});

		// Serialize objects:
		d.objects = scene.serializeObjects();

		return JSON.stringify(d);
	}

	this.dumpCode = function() {
		var out = document.getElementById('output');
		out.value = serializeScene();
	}

	this.importCode = function(code) {
		code = code || $('output').value;
		var d = JSON.parse(code);

		// TODO: Make sure the code is correct and contains all necessary elements

		scene.clear();

		var bgName = d.sceneBackground;
		if (!game.cache.checkImageKey(bgName)) {
			for (var i = 0; i < loadedBackgrounds.length; ++i) {
				var loadedBackground = loadedBackgrounds[i];
				if (loadedBackground.name == bgName) {
					game.load.image(loadedBackground.name, editor.config.assetsDir + loadedBackground.file);
					game.load.onFileComplete.addOnce(function(p, key) {
						scene.setBackground(key);
					}, $this, 0);
					game.load.start();
					break;
				}
			}
		}
		else {
			scene.setBackground(bgName);
		}

		var scale = {
			x: game.width / d.exportScreenWidth,
			y: game.height / d.exportScreenHeight
		};

		// Import polys:
		curPoly.points = [];
		transformPoly = null;
		d.polygons.forEach(function(poly) {
			var points = [];
			for (var i = 0; i < poly.points.length; i += 2) {
				points[points.length] = {
					x: poly.points[i] * scale.x,
					y: poly.points[i + 1] * scale.y
				}
			}

			scene.addPoly(poly.name, points);
		});

		// Import objects:
		transformObject = null;
		scene.deserializeObjects(d.objects, this.assets, scale);

		this.setMode(MODE_TRANSFORM);
		selectPoly(null);
		this.selectObject(null);
	}



	this.loadScene = function(name) {
		scenes.loadScene(name, function(code) {
			this.importCode(code);
		}, this);
	}

	this.saveScene = function(name) {
		scenes.saveScene(name, serializeScene());
	}

	this.saveAsNewScene = function() {
		scenes.saveAsNewScene(serializeScene());
	}
};



///////////////////////////////////////////////////////////////////////////////////////////////////////
//
//		S c e n e
//
///////////////////////////////////////////////////////////////////////////////////////////////////////

// position - { x: ..., y: ... }
// size - { w: ..., h: ... }
// If both width and height of the size equal 0, the original image size is used
var CObject = function(name, assetName, position, size, angle) {
	// The creation-desc, set to null when the object was created properly
	this.desc = {
		name: name,
		assetName: assetName,
		position: (typeof position !== 'undefined' ? position : { x: 0, y: 0 }),
		size: (typeof size !== 'undefined' ? size : { w: 0, h: 0 }),
		angle: angle || 0
	};

	this.sprite = null;

	// Create the phaser object
	this.create = function(phaserGame) {
		this.sprite = phaserGame.add.sprite(this.desc.position.x, this.desc.position.y, this.desc.assetName);
		if (this.desc.size.w != 0 || this.desc.size.h != 0) {
			this.sprite.width = this.desc.size.w;
			this.sprite.height = this.desc.size.h;
		}

		// Setup physics
		phaserGame.physics.p2.enable(this.sprite);
		this.sprite.body.kinematic = false;
		this.sprite.body.motionState = Phaser.Physics.P2.Body.STATIC;

		this.sprite.name = this.desc.name;
		this.sprite.body.angle = this.desc.angle;

		this.desc = null; // loaded
	}

	this.destroy = function() {
		if (this.sprite != null)
			this.sprite.destroy();
	}

	this.getName = function() {
		return (this.sprite != null ? this.sprite.name : "<not-created>");
	}

	this.setName = function(name) {
		if (this.sprite != null)
			this.sprite.name = name;
	}
}

var CScene = function(phaserGame) {
	if (typeof phaserGame === 'undefined' || phaserGame == null) {
		console.error("Cannot instantiate Scene: phaserGame parameter invalid!");
		return false;
	}
	var game = phaserGame;

	var bg;
	this.objects = [];
	this.polys = [];

	// Call this in phaser create-callback
	this.init = function() {
		bg = game.add.image(0, 0);
	}

	// Deletes all objects and polys
	this.clear = function() {
		this.objects.forEach(function(obj) {
			obj.sprite.destroy();
		});

		this.objects = [];
		this.polys = [];
	}

	// name - the resource name of the scene background image, has to be loaded
	this.setBackground = function(name) {
		bg.loadTexture(name);
		bg.width = game.width;
		bg.height = game.height;
	}

	this.getBackgroundName = function() {
		return bg.key;
	}

	// Returns null if the object does not exist in the scene
	this.getObject = function(name) {
		for (var i = 0; i < this.objects.length; ++i) {
			if (this.objects[i].name == name)
				return this.objects[i];
		}

		return null;
	}

	// Adds the object to the scene with given name and the assetName of a LOADED asset.
	// Returns reference to the new object.
	this.addObject = function(name, assetName) {
		var o = this.objects[this.objects.length] = new CObject(name, assetName, { x: game.width * 0.5, y: game.height * 0.5 });
		o.create(game);
		return o;
	}

	this.deleteObject = function(name) {
		for (var i = 0; i < this.objects.length; ++i) {
			if (this.objects[i].getName() == name) {
				this.objects[i].destroy();
				this.objects.splice(i, 1);
				break;
			}
		}
	}

	// Returns array of exportable json data of the objects in the scene
	this.serializeObjects = function() {
		var d = [];
		this.objects.forEach(function(obj) {
			d[d.length] = {
				name: obj.sprite.name,
				position: { x: Math.round(obj.sprite.body.x), y: Math.round(obj.sprite.body.y) },
				size: { w: Math.round(obj.sprite.width), h: Math.round(obj.sprite.height) },
				angle: obj.sprite.body.angle,
				asset: obj.sprite.key
			};
		});

		return d;
	}

	// Loads objects and their assets and adds them to the scene.
	// d - has to be an array of valid json data for each object
	// loadScale - (optional) { x: 1.0, y: 1.0 } A factor multiplied to the size and position to properly scale into the canvas
	this.deserializeObjects = function(d, assetMgr, loadScale) {
		loadScale = loadScale || { x: 1.0, y: 1.0 };
		for (var i = 0; i < d.length; ++i) {
			var o = d[i];
			var position = { x: o.position.x * loadScale.x, y: o.position.y * loadScale.y };
			var size = { w: o.size.w * loadScale.x, h: o.size.h * loadScale.y };
			var object = this.objects[this.objects.length] = new CObject(o.name, o.asset, position, size, o.angle);
			if (assetMgr.isAssetLoaded(o.asset)) {
				object.create(game);
			}
			else {
				assetMgr.queueAsset(o.asset);
			}
		}

		if (assetMgr.isLoadQueueFilled()) {
			assetMgr.loadQueued(function() {
				this.objects.forEach(function(obj) {
					if (obj.sprite == null && assetMgr.isAssetLoaded(obj.desc.assetName))
						obj.create(game);
				});
			}, this);
		}
	}





	this.addPoly = function(name, points) {
		 this.polys[this.polys.length] = {
			points: points,
			aabb: calculateAABB(points),
			selected: false,
			name: name
		};
	}

	// Returns poly that is hit by the given test-point
	this.getHitPoly = function(point) {
		for (var i = 0; i < this.polys.length; ++i) {
			if (polyContainsPoint(this.polys[i], point))
				return this.polys[i];
		}

		return null;
	}
}



var CSceneManager = function() {
	var scenesDiv = $('scenes');

	scenesDiv.addScene = function(name) {
		var item = document.createElement('div');
		item.id = 'scene-' + name;
		item.innerHTML = "<button class='add-resource' onclick='editor.loadScene(\"" + name + "\")'>Load</button>"
						+ name
						+ "<button class='btn-resource-right' onclick='editor.saveScene(\"" + name + "\")'>Save</button>";

		this.insertBefore(item, this.childNodes[0]);
	}

	scenesDiv.clearScenes = function() {
		this.innerHTML =
			 "<div style='padding: 5px 2px'>"
			+ "<input type='text' placeholder='New scene' id='new-scene-name'>"
			+ "<button class='btn-resource-right always' onclick='editor.saveAsNewScene()'>Save</button>"
			+"</div>";
	}

	scenesDiv.setLoaded = function(name) {
		for (var i = 0; i < this.childNodes.length; ++i) {
			var item = this.childNodes[i];
			item.className = (item.id == "scene-" + name ? "loaded" : "");
		}
	}

	this.loadScenes = function() {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function() {
			if (req.readyState == 4 && req.status == 200) {
				var scenes = JSON.parse(req.responseText);

				scenesDiv.clearScenes();
				scenes.forEach(function(scene) {
					scenesDiv.addScene(scene);
				});
			}
		}
		req.open("GET", "scenes.php", true);
		req.onerror = function() {}
		req.send();
	}

	// Loads the scene code and calls the callback with the scene code as string parameter:
	// function callback(code) { var data = JSON.decode(code); ... }
	this.loadScene = function(name, callback, callbackScope) {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function() {
			if (req.readyState == 4 && req.status == 200) {
				callback.call(callbackScope, req.responseText);
				scenesDiv.setLoaded(name);
			}
		}
		req.open("GET", "scenes.php?name=" + name, true);
		req.onerror = function() {}
		req.send();
	}

	this.saveScene = function(name, data, callback, callbackContext) {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function() {
			if (req.readyState == 4 && req.status == 200) {
				editor.log("Saved scene '" + name + ".json' successfully!");

				if (typeof callback !== 'undefined')
					callback.call(callbackContext);
			}
		}
		req.open("POST", "scenes.php", true);
		req.setRequestHeader("Content-type", "application/x-www-form-urlencoded")
		req.onerror = function() {}
		req.send("save=" + name + "&json=" + data);
	}

	// scene name is retrieved from the #new-scene-name input textfield
	this.saveAsNewScene = function(data) {
		var name = $('new-scene-name').value;
		if (name.length == 0) {
			alert("Please type in a scene name!");
			return false;
		}

		for (var i = 0; i < scenesDiv.childNodes.length; ++i) {
			if (scenesDiv.childNodes[i].innerHTML.indexOf(name) != -1) {
				alert("Scene already exists!");
				return false;
			}
		}

		this.saveScene(name, data, function() {
			scenesDiv.addScene(name);
			scenesDiv.setLoaded(name);
		});
	}
}




///////////////////////////////////////////////////////////////////////////////////////////////////////
//
//		C o n f i g
//
///////////////////////////////////////////////////////////////////////////////////////////////////////
var CEditorConfig = function() {
	var $this = this;

	// TODO: Use more flexible config properties (Using getter & setter API)
	this.assetsDir = "assets/";

	// Attempts to load config.json in editor root directory. Keeps the current values if this file was not found.
	// When finished loading the config, this.onConfigLoaded() is called
	this.loadConfig = function() {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function() {
			if (req.readyState == 4) {
				if (req.status == 200) {
					var d = JSON.parse(req.responseText);
					$this.assetsDir = d.assetsDir;
					editor.log("Loaded config file!");
				}
				else {
					editor.log("There is no custom config.json! Using defaults...");
				}

				$this.onConfigLoaded();
			}
		}
		req.open("GET", "config.json", true);
		req.onerror = function() {}
		req.send();
	}

	// override this to handle your own events!
	this.onConfigLoaded = function() {}
}




///////////////////////////////////////////////////////////////////////////////////////////////////////
//
//		A s s e t s
//
///////////////////////////////////////////////////////////////////////////////////////////////////////
var CAssetManager = function(phaserGame) {
	if (typeof phaserGame === 'undefined' || phaserGame == null) {
		console.error("Cannot instantiate asset manager: phaserGame parameter invalid!");
		return false;
	}
	var game = phaserGame;

	var assetsDiv = $('assets');
	var assets = [];

	var loadQueue = [];
	var loadQueueCompleteCB = function() {}

	// Load assets.json from server - does not yet load the resources themselfs
	this.loadAssetsList = function() {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function() {
			if (req.readyState == 4 && req.status == 200) {
				var d = JSON.parse(req.responseText);
				var s = "";
				assets = d;
				d.forEach(function(asset) {
					s += "<div><button class='add-resource' onclick='editor.insertAsset(\"" + asset.name + "\")'>Add</button>" + asset.name + "</div>";
				});
				assetsDiv.innerHTML = s;
			}
		}
		req.open("GET", editor.config.assetsDir + "assets.json", true);
		req.send();
	}

	this.getAsset = function(name) {
		for (var i = 0; i < assets.length; ++i) {
			if (assets[i].name == name)
				return assets[i];
		}

		return null;
	}

	this.isAssetKnown = function(name) {
		for (var i = 0; i < assets.length; ++i) {
			if (assets[i].name == name)
				return true;
		}

		return false;
	}

	this.isAssetLoaded = function(name) {
		return game.cache.checkImageKey(name);
	}

	// Makes sure the asset is loaded. If it is already loaded, this function does nothing
	// If you want to load multiple assets, queueAsset() might be faster and more reliable
	this.loadAsset = function(name, onload, scope) {
		if (this.isAssetLoaded(name)) {
			if (typeof onload === 'function')
				onload.call(scope, name);
			return true;
		}

		var asset = this.getAsset(name);
		if (asset == null) {
			editor.log("Cannot load asset: '" + name + "' not known");
			return false; // not known
		}

		game.load.image(asset.name, editor.config.assetsDir + asset.file);
		game.load.onFileComplete.addOnce(function(p, key) {
			onload.call(scope, key);
		});
		game.load.start();
	}


	// Queues an asset to be loaded when loadQueued() is called
	this.queueAsset = function(name) {
		if (this.isAssetLoaded(name))
			return true;

		for (var i = 0; i < loadQueue.length; ++i) {
			if (loadQueue[i].name == name)
				return true; // already queued
		}

		var asset = this.getAsset(name);
		if (asset == null) {
			editor.log("Cannot queue asset for load: '" + name + "' not known!");
			return false;
		}

		loadQueue[loadQueue.length] = asset;
	}

	this.isLoadQueueFilled = function() {
		return (loadQueue.length > 0);
	}

	// Loads all assets that are queued to load.
	// When finished with all assets, callback is called on the given scope if specified.
	this.loadQueued = function(callback, scope) {
		if (loadQueue.length == 0) {
			if (typeof callback === 'function')
				callback.call(scope);
			return true;
		}

		loadQueue.forEach(function(asset) {
			game.load.image(asset.name, editor.config.assetsDir + asset.file);
		});

		loadQueueCompleteCB = function(p, key) {
			for (var i = 0; i < loadQueue.length; ++i) {
				if (key == loadQueue[i].name) {
					loadQueue.splice(i, 1);
					break;
				}
			}

			if (loadQueue.length == 0) {
				if (typeof callback === 'function')
					callback.call(scope);

				game.load.onFileComplete.remove(loadQueueCompleteCB);
			}
		}

		game.load.onFileComplete.add(loadQueueCompleteCB, this);
		game.load.start();
	}
}



///////////////////////////////////////////////////////////////////////////////////////////////////////
//
//		G U I
//
///////////////////////////////////////////////////////////////////////////////////////////////////////
var CPropertyFields = function() {
	var container = $('properties');
	this.props = {
		name: $('prop-name')
	};

	this.props.name.onkeyup = function() {
		editor.onPropertyNameChange(this.value);
	}

	this.show = function(show) {
		container.style.display = (show ? 'block' : 'none');
	}
}


window.onload = function() {
	window.editor = new CEditor();
	window.editor.init();
}
