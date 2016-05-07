<?php
//------------------------------------------------------------------------------
//
//  Phaser Editor Scenes Management-Script
//  Copyright (c) 2016, Pascal Rosenkranz
//
//------------------------------------------------------------------------------

function list_scenes($dir)
{
	$files = scandir($dir);
	echo "[";
	$end = end($files);
	foreach ($files as $file)
	{
		$i = strpos($file, '.json');
		if (is_file($dir . $file) && $i !== false)
			echo "\"" . substr($file, 0, $i) . "\"" . ($file != $end ? ',' : '');
	}
	echo "]";
}

function load_scene($file)
{
	echo file_get_contents($file);
}

function save_scene($file, $json)
{
	file_put_contents($file, $json);
	echo "OK";
}

//------------------------------------------------------------------------------

// Load config
$configJSON = file_get_contents("config.json");
$config = json_decode($configJSON, true);

$dir = 'scenes/';
if (array_key_exists('scenesDir', $config))
	$dir = $config['scenesDir'];

$dir = rtrim($dir, '/\\') . '/';


// Handle request
if (!empty($_POST['save']) && !empty($_POST['json']))
	save_scene($dir . $_POST['save'] . '.json', $_POST['json']);
else if (!empty($_GET['name']))
	load_scene($dir . $_GET['name'] . '.json');
else
	list_scenes($dir);
?>
