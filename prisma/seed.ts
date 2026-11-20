import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12)
    throw new Error('Укажите SEED_PASSWORD длиной от 12 символов в .env');
  if (await db.user.count())
    throw new Error('Seed предназначен для пустой БД; существующие данные не изменены');
  const hash = await argon2.hash(process.env.SEED_PASSWORD, { type: argon2.argon2id });
  await db.$transaction(
    async (tx) => {
      const roles = await Promise.all(
        (['ADMIN', 'MANAGER', 'TEACHER', 'INSTRUCTOR', 'CLUB_OPERATOR', 'ACCOUNTANT'] as const).map((code) =>
          tx.role.create({ data: { code } }),
        ),
      );
      const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
      const admin = await tx.user.create({
        data: {
          name: 'Демо Администратор',
          email: 'admin@example.test',
          passwordHash: hash,
          roleId: roleId('ADMIN'),
        },
      });
      for (let i = 1; i <= 2; i++)
        await tx.user.create({
          data: {
            name: `Демо Менеджер ${i}`,
            email: `manager${i}@example.test`,
            passwordHash: hash,
            roleId: roleId('MANAGER'),
          },
        });
      const teachers = [];
      for (let i = 1; i <= 5; i++) {
        const user = await tx.user.create({
          data: {
            name: `Демо Преподаватель ${i}`,
            email: `teacher${i}@example.test`,
            passwordHash: hash,
            roleId: roleId('TEACHER'),
          },
        });
        teachers.push(
          await tx.teacher.create({
            data: {
              name: user.name,
              email: user.email,
              phone: `+7000000010${i}`,
              specialization: 'Дополнительное образование',
              userId: user.id,
            },
          }),
        );
      }
      const courses = [];
      for (const name of [
        'Английский язык',
        'Подготовка к школе',
        'Математика',
        'Робототехника',
        'Рисование',
        'Танцы',
      ])
        courses.push(
          await tx.course.create({
            data: {
              name,
              description: 'Демонстрационное направление',
              minAge: 4,
              maxAge: 14,
              duration: 60,
            },
          }),
        );
      const rooms = [];
      for (let i = 1; i <= 3; i++)
        rooms.push(await tx.room.create({ data: { name: `Кабинет ${i}`, capacity: 12 } }));
      const groups = [];
      for (let i = 0; i < 8; i++)
        groups.push(
          await tx.group.create({
            data: {
              name: `${courses[i % 6]!.name} · ${i + 1}`,
              courseId: courses[i % 6]!.id,
              teacherId: teachers[i % 5]!.id,
              capacity: 10,
            },
          }),
        );
      const parents = [];
      for (let i = 1; i <= 40; i++)
        parents.push(
          await tx.parent.create({
            data: {
              name: `Представитель Демо ${String(i).padStart(2, '0')}`,
              phone: `+7000000${String(i).padStart(4, '0')}`,
              email: `parent${i}@example.test`,
              notes: 'Полностью вымышленная запись',
            },
          }),
        );
      const now = new Date();
      const joinedAt = new Date(+now - 60 * 86400000);
      const students = [];
      for (let i = 0; i < 50; i++) {
        const student = await tx.student.create({
          data: {
            name: `Ученик Демо ${String(i + 1).padStart(2, '0')}`,
            birthDate: new Date(Date.UTC(2015 + (i % 6), i % 12, 1 + (i % 25))),
            notes: 'Вымышленный ученик для защиты проекта',
            createdAt: new Date(+now - (i % 45) * 86400000),
            parents: {
              create: [
                { parentId: parents[i % 40]!.id },
                ...(i < 10 ? [{ parentId: parents[(i + 15) % 40]!.id }] : []),
              ],
            },
            enrollments: { create: { groupId: groups[i % 8]!.id, joinedAt } },
          },
        });
        students.push(student);
      }
      const tariffs = [];
      for (const [_index, limit] of [1, 4, 8, 12, null].entries())
        tariffs.push(
          await tx.tariffPlan.create({
            data: {
              name: limit === null ? 'Безлимитный месяц' : `${limit} занятий`,
              price: new Prisma.Decimal(limit === null ? 45000 : limit * 3500),
              lessonLimit: limit,
              validDays: limit === 1 ? 7 : 30,
              chargeAbsent: true,
            },
          }),
        );
      const subs = [];
      for (let i = 0; i < 50; i++) {
        const group = groups[i % 8]!,
          tariff = tariffs[i % 5]!;
        const start = new Date(+now - (i % 7 === 0 ? 45 : 10) * 86400000);
        const sub = await tx.subscription.create({
          data: {
            studentId: students[i]!.id,
            tariffId: tariff.id,
            groupId: group.id,
            courseId: group.courseId,
            price: tariff.price,
            lessonLimit: tariff.lessonLimit,
            chargeAbsent: tariff.chargeAbsent,
            chargeExcused: tariff.chargeExcused,
            chargeCancelled: false,
            startsAt: start,
            endsAt: new Date(+start + tariff.validDays * 86400000),
          },
        });
        subs.push(sub);
        const invoice = await tx.invoice.create({
          data: {
            studentId: sub.studentId,
            subscriptionId: sub.id,
            amount: sub.price,
            dueAt: start,
            createdAt: start,
          },
        });
        if (i % 3 !== 2) {
          const amount = i % 3 === 0 ? sub.price : sub.price.div(2);
          await tx.payment.create({
            data: {
              studentId: sub.studentId,
              amount,
              method: i % 2 ? 'CASH' : 'TRANSFER',
              idempotencyKey: crypto.randomUUID(),
              requestHash: 'SEED',
              recordedBy: admin.id,
              createdAt: start,
              allocations: { create: { invoiceId: invoice.id, amount } },
            },
          });
        }
      }
      const monday = new Date(now);
      monday.setUTCHours(4, 0, 0, 0);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      for (let g = 0; g < 8; g++) {
        const group = groups[g]!;
        const recurrence = await tx.recurrenceRule.create({ data: { count: 6, intervalWeeks: 1 } });
        for (let w = -2; w <= 3; w++) {
          const start = new Date(
            +monday + w * 7 * 86400000 + Math.floor(g / 3) * 86400000 + (g % 3) * 2 * 3600000,
          );
          const past = start < now;
          const lesson = await tx.lesson.create({
            data: {
              groupId: group.id,
              teacherId: group.teacherId,
              roomId: rooms[g % 3]!.id,
              recurrenceId: recurrence.id,
              startsAt: start,
              endsAt: new Date(+start + 3600000),
              status: past ? 'COMPLETED' : 'PLANNED',
            },
          });
          if (past)
            for (let i = g; i < students.length; i += 8) {
              const status = (['PRESENT', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const)[i % 5]!;
              const a = await tx.attendance.create({
                data: { studentId: students[i]!.id, lessonId: lesson.id, status },
              });
              await tx.attendanceHistory.create({
                data: { attendanceId: a.id, next: status, actorId: admin.id },
              });
              const sub = subs[i]!;
              const used = await tx.subscriptionUsage.count({ where: { subscriptionId: sub.id } });
              if (
                status !== 'EXCUSED' &&
                start >= sub.startsAt &&
                start <= sub.endsAt &&
                (sub.lessonLimit === null || used < sub.lessonLimit)
              )
                await tx.subscriptionUsage.create({
                  data: { subscriptionId: sub.id, attendanceId: a.id },
                });
            }
        }
      }
      const activities = [];
      for (const [name, minAge, maxAge, capacity, requiresConsent] of [
        ['Верёвочный парк', 6, 16, 8, true], ['Лучный тир', 8, 17, 6, true], ['Велопрогулка по лесу', 7, 16, 10, true],
        ['Творческая мастерская', 4, 14, 12, false], ['Катание на пони', 4, 12, 6, true], ['Йога на природе', 6, 16, 15, false],
      ] as const)
        activities.push(await tx.activity.create({ data: { name, description: 'Программа Oi-Qaragai для демонстрационного центра', minAge, maxAge, capacity, requiresConsent } }));
      const venues = [];
      for (const [name, zone, capacity] of [['Лесная тропа', 'Угуша', 12], ['Учебный склон', 'Oi-Qaragai', 10], ['Шатёр творчества', 'Эко-деревня', 20]] as const)
        venues.push(await tx.venue.create({ data: { name, zone, capacity } }));
      const inventory = [];
      for (const [name, inventoryNo, quantity] of [['Шлем детский', 'OQ-HELM-01', 20], ['Защитный жилет', 'OQ-VEST-01', 12], ['Лук учебный', 'OQ-BOW-01', 8]] as const)
        inventory.push(await tx.inventoryItem.create({ data: { name, inventoryNo, quantity } }));
      for (let i = 0; i < 12; i++) {
        const student = students[i]!; const parent = parents[i % parents.length]!;
        const consent = await tx.parentConsent.create({ data: { studentId: student.id, parentId: parent.id, consentType: 'АКТИВНОСТИ И ФОТО', validFrom: new Date(now.getUTCFullYear(), 0, 1), validUntil: new Date(now.getUTCFullYear(), 11, 31) } });
        const start = new Date(+now + (i + 1) * 86400000); start.setUTCHours(6 + (i % 3) * 2, 0, 0, 0);
        const booking = await tx.activityBooking.create({ data: { studentId: student.id, activityId: activities[i % activities.length]!.id, venueId: venues[i % venues.length]!.id, instructorId: teachers[i % teachers.length]!.id, consentId, startsAt: start, endsAt: new Date(+start + 60 * 60000), status: 'RESERVED', price: new Prisma.Decimal(5000) } });
        if (i < 4) await tx.inventoryIssue.create({ data: { bookingId: booking.id, itemId: inventory[i % inventory.length]!.id, quantity: 1 } });
      }
      await tx.setting.create({ data: { key: 'centerName', value: 'Орбита · детский центр' } });
    },
    { timeout: 60000 },
  );
  console.log(
    'Seed создан: 8 пользователей, 50 учеников, 40 представителей, 8 групп, 48 занятий. Вход: admin@example.test; пароль из SEED_PASSWORD.',
  );
}
main().finally(() => db.$disconnect());
