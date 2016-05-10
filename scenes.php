<?php
//------------------------------------------------------------------------------
//
//  Phaser Editor Scenes Management-Script
//  Copyright (c) 2016, Pascal Rosenkranz
//
//------------------------------------------------------------------------------

// Load config
$configJSON = file_get_contents("config.json");
$config = json_decode($configJSON, true);

$dir = 'scenes/';
if (array_key_exists('scenesDir', $config))
	$dir = $config['scenesDir'];

$dir = rtrim($dir, '/\\') . '/';

//------------------------------------------------------------------------------

function get_scenes_json()
{
	global $dir;
	$scenes = Array();
	$files = scandir($dir);
	$end = end($files);
	foreach ($files as $file)
	{
		$i = strpos($file, '.json');
		if (is_file($dir . $file) && $i !== false && $file != 'scenes.json')
			$scenes[] = substr($file, 0, $i);
	}

	return json_encode($scenes);
}

function update_scenes_json()
{
	global $dir;
	$json = get_scenes_json();
	file_put_contents($dir . 'scenes.json', $json);
	return $json;
}

//------------------------------------------------------------------------------

function list_scenes()
{
	echo update_scenes_json();
}

function load_scene($name)
{
	global $dir;
	echo file_get_contents($dir . $name . '.json');
}

function save_scene($name, $jsonData)
{
	global $dir;
	file_put_contents($dir . $name . '.json', $jsonData);
	update_scenes_json();
	if (!file_exists($dir . $name . '.js'))
	{
		$js = "var " . $name . " = function(phaserGame) {\n"
			. "\tCScene.call(this);\n"
			. "\n"
			. "\tthis.onLoad = function() {\n"
			. "\t}\n"
			. "\n"
			. "\tthis.load('scenes/" . $name . ".json');\n"
			. "}\n";
		file_put_contents($dir . $name . '.js', $js);
	}

	echo "OK";
}

//------------------------------------------------------------------------------

// Handle request
if (!empty($_POST['save']) && !empty($_POST['json']))
	save_scene($_POST['save'], $_POST['json']);
else if (!empty($_GET['name']))
	load_scene($_GET['name']);
else
	list_scenes();
?>
