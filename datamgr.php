<?php
//------------------------------------------------------------------------------
//
//  Phaser Editor Data Management
//  Copyright (c) 2016, Pascal Rosenkranz
//
//------------------------------------------------------------------------------

function starts_with($haystack, $needle)
{
	// search backwards starting from haystack length characters from the end
	return $needle === "" || strrpos($haystack, $needle, -strlen($haystack)) !== false;
}

function sanitize_path($path)
{
	return rtrim($path, '/\\') . '/';
}

// Load config
$configJSON = file_get_contents("config.json");
$config = json_decode($configJSON, true);

$scenes_dir = 'scenes/';
if (array_key_exists('scenesDir', $config))
	$scenes_dir = $config['scenesDir'];

$assets_dir = 'assets/';
if (array_key_exists('assetsDir', $config))
	$assets_dir = $config['assetsDir'];

$scenes_dir = sanitize_path($scenes_dir);
$assets_dir = sanitize_path($assets_dir);

//------------------------------------------------------------------------------

function get_scenes_json()
{
	global $scenes_dir;
	$scenes = Array();
	$files = scandir($scenes_dir);
	$end = end($files);
	foreach ($files as $file)
	{
		$i = strpos($file, '.json');
		if (is_file($scenes_dir . $file) && $i !== false && $file != 'scenes.json')
			$scenes[] = substr($file, 0, $i);
	}

	return json_encode($scenes);
}

function update_scenes_json()
{
	global $scenes_dir;
	$json = get_scenes_json();
	file_put_contents($scenes_dir . 'scenes.json', $json);
	return $json;
}

//------------------------------------------------------------------------------

function list_scenes()
{
	echo update_scenes_json();
}

function load_scene($name)
{
	global $scenes_dir;
	echo file_get_contents($scenes_dir . $name . '.json');
}

function save_scene($name, $jsonData)
{
	global $scenes_dir;
	file_put_contents($scenes_dir . $name . '.json', $jsonData);
	update_scenes_json();
	if (!file_exists($scenes_dir . $name . '.js'))
	{
		$js = "var " . $name . " = function(phaserGame) {\n"
			. "\tCScene.call(this, phaserGame);\n"
			. "\n"
			. "\tthis.onLoad = function() {\n"
			. "\t}\n"
			. "\n"
			. "\tthis.load('scenes/" . $name . ".json');\n"
			. "}\n";
		file_put_contents($scenes_dir . $name . '.js', $js);
	}

	echo "OK";
}

//------------------------------------------------------------------------------

// file - whole (relative) path to the file
function is_image($file)
{
	return (getimagesize($file) ? true : false);
}

// filename - File name only! No path!
function is_background($filename)
{
	return starts_with($filename, 'background');
}

// Scans assets_dir recursively for assets + backgrounds
// subdir - relative to $assets_dir
function list_assets($subdir = "")
{
	global $assets_dir;

	if ($subdir != '')
		$subdir = sanitize_path($subdir);

	$dir = $assets_dir . $subdir;

	$out = [ 'assets' => [], 'backgrounds' => [] ];
	$files = scandir($dir);
	$end = end($files);
	$subdirs = [];
	foreach ($files as $file)
	{
		$filepath = $dir . $file;
		if (is_dir($filepath))
		{
			if ($file != '.' && $file != '..')
				$subdirs[] = $file;
		}
		else
		{
			$i = strrpos($file, '.');
			if ($i !== false && is_image($filepath))
			{
				$asset = $subdir . $file;
				if (is_background($file))
					$out['backgrounds'][] = $asset;
				else
					$out['assets'][] = $asset;
			}
		}
	}

	// Scan subdirs now so their entries are at the end of the list
	foreach ($subdirs as $sd)
	{
		$tmp = list_assets($subdir . $sd);
		$out['assets'] = array_merge($out['assets'], $tmp['assets']);
		$out['backgrounds'] = array_merge($out['backgrounds'], $tmp['backgrounds']);
	}

	if ($subdir != '')
		return $out;
	else
		echo json_encode($out);
}

//------------------------------------------------------------------------------

// Handle request
$invalidReq = false;
if (isset($_GET['save-scene']))
{
	if (!empty($_GET['name']) && !empty($_POST['json']))
		save_scene($_GET['name'], $_POST['json']);
	else
		$invalidReq = true;
}
else if (isset($_GET['load-scene']))
{
	if (!empty($_GET['name']))
		load_scene($_GET['name']);
	else
		$invalidReq = true;
}
else if (isset($_GET['list-scenes']))
{
	list_scenes();
}
else if (isset($_GET['list-assets']))
{
	list_assets();
}
else
{
	$invalidReq = true;
}

if ($invalidReq)
	echo "Invalid request";
?>
