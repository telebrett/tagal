CREATE TABLE setting (
 id int(10) unsigned auto_increment
,Name varchar(250)
,Value varchar(250)
,PRIMARY KEY(id)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE tag (
 id int(10) unsigned auto_increment
,Tag VARCHAR(250)
,IsPublic tinyint(0) NOT NULL DEFAULT '0'
,IsRestricted tinyint(0) NOT NULL DEFAULT '0'
,IsPerson tinyint(0) NOT NULL DEFAULT '0'
,PRIMARY KEY(id)
,INDEX(IsPublic)
,INDEX(IsRestricted)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE image (
 id int(10) unsigned auto_increment
,Location varchar(500) NOT NULL
,DateTaken datetime
,Width int unsigned
,Height int unsigned
-- If already public on S3
,IsPublic tinyint(1) UNSIGNED NOT NULL DEFAULT '0'
,PRIMARY KEY(id)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE image_tag (
 ImageID int(10) unsigned NOT NULL
,TagID int(10) unsigned NOT NULL
,Written tinyint(1) NOT NULL DEFAULT '0'
,PRIMARY KEY(ImageID,TagID)
) ENGINE=InnoDB CHARSET=UTF8;
