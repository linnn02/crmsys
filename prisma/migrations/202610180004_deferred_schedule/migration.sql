BEGIN;
-- A whole-series shift can temporarily overlap the old position of the next lesson.
-- Validate exclusion at commit while keeping service checks and Serializable isolation.
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_teacher_no_overlap";
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_room_no_overlap";
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_group_no_overlap";
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_teacher_no_overlap" EXCLUDE USING gist ("teacherId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&) WHERE (status <> 'CANCELLED') DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_room_no_overlap" EXCLUDE USING gist ("roomId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&) WHERE (status <> 'CANCELLED') DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_group_no_overlap" EXCLUDE USING gist ("groupId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&) WHERE (status <> 'CANCELLED') DEFERRABLE INITIALLY DEFERRED;
COMMIT;
