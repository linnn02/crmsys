import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, send, type List, type Row, text, date } from '../api/client';
import { RecordForm } from '../components/RecordForm';
import { Button } from '../components/ui/button';
import { Loading, ErrorState, Empty } from '../components/States';
import { Directory } from './Directory';
export function Settings() {
  const [tab, setTab] = useState('users');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<List>('/users') });
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      send(
        '/users' + (editing ? '/' + editing.id : ''),
        { ...data, password: data.password || undefined },
        editing ? 'PATCH' : 'POST',
      ),
    onSuccess: () => {
      setAdding(false);
      setEditing(null);
      void qc.invalidateQueries();
      toast.success('Пользователь сохранён');
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">АДМИНИСТРИРОВАНИЕ</span>
          <h1>Настройки</h1>
          <p>Пользователи, направления и тарифы центра</p>
        </div>
      </div>
      <div className="tabs">
        {[
          ['users', 'Пользователи'],
          ['courses', 'Направления'],
          ['rooms', 'Кабинеты'],
          ['tariffs', 'Тарифы'],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={key === tab ? 'default' : 'outline'}
            onClick={() => setTab(key!)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab !== 'users' ? (
        <Directory key={tab} resource={tab} />
      ) : (
        <section className="panel padded">
          <div className="panel-heading">
            <h2>Учётные записи</h2>
            <Button
              onClick={() => {
                save.reset();
                setEditing(null);
                setAdding(true);
              }}
            >
              Добавить пользователя
            </Button>
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} />
          ) : (
            q.data.items.map((u) => (
              <div className="list-row" key={u.id}>
                <div>
                  <b>{text(u, 'name')}</b>
                  <small>
                    {text(u, 'email')} · {text(u, 'role.code')}
                  </small>
                </div>
                <div className="actions">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      save.reset();
                      setEditing(u);
                      setAdding(true);
                    }}
                  >
                    Редактировать
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm(u.active ? 'Отключить доступ пользователя?' : 'Включить доступ?'))
                        void send('/users/' + u.id, { active: !u.active }, 'PATCH')
                          .then(() => qc.invalidateQueries())
                          .catch((e) => toast.error((e as Error).message));
                    }}
                  >
                    {u.active ? 'Отключить' : 'Включить'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </section>
      )}
      {adding && (
        <RecordForm
          title={editing ? 'Редактирование пользователя' : 'Новый пользователь'}
          initial={editing ? { ...editing, role: text(editing, 'role.code') } : {}}
          fields={[
            { key: 'name', label: 'ФИО', required: true },
            { key: 'email', label: 'Email', type: 'email', required: true },
            {
              key: 'password',
              label: editing ? 'Новый пароль (пусто — не менять)' : 'Пароль (не менее 12 символов)',
              type: 'password',
              required: !editing,
            },
            {
              key: 'role',
              label: 'Роль',
              type: 'select',
              required: true,
              options: [
                { value: 'ADMIN', label: 'Администратор' },
                { value: 'MANAGER', label: 'Менеджер' },
                { value: 'TEACHER', label: 'Преподаватель' },
              ],
            },
          ]}
          onSave={(d) => save.mutate(d)}
          pending={save.isPending}
          error={save.error}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
export function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<List>('/notifications') });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ДЕРЖИМ В КУРСЕ</span>
          <h1>Уведомления</h1>
          <p>Изменения расписания и события центра</p>
        </div>
      </div>
      <section className="panel padded">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : q.data.items.length ? (
          q.data.items.map((n) => (
            <div className="list-row" key={n.id}>
              <div>
                <b>{text(n, 'message')}</b>
                <small>{date(n.createdAt)}</small>
              </div>
              {n.readAt ? (
                <span className="badge gray">Прочитано</span>
              ) : (
                <Button
                  variant="outline"
                  onClick={() =>
                    void send('/notifications/' + n.id + '/read', {})
                      .then(() => qc.invalidateQueries())
                      .catch((e) => toast.error((e as Error).message))
                  }
                >
                  Прочитано
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty />
        )}
      </section>
    </>
  );
}
