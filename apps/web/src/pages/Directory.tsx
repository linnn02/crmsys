import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Pencil, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, send, text, value, date, type List, type Row } from '../api/client';
import { Button } from '../components/ui/button';
import { RecordForm, type Field } from '../components/RecordForm';
import { Loading, ErrorState, Empty } from '../components/States';
import { useAuth } from '../hooks/auth';
const statusOptions = [
  { value: 'ACTIVE', label: 'Активный' },
  { value: 'PAUSED', label: 'Приостановлен' },
  { value: 'ARCHIVED', label: 'Архивный' },
];
const base: Field[] = [{ key: 'name', label: 'ФИО', required: true }];
export const labels: Record<string, string> = {
  students: 'Ученики',
  parents: 'Родители',
  teachers: 'Преподаватели',
  groups: 'Группы',
  courses: 'Направления',
  rooms: 'Кабинеты',
  tariffs: 'Тарифы',
};
const columns: Record<string, [string, string][]> = {
  students: [
    ['name', 'Ученик'],
    ['age', 'Возраст'],
    ['status', 'Статус'],
    ['createdAt', 'Регистрация'],
  ],
  parents: [
    ['name', 'Представитель'],
    ['phone', 'Телефон'],
    ['email', 'Email'],
    ['preferredContact', 'Связь'],
    ['students', 'Дети'],
  ],
  teachers: [
    ['name', 'Преподаватель'],
    ['specialization', 'Специализация'],
    ['phone', 'Телефон'],
    ['status', 'Статус'],
    ['groups', 'Группы'],
  ],
  groups: [
    ['name', 'Группа'],
    ['course.name', 'Направление'],
    ['teacher.name', 'Преподаватель'],
    ['capacity', 'Вместимость'],
    ['status', 'Статус'],
    ['enrollments', 'Ученики'],
  ],
  courses: [
    ['name', 'Направление'],
    ['minAge', 'Возраст от'],
    ['maxAge', 'Возраст до'],
    ['duration', 'Минут'],
  ],
  rooms: [
    ['name', 'Кабинет'],
    ['capacity', 'Мест'],
  ],
  tariffs: [
    ['name', 'Тариф'],
    ['price', 'Цена, KZT'],
    ['lessonLimit', 'Занятий'],
    ['validDays', 'Дней'],
  ],
};
export function Directory({ resource }: { resource: string }) {
  const user = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [groupId, setGroupId] = useState('');
  const filterGroups = useQuery({
    queryKey: ['studentFilterGroups', user.role],
    enabled: resource === 'students',
    queryFn: () => api<List>(user.role === 'TEACHER' ? '/my/groups' : '/groups?pageSize=100'),
  });
  const [editing, setEditing] = useState<Row | false | null>(null);
  const q = useQuery({
    queryKey: [resource, page, search, status, groupId],
    queryFn: () =>
      api<List>(
        `/${resource}?page=${page}&search=${encodeURIComponent(search)}${status ? '&status=' + status : ''}${groupId ? '&groupId=' + groupId : ''}`,
      ),
  });
  const refs = useQuery<Record<string, List>>({
    queryKey: ['references', resource],
    enabled: user.role !== 'TEACHER',
    queryFn: async () => {
      const names =
        resource === 'students'
          ? ['parents']
          : resource === 'groups'
            ? ['courses', 'teachers']
            : resource === 'teachers' && user.role === 'ADMIN'
              ? ['users']
              : [];
      return Object.fromEntries(
        await Promise.all(names.map(async (n) => [n, await api<List>('/' + n + '?pageSize=100')])),
      );
    },
  });
  const options = (n: string) =>
    refs.data?.[n]?.items.map((r: Row) => ({ value: r.id, label: text(r, 'name') })) ?? [];
  const fields: Record<string, Field[]> = {
    students: [
      ...base,
      { key: 'birthDate', label: 'Дата рождения', type: 'date', required: true },
      {
        key: 'gender',
        label: 'Пол',
        type: 'select',
        options: [
          { value: 'MALE', label: 'Мужской' },
          { value: 'FEMALE', label: 'Женский' },
        ],
      },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: statusOptions },
      {
        key: 'parentIds',
        label: 'Представители (Ctrl для нескольких)',
        type: 'multiselect',
        required: true,
        options: options('parents'),
      },
      { key: 'notes', label: 'Примечания' },
    ],
    parents: [
      ...base,
      { key: 'phone', label: 'Телефон', required: true },
      { key: 'email', label: 'Email' },
      {
        key: 'preferredContact',
        label: 'Предпочтительная связь',
        type: 'select',
        required: true,
        options: [
          { value: 'PHONE', label: 'Телефон' },
          { value: 'EMAIL', label: 'Email' },
          { value: 'MESSENGER', label: 'Мессенджер' },
        ],
      },
      { key: 'notes', label: 'Примечания' },
    ],
    teachers: [
      ...base,
      { key: 'phone', label: 'Телефон', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'specialization', label: 'Специализация', required: true },
      { key: 'status', label: 'Статус', type: 'select', options: statusOptions, required: true },
      { key: 'userId', label: 'Учётная запись', type: 'select', options: options('users') },
    ],
    groups: [
      { key: 'name', label: 'Название', required: true },
      {
        key: 'courseId',
        label: 'Направление',
        type: 'select',
        required: true,
        options: options('courses'),
      },
      {
        key: 'teacherId',
        label: 'Преподаватель',
        type: 'select',
        required: true,
        options: options('teachers'),
      },
      { key: 'capacity', label: 'Вместимость', type: 'number', required: true, min: 1 },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: statusOptions },
    ],
    courses: [
      { key: 'name', label: 'Название', required: true },
      { key: 'description', label: 'Описание' },
      { key: 'minAge', label: 'Возраст от', type: 'number', required: true },
      { key: 'maxAge', label: 'Возраст до', type: 'number', required: true },
      { key: 'duration', label: 'Длительность, минут', type: 'number', required: true, min: 15 },
    ],
    rooms: [
      { key: 'name', label: 'Название', required: true },
      { key: 'capacity', label: 'Вместимость', type: 'number', required: true, min: 1 },
    ],
    tariffs: [
      { key: 'name', label: 'Название', required: true },
      { key: 'price', label: 'Стоимость, KZT', required: true },
      {
        key: 'lessonLimit',
        label: 'Занятий (пусто — безлимит)',
        type: 'number',
        nullable: true,
        min: 1,
      },
      { key: 'validDays', label: 'Срок, дней', type: 'number', required: true, min: 1 },
      { key: 'chargeAbsent', label: 'Списывать при пропуске', type: 'checkbox' },
      { key: 'chargeExcused', label: 'Списывать при уважительной причине', type: 'checkbox' },
      { key: 'active', label: 'Тариф доступен', type: 'checkbox' },
    ],
  };
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      send(
        '/' + resource + (editing ? '/' + editing.id : ''),
        {
          ...data,
          ...(resource === 'students' ? { gender: data.gender || null } : {}),
          ...(resource === 'teachers' ? { userId: data.userId || null } : {}),
        },
        editing ? 'PUT' : 'POST',
      ),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries();
      toast.success('Данные сохранены');
    },
  });
  const canEdit =
    user.role === 'ADMIN' ||
    (user.role === 'MANAGER' && ['students', 'parents', 'groups'].includes(resource));
  const initial = editing
    ? {
        ...editing,
        birthDate: String(editing.birthDate ?? '').slice(0, 10),
        parentIds: Array.isArray(editing.parents)
          ? editing.parents.map((p) => text(p, 'parentId'))
          : [],
      }
    : { status: 'ACTIVE', preferredContact: 'PHONE', active: true, chargeAbsent: true };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">УПРАВЛЕНИЕ ЦЕНТРОМ</span>
          <h1>{labels[resource]}</h1>
          <p>Актуальная информация и история взаимодействия</p>
        </div>
        {canEdit && (
          <Button
            onClick={() => {
              mutation.reset();
              setEditing(false);
            }}
          >
            <Plus size={17} />
            Добавить
          </Button>
        )}
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Поиск"
              placeholder={
                resource === 'students'
                  ? 'Имя ученика или телефон родителя'
                  : 'Поиск по имени или названию'
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {resource === 'students' && (
            <select
              aria-label="Статус"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все статусы</option>
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {resource === 'students' && (
            <select
              aria-label="Группа"
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все группы</option>
              {filterGroups.data?.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {text(g, 'name')}
                </option>
              ))}
            </select>
          )}
          <span className="muted">Всего: {q.data?.total ?? '…'}</span>
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : !q.data.items.length ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns[resource]?.map(([key, title]) => (
                    <th key={key}>{title}</th>
                  ))}
                  {canEdit && <th>Действия</th>}
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((row) => (
                  <tr key={row.id}>
                    {columns[resource]?.map(([key]) => (
                      <td key={key}>
                        {key === 'name' ? (
                          <div className="name-cell">
                            <span className="avatar">{text(row, key).slice(0, 1)}</span>
                            {resource === 'students' ? (
                              <Link to={'/students/' + row.id}>{text(row, key)}</Link>
                            ) : (
                              <b>{text(row, key)}</b>
                            )}
                          </div>
                        ) : key === 'status' ? (
                          <span
                            className={'badge ' + (row.status === 'ACTIVE' ? 'green' : 'orange')}
                          >
                            {statusOptions.find((o) => o.value === row.status)?.label}
                          </span>
                        ) : ['students', 'enrollments', 'groups'].includes(key) ? (
                          <div style={{ maxWidth: 260, whiteSpace: 'normal' }}>
                            {(Array.isArray(row[key]) ? (row[key] as Row[]) : []).map(
                              (item, index) => (
                                <small key={item.id ?? index}>
                                  {text(item, key === 'groups' ? 'name' : 'student.name')}
                                </small>
                              ),
                            )}
                          </div>
                        ) : key === 'preferredContact' ? (
                          (
                            { PHONE: 'Телефон', EMAIL: 'Email', MESSENGER: 'Мессенджер' } as Record<
                              string,
                              string
                            >
                          )[text(row, key)]
                        ) : key === 'createdAt' ? (
                          date(row[key])
                        ) : (
                          text(row, key)
                        )}
                      </td>
                    ))}
                    {canEdit && (
                      <td>
                        <div className="actions">
                          <Button
                            variant="ghost"
                            aria-label={'Редактировать ' + text(row, 'name')}
                            onClick={() => {
                              mutation.reset();
                              setEditing(row);
                            }}
                          >
                            <Pencil size={16} />
                          </Button>
                          {resource === 'students' && row.status !== 'ARCHIVED' && (
                            <Button
                              variant="ghost"
                              aria-label="Архивировать"
                              onClick={() => {
                                if (confirm('Архивировать ученика? Финансовая история сохранится.'))
                                  void send('/students/' + row.id + '/archive', {})
                                    .then(() => {
                                      void qc.invalidateQueries();
                                      toast.success('Ученик архивирован');
                                    })
                                    .catch((e) => toast.error((e as Error).message));
                              }}
                            >
                              <Archive size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>Страница {page}</span>
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Предыдущая страница"
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="outline"
            disabled={page * 20 >= (q.data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Следующая страница"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </section>
      {editing !== null && (
        <RecordForm
          title={editing ? 'Редактирование' : 'Новая запись'}
          fields={fields[resource] ?? []}
          initial={initial}
          onClose={() => setEditing(null)}
          onSave={(data) => mutation.mutate(data)}
          pending={mutation.isPending}
          error={mutation.error}
        />
      )}
    </>
  );
}
export function StudentCard({ id }: { id: string }) {
  const user = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['student', id], queryFn: () => api<Row>('/students/' + id) });
  const groups = useQuery({
    queryKey: ['enrollmentGroups'],
    enabled: user.role !== 'TEACHER',
    queryFn: () => api<List>('/groups?pageSize=100'),
  });
  const [group, setGroup] = useState('');
  const assign = useMutation({
    mutationFn: () => send('/groups/' + group + '/enrollments', { studentId: id }),
    onSuccess: () => {
      void qc.invalidateQueries();
      toast.success('Ученик записан');
    },
    onError: (e) => toast.error(e.message),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const s = q.data;
  const array = (key: string) => (Array.isArray(s[key]) ? (s[key] as Row[]) : []);
  return (
    <>
      <Link to="/students">← Все ученики</Link>
      <div className="page-heading">
        <div>
          <h1>{text(s, 'name')}</h1>
          <p>
            {text(s, 'age')} лет · дата рождения {date(s.birthDate)}
          </p>
        </div>
        <span className="badge purple">Карточка ученика</span>
      </div>
      <div className="dashboard-grid">
        <section className="panel padded">
          <h2>Представители</h2>
          {array('parents').map((p) => (
            <div className="list-row" key={text(p, 'parentId')}>
              <b>{text(p, 'parent.name')}</b>
              <span>{text(p, 'parent.phone')}</span>
            </div>
          ))}
          <p>{text(s, 'notes')}</p>
        </section>
        <section className="panel padded">
          <h2>Группы и история записи</h2>
          {array('enrollments').map((e) => (
            <div className="list-row" key={e.id}>
              <div>
                <b>{text(e, 'group.name')}</b>
                <small>
                  {e.leftAt ? 'Завершено ' + date(e.leftAt) : 'Посещает с ' + date(e.joinedAt)}
                </small>
              </div>
              {!e.leftAt && user.role !== 'TEACHER' && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (confirm('Завершить запись в группу?'))
                      void api('/groups/' + text(e, 'groupId') + '/enrollments/' + id, {
                        method: 'DELETE',
                      })
                        .then(() => qc.invalidateQueries())
                        .catch((e) => toast.error((e as Error).message));
                  }}
                >
                  Отчислить
                </Button>
              )}
            </div>
          ))}
          {user.role !== 'TEACHER' && (
            <div className="toolbar">
              <select
                aria-label="Группа для записи"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="">Выберите группу</option>
                {groups.data?.items.map((g) => (
                  <option key={g.id} value={g.id}>
                    {text(g, 'name')}
                  </option>
                ))}
              </select>
              <Button disabled={!group || assign.isPending} onClick={() => assign.mutate()}>
                Записать
              </Button>
            </div>
          )}
        </section>
        <section className="panel padded">
          <h2>История посещений</h2>
          {array('attendance').length ? (
            array('attendance').map((a) => (
              <div className="list-row" key={a.id}>
                <div>
                  <b>{text(a, 'lesson.group.name')}</b>
                  <small>{date(value(a, 'lesson.startsAt'))}</small>
                </div>
                <span>
                  {
                    (
                      {
                        PRESENT: 'Присутствовал',
                        ABSENT: 'Отсутствовал',
                        EXCUSED: 'Уважительная причина',
                        LATE: 'Опоздал',
                      } as Record<string, string>
                    )[text(a, 'status')]
                  }
                </span>
              </div>
            ))
          ) : (
            <Empty />
          )}
        </section>
        {user.role !== 'TEACHER' && (
          <section className="panel padded">
            <h2>Финансовая история</h2>
            <h3>Абонементы</h3>
            {array('subscriptions').map((a) => (
              <div className="list-row" key={a.id}>
                <span>{text(a, 'tariff.name')}</span>
                <span>до {date(a.endsAt)}</span>
              </div>
            ))}
            <h3>Платежи</h3>
            {array('payments').map((p) => (
              <div className="list-row" key={p.id}>
                <span>{date(p.createdAt)}</span>
                <b>{text(p, 'amount')} ₸</b>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
