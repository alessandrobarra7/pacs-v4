CREATE TABLE `dicom_annotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`study_instance_uid` varchar(128) NOT NULL,
	`series_instance_uid` varchar(128),
	`user_id` int NOT NULL,
	`tool_name` varchar(64) NOT NULL DEFAULT 'Length',
	`annotation_uid` varchar(128) NOT NULL,
	`annotation_data` json NOT NULL,
	`label` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dicom_annotations_id` PRIMARY KEY(`id`),
	CONSTRAINT `dicom_annotations_annotation_uid_unique` UNIQUE(`annotation_uid`)
);
