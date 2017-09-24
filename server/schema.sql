CREATE TABLE setting (
 id int(10) unsigned auto_increment
,Name varchar(250)
,Value varchar(250)
,PRIMARY KEY(id)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE tag (
 id int(10) unsigned auto_increment
,Tag VARCHAR(250)
,IsPerson tinyint(0) NOT NULL DEFAULT '0'
,PRIMARY KEY(id)
,INDEX(Tag)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE image (
 id int(10) unsigned auto_increment
,Location varchar(500) NOT NULL
,DateTaken datetime
,Width int unsigned
,Height int unsigned
-- If already public on S3
,IsPublic tinyint(1) UNSIGNED NOT NULL DEFAULT '0'
,IsDirty tinyint(1) UNSIGNED NOT NULL DEFAULT '0'
,PRIMARY KEY(id)
) ENGINE=InnoDB CHARSET=UTF8;

CREATE TABLE image_tag (
 ImageID int(10) unsigned NOT NULL
,TagID int(10) unsigned NOT NULL
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
