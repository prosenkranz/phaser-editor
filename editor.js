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






window.onload = function() {	
	
	var WIDTH = 1100;
	var HEIGHT = WIDTH * 9 / 16;
	
	var $this = this;
	
	var game = new Phaser.Game(WIDTH, HEIGHT, Phaser.CANVAS, 'editor', { preload: preload, create: create, update: update, render: render }); 	
	
	var polys;
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
	
	
	var testv2 = { x: 0, y: 0 };							
	
	// -------------------------------------------------------------------------
	// 		P r e l o a d
	// -------------------------------------------------------------------------
	function preload() {		
		game.load.image('scene1-background.bmp', 'scene1-background.bmp');		
	}

	// -------------------------------------------------------------------------
	// 		C r e a t e
	// -------------------------------------------------------------------------	
	function create() {		
		game.clearBeforeRender = false;
		game.physics.startSystem(Phaser.Physics.P2JS);

		var bg = game.add.image(0, 0, 'scene1-background.bmp');
		bg.width = game.width;
		bg.height = game.height;										

		game.input.onDown.add(onMouseDown, this);
		game.input.onUp.add(onMouseUp, this);		
		
		polys = new Array();
		onModeChange(MODE_CREATE);
		
		game.input.keyboard.addKey(Phaser.Keyboard.ONE).onDown.add(function() { if (document.activeElement != document.body) return; onModeChange(MODE_TRANSFORM); }, this);
		game.input.keyboard.addKey(Phaser.Keyboard.TWO).onDown.add(function() { if (document.activeElement != document.body) return; onModeChange(MODE_CREATE); }, this);
		game.input.keyboard.addKey(Phaser.Keyboard.THREE).onDown.add(function() { if (document.activeElement != document.body) return; onModeChange(MODE_EDIT); }, this);
		game.input.keyboard.addKey(Phaser.Keyboard.DELETE).onDown.add(function() { if (document.activeElement != document.body) return; deleteSelectedPoly(); }, this);
		game.input.keyboard.addKey(Phaser.Keyboard.ESC).onDown.add(function() { if (document.activeElement != document.body) return; cancelCreatePoly(); }, this);
		
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
				for (var i = 0; i < polys.length; ++i) {
					if (aabbContainsPoint(offsetAABB(polys[i].aabb, POINT_HELPER_SIZE * 0.5), mousePos)) {
					    var found = false;
						for (var j = 0; j < polys[i].points.length; ++j) {
							if (mouseHoversPoint(mousePos, polys[i].points[j], POINT_HELPER_SIZE)) {
								found = true;
								focusPoint = polys[i].points[j];
								focusPoly = polys[i];
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
	
	function onModeChange(newMode) {
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
	
	function addPoint(x, y) {
		curPoly.points[curPoly.points.length] = { x: x, y: y };
	}
	
	// pass null to unselect all
	function selectPoly(poly) {
		selectedPoly = null;
		polys.forEach(function(p) {			
			if (p == poly) {
				p.selected = true;
				selectedPoly = poly;
			}
			else {
				p.selected = false;
			}			
		});
		
		showPolyNameControls(selectedPoly != null);					
	}
	
	function deleteSelectedPoly() {
		for (var i = 0; i < polys.length; ++i) {
			if (polys[i].selected) {
				polys.splice(i, 1);
				break;
			}			
		}
		
		showPolyNameControls(false);
	}
	
	function cancelCreatePoly() {
		curPoly.points = [];
	}
	
	function onMouseDown() {		
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
					polys[polys.length] = {
						points: points,
						aabb: calculateAABB(points),
						selected: false,
						name: 'polygon'
					};
					curPoly.points = [];
					
					// Immediately select it
					selectPoly(polys[polys.length - 1]);
					
					onModeChange(MODE_TRANSFORM);
					
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

			// handle object selection
			if (!found) {			
				for (var i = 0; i < objects.length; ++i) {
					var intersected = game.physics.p2.hitTest(pos, [ objects[i].sprite ]);
					if (intersected.length !== 0) {					
						selectObject(objects[i]);									
						transformObject = selectedObject;
						transformOldPos = pos;
						found = true;
						break;
					}
				}
			}
			
			if (!found)
				selectObject(null);			
			
			// handle poly selection
			selectPoly(null);
			if (!found && polys.length > 0) {												
				for (var i = 0; i < polys.length; ++i) {
					if (polyContainsPoint(polys[i], pos)) {					
						selectPoly(polys[i]);
						
						// start transformation
						transformOldPos = pos;
						transformPoly = polys[i];						
						
						break;
					}
				}
			}			
		}
		
		if (mode == MODE_EDIT && focusPoint != null && focusPoly != null) {			
			transformPoint = focusPoint;
			transformPoly = focusPoly;
			transformOldPos = pos;			
		}
	}
	
	function onMouseUp() {
		// Stop transforming
		transformPoly = null;
		transformObject = null;
		transformPoint = null;
		rotating = false;
		scaling = false;
	}
	
	// -------------------------------------------------------------------------
	// 		R e n d e r
	// -------------------------------------------------------------------------	
	function render() {		
		game.context.globalAlpha = 1.0;
	
		// Render polys
		if (polys.length > 0) {			 			 
			polys.forEach(function(poly) {
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
	
	
	
	
	
	

	// -------------------------------------------------------------------------
	// 		E x p o r t   /   I m p o r t
	// -------------------------------------------------------------------------
	window.dumpCode = function() {
		var d = {
			exportScreenWidth: game.width,
			exportScreenHeight: game.height,
			polygons: []
		};
		
		polys.forEach(function(poly) {
			var p = d.polygons[d.polygons.length] = {
				name: poly.name,
				points: []
			};
			for (var i = 0; i < poly.points.length; ++i) {
				p.points[p.points.length] = poly.points[i].x;
				p.points[p.points.length] = poly.points[i].y;				
			} 
		});
		
		var out = document.getElementById('output');	
		out.innerHTML = JSON.stringify(d);		
	}
	
	window.importCode = function() {
		var code = document.getElementById('output').value;		
		var d = JSON.parse(code);
		
		// TODO: Make sure the code is correct and contains all necessary elements
		
		var scale = {
			x: game.width / d.exportScreenWidth,
			y: game.height / d.exportScreenHeight
		};
		
		polys = [];
		curPoly.points = [];
		transformPoly = null;		
		d.polygons.forEach(function(poly) {
			var p = polys[polys.length] = {
				name: poly.name,
				selected: false,
				points: [],
				aabb: {}
			};
			
			for (var i = 0; i < poly.points.length; i += 2) {								
				p.points[p.points.length] = {
					x: poly.points[i] * scale.x,
					y: poly.points[i + 1] * scale.y
				}
			}
			
			p.aabb = calculateAABB(p.points);
		});

		onModeChange(MODE_TRANSFORM);
		selectPoly(null);
	}
    
    
    
    
    
    
    
    
    
    // GUI Stuff:
    
    var polyNameControls = $('poly-name-controls');
    var polyName = $('poly-name');
    
    polyName.onkeyup = function() {		
		if (selectedPoly != null) {
			selectedPoly.name = polyName.value;
		}
	}
	
	// show - true/false
	function showPolyNameControls(show) {
		polyNameControls.style.display = (show ? 'inline-block' : 'none');
		if (show)
			polyName.value = selectedPoly.name;
	}
	
	
	
	// ASSETS  &  DYNAMIC OBJECTS
	
	var objects = [];
	
	var assetsDir = "assets/";
	var assetsDiv = $('assets');
	
	// Load assets.json	
	window.loadAssets = function() {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function() {
			if (req.readyState == 4 && req.status == 200) {
				var d = JSON.parse(req.responseText);
				var s = "";
				d.forEach(function(asset) {
					s += "<div><button class='assets-add' onclick='insertAsset(\"" + asset.name + "\",\"" + asset.file + "\")'>Add</button>" + asset.name + "</div>";
				});
				assetsDiv.innerHTML = s;
			}			
		}
		req.open("GET", assetsDir + "assets.json", true);
		req.send();			
	}	
	loadAssets();
	
	window.insertAsset = function(name, file) {		
		// Load resource if necessary			
		if (!game.cache.checkImageKey(name)) {			
			var url = assetsDir + file;
			game.load.image(name, url);
			game.load.start();
			game.load.onFileComplete.addOnce(function(p, key) {
					addDynamicObject(key, key);
				}, $this, 0);		
		}
		else {			
			addDynamicObject(name, name);
		}								
	}
	
	
	// Inserts new object into the world
	function addDynamicObject(asset, name) {		
		var o = objects[objects.length] = {
			name: name,
			sprite: game.add.sprite(game.width * 0.5, game.height * 0.5, asset)
		};
		
		game.physics.p2.enable(o.sprite);
		o.sprite.body.kinematic = false;
		o.sprite.body.motionState = Phaser.Physics.P2.Body.STATIC;
		
		selectObject(o);
		
		onModeChange(MODE_TRANSFORM);
	}
	
	// pass null to unselect all
	function selectObject(obj) {					
		selectedObject = obj;
	}	
};
