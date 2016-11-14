<?php

require_once('init.lib');

$sql = new SELECT_SQL('image');
$sql->col($sql->getAlias() . '.t');
$alias = $sql->join('image_tag',$sql::JA . ".ImageID = {$sql->getAlias()}.id AND " . $sql::JA . '.f = ?',FALSE,array(12));

print var_export($sql->toString(),true) . "\n\n";
