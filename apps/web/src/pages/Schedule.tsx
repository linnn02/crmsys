import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import listPlugin from '@fullcalendar/react/list';
import interactionPlugin from '@fullcalendar/react/interaction';
import themePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import ruLocale from '@fullcalendar/react/locales/ru';
import { DateTime } from 'luxon';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, send, type Row, type List, text } from '../api/client';
import { Button } from '../components/ui/button';
import { RecordForm, type Field } from '../components/RecordForm';
import { Loading, ErrorState } from '../components/States';
import { useAuth } from '../hooks/auth';
export function Schedule() {
  const user = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | false | null>(null);
  const [scope, setScope] = useState('ONE');
  const [range, setRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString(),
    to: new Date(Date.now() + 60 * 86400000).toISOString(),
  });
  const [groupId, setGroupId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const q = useQuery({
    queryKey: ['lessons', range, groupId, teacherId],
    queryFn: () =>
      api<List>(
        `/lessons?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}${groupId ? '&groupId=' + groupId : ''}${teacherId ? '&teacherId=' + teacherId : ''}`,
      ),
  });
  const refs = useQuery<Record<string, List>>({
    queryKey: ['scheduleRefs'],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          (user.role === 'TEACHER' ? ['my/groups'] : ['groups', 'teachers', 'rooms']).map(
            async (n) => [n, await api<List>('/' + n + '?pageSize=100')],
          ),
        ),
      ),
  });
  const options = (n: string) =>
    refs.data?.[n]?.items.map((r: Row) => ({ value: r.id, label: text(r, 'name') })) ?? [];
  const fields: Field[] = [
    { key: 'groupId', label: 'Группа', type: 'select', required: true, options: options('groups') },
    {
      key: 'teacherId',
      label: 'Преподаватель',
      type: 'select',
      required: true,
      options: options('teachers'),
    },
    { key: 'roomId', label: 'Кабинет', type: 'select', required: true, options: options('rooms') },
    { key: 'startsAt', label: 'Начало (Алматы)', type: 'datetime-local', required: true },
    { key: 'endsAt', label: 'Окончание (Алматы)', type: 'datetime-local', required: true },
    ...(!editing
      ? [
          {
            key: 'count',
            label: 'Количество повторений',
            type: 'number' as const,
            min: 1,
            required: true,
          },
          {
            key: 'intervalWeeks',
            label: 'Интервал, недель',
            type: 'number' as const,
            min: 1,
            required: true,
          },
        ]
      : []),
  ];
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      send(
        '/lessons' + (editing ? '/' + editing.id + '?scope=' + scope : ''),
        {
          ...data,
          startsAt: DateTime.fromISO(String(data.startsAt), { zone: 'Asia/Almaty' }).toISO(),
          endsAt: DateTime.fromISO(String(data.endsAt), { zone: 'Asia/Almaty' }).toISO(),
        },
        editing ? 'PUT' : 'POST',
      ),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries();
      toast.success('Расписание сохранено');
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">УЧЕБНЫЙ ПРОЦЕСС</span>
          <h1>Расписание</h1>
          <p>Занятия центра · часовой пояс Алматы (UTC+5)</p>
        </div>
        {user.role !== 'TEACHER' && (
          <Button
            onClick={() => {
              mutation.reset();
              setEditing(false);
            }}
          >
            <Plus size={17} />
            Создать занятие
          </Button>
        )}
      </div>
      <section className="panel padded">
        <div className="toolbar">
          <select
            aria-label="Фильтр по группе"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">Все группы</option>
            {options(user.role === 'TEACHER' ? 'my/groups' : 'groups').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {user.role !== 'TEACHER' && (
            <select
              aria-label="Фильтр по преподавателю"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">Все преподаватели</option>
              {options('teachers').map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <span className="badge purple">Запланировано</span>
          <span className="badge green">Проведено</span>
          <span className="badge gray">Отменено</span>
        </div>
        {q.error ? (
          <ErrorState error={q.error} />
        ) : (
          <>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, themePlugin]}
              locale={ruLocale}
              timeZone="Asia/Almaty"
              initialView="timeGridWeek"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
              }}
              height="auto"
              slotMinTime="07:00:00"
              slotMaxTime="22:00:00"
              allDaySlot={false}
              nowIndicator
              datesSet={(r) => setRange({ from: r.start.toISOString(), to: r.end.toISOString() })}
              events={
                q.data?.items.map((l) => ({
                  id: l.id,
                  title: text(l, 'group.name'),
                  start: String(l.startsAt),
                  end: String(l.endsAt),
                  color:
                    l.status === 'COMPLETED'
                      ? '#3ca782'
                      : l.status === 'CANCELLED'
                        ? '#9ca3af'
                        : '#8056df',
                  extendedProps: l,
                })) ?? []
              }
              eventClick={(e) => {
                if (user.role !== 'TEACHER') {
                  mutation.reset();
                  setScope('ONE');
                  setEditing(e.event.extendedProps as Row);
                }
              }}
            />
            {q.isFetching && <small className="muted">Обновляем календарь…</small>}
          </>
        )}
      </section>
      {editing !== null && (
        <>
          <RecordForm
            title={editing ? 'Изменить занятие' : 'Новое занятие'}
            fields={fields}
            initial={
              editing
                ? {
                    ...editing,
                    startsAt: DateTime.fromISO(String(editing.startsAt))
                      .setZone('Asia/Almaty')
                      .toFormat("yyyy-MM-dd'T'HH:mm"),
                    endsAt: DateTime.fromISO(String(editing.endsAt))
                      .setZone('Asia/Almaty')
                      .toFormat("yyyy-MM-dd'T'HH:mm"),
                  }
                : { count: 1, intervalWeeks: 1 }
            }
            onClose={() => setEditing(null)}
            onSave={(data) => mutation.mutate(data)}
            error={mutation.error}
            pending={mutation.isPending}
          >
            {editing && (
              <div className="toolbar">
                <select
                  aria-label="Область редактирования"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                >
                  <option value="ONE">Только это занятие</option>
                  <option value="SERIES">Вся запланированная серия</option>
                </select>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (confirm('Отменить занятие и вернуть списания?'))
                      void send('/lessons/' + editing.id + '/cancel', {})
                        .then(() => {
                          setEditing(null);
                          void qc.invalidateQueries();
                          toast.success('Занятие отменено');
                        })
                        .catch((e) => toast.error((e as Error).message));
                  }}
                >
                  Отменить занятие
                </Button>
              </div>
            )}
          </RecordForm>
        </>
      )}
    </>
  );
}
const attendanceLabels = {
  PRESENT: 'Присутствовал',
  ABSENT: 'Отсутствовал',
  EXCUSED: 'Уважительная причина',
  LATE: 'Опоздал',
};
export function Attendance() {
  const qc = useQueryClient();
  const [lessonId, setLessonId] = useState('');
  const [marks, setMarks] = useState<Record<string, string>>({});
  const lessons = useQuery({
    queryKey: ['attendanceLessons'],
    queryFn: () => api<List>('/lessons'),
  });
  const q = useQuery({
    queryKey: ['attendance', lessonId],
    enabled: !!lessonId,
    queryFn: () => api<{ students: Row[]; entries: Row[]; lesson: Row }>('/attendance/' + lessonId),
  });
  const mutation = useMutation({
    mutationFn: () =>
      send(
        '/attendance/' + lessonId,
        {
          entries: q.data?.students.map((s) => ({
            studentId: s.id,
            status:
              marks[s.id] ??
              String(q.data.entries.find((e) => e.studentId === s.id)?.status ?? 'PRESENT'),
          })),
        },
        'PUT',
      ),
    onSuccess: () => {
      void qc.invalidateQueries();
      toast.success('Посещаемость сохранена');
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">УЧЕБНЫЙ ПРОЦЕСС</span>
          <h1>Посещаемость</h1>
          <p>Отметки сохраняются вместе с историей изменений</p>
        </div>
      </div>
      <section className="panel padded">
        <label>
          Выберите занятие
          <select
            value={lessonId}
            onChange={(e) => {
              setLessonId(e.target.value);
              setMarks({});
            }}
          >
            <option value="">Выберите занятие…</option>
            {lessons.data?.items
              .filter((l) => l.status !== 'CANCELLED' && new Date(String(l.startsAt)) < new Date())
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {text(l, 'group.name')} ·{' '}
                  {new Date(String(l.startsAt)).toLocaleString('ru', { timeZone: 'Asia/Almaty' })}
                </option>
              ))}
          </select>
        </label>
        {lessonId &&
          (q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} />
          ) : (
            <>
              <div className="toolbar">
                <Button
                  variant="outline"
                  onClick={() =>
                    setMarks(Object.fromEntries(q.data.students.map((s) => [s.id, 'PRESENT'])))
                  }
                >
                  Все присутствовали
                </Button>
              </div>
              {q.data.students.map((s) => (
                <div className="list-row" key={s.id}>
                  <b>{text(s, 'name')}</b>
                  <select
                    aria-label={'Отметка ' + text(s, 'name')}
                    value={
                      marks[s.id] ??
                      String(q.data.entries.find((e) => e.studentId === s.id)?.status ?? 'PRESENT')
                    }
                    onChange={(e) => setMarks({ ...marks, [s.id]: e.target.value })}
                  >
                    {Object.entries(attendanceLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <Button
                disabled={mutation.isPending || !q.data.students.length}
                onClick={() => mutation.mutate()}
              >
                Сохранить посещаемость
              </Button>
            </>
          ))}
      </section>
    </>
  );
}
