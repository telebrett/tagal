-- Requires MySQL/MariaDB 5.6+
CREATE TABLE setting (
 id int(10) unsigned auto_increment
,Name varchar(250)
,Value varchar(250)
,PRIMARY KEY(id)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE tag (
 id int(10) unsigned auto_increment
,Tag VARCHAR(250) CHARACTER SET utf8 COLLATE utf8_bin
,IsPerson tinyint(0) NOT NULL DEFAULT '0'
, DateAdded DateAdded NOT NULL,
,PRIMARY KEY(id)
,UNIQUE INDEX(Tag)
,INDEX(DateAdded)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE camera (
 id int(10) unsigned auto_increment
 , Name VARCHAR(250) CHARACTER SET utf8 COLLATE utf8_bin
 , PRIMARY KEY(id)
 ,UNIQUE INDEX(Name)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE geometry (
 id int(10) unsigned auto_increment
 , Geometry GEOMETRY NOT NULL
 , DateAdded DateAdded NOT NULL,
 , PRIMARY KEY(id)
 , SPATIAL INDEX(Geometry)
 , INDEX(DateAdded)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE image (
 id int(10) unsigned auto_increment
,Location varchar(500) NOT NULL
,DateTaken datetime
,Width int unsigned
,Height int unsigned
-- If already public on S3
,IsPublic tinyint(1) UNSIGNED NOT NULL DEFAULT '0'
,IsVideo tinyint(1) UNSIGNED NOT NULL DEFAULT '0'
,CameraID int(10) unsigned
,GeometryID int(10) unsigned
,PRIMARY KEY(id)
,FOREIGN KEY(CameraID) REFERENCES camera(id)
,FOREIGN KEY(GeometryID) REFERENCES geometry(id)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE image_tag (
 ImageID int(10) unsigned NOT NULL
,TagID int(10) unsigned NOT NULL
,IsWritten tinyint(1) unsigned NOT NULL
,IsDeleted tinyint(1) unsigned NOT NULL
,PRIMARY KEY(ImageID,TagID)
,FOREIGN KEY(ImageID) REFERENCES image(id)
,FOREIGN KEY(TagID) REFERENCES tag(id)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE s3user (
 id int(10) unsigned NOT NULL AUTO_INCREMENT
 ,Username varchar(100) NOT NULL
 ,AccessKey varchar(250) NOT NULL
 ,PRIMARY KEY(id)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE s3user_tag (
 S3UserID int(10) unsigned NOT NULL
,TagID int(10) unsigned NOT NULL
,PRIMARY KEY(S3UserID,TagID)
,FOREIGN KEY(S3UserID) REFERENCES s3user(id)
,FOREIGN KEY(TagID) REFERENCES tag(id)
) ENGINE=InnoDB CHARSET=UTF8;
