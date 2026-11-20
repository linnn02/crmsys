import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
} from 'recharts';
import { Users, Wallet, CalendarDays, Activity, ArrowUpRight, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, type Row, type List, money, date, text } from '../api/client';
import { Loading, ErrorState, Empty } from '../components/States';
import { useAuth } from '../hooks/auth';
type Stats = {
  activeStudents: number;
  newStudents: number;
  groupCount: number;
  completedLessons: number;
  attendancePercent: number;
  receipts?: string;
  debt?: string;
  charges?: string;
  activeSubscriptions?: number;
  todayLessons: number;
  expiringSubscriptions?: number;
  expiredSubscriptions?: number;
  courseDistribution: { name: string; count: number }[];
  studentTrend: { date: string; count: number }[];
  paymentChart?: { date: string; amount: string }[];
  attendanceChart: { date: string; present: number; total: number }[];
  upcoming: Row[];
  recentPayments?: Row[];
  attention?: Row[];
  groups: { name: string; students: number; capacity: number }[];
};
export function Dashboard({ analytics = false }: { analytics?: boolean }) {
  const user = useAuth();
  const [days, setDays] = useState(30);
  const [groupId, setGroupId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const refs = useQuery({
    queryKey: ['analyticsRefs', user.role],
    queryFn: async () => ({
      groups: await api<List>(user.role === 'TEACHER' ? '/my/groups' : '/groups?pageSize=100'),
      courses:
        user.role === 'TEACHER'
          ? ({ items: [] } as List)
          : await api<List>('/courses?pageSize=100'),
    }),
  });
  const q = useQuery({
    queryKey: ['analytics', days, groupId, courseId, from, to],
    queryFn: () =>
      api<Stats>(
        '/analytics?' +
          new URLSearchParams({
            from: from
              ? new Date(from + 'T00:00:00+05:00').toISOString()
              : new Date(Date.now() - days * 86400000).toISOString(),
            ...(to ? { to: new Date(to + 'T23:59:59+05:00').toISOString() } : {}),
            ...(groupId ? { groupId } : {}),
            ...(courseId ? { courseId } : {}),
          }),
      ),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const d = q.data;
  const cards = [
    {
      label: 'Активные ученики',
      value: d.activeStudents,
      note: `${d.newStudents} новых за период`,
      icon: Users,
      color: 'purple',
    },
    {
      label: 'Проведено занятий',
      value: d.completedLessons,
      note: `В ${d.groupCount} учебных группах`,
      icon: CalendarDays,
      color: 'blue',
    },
    ...(user.role !== 'TEACHER'
      ? [
          {
            label: 'Поступления',
            value: money(d.receipts),
            note: 'Зарегистрированные оплаты',
            icon: Wallet,
            color: 'green',
          },
        ]
      : []),
    {
      label: 'Посещаемость',
      value: d.attendancePercent + '%',
      note: 'Присутствовали или опоздали',
      icon: Activity,
      color: 'orange',
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ВАШ ЦЕНТР В ЦИФРАХ</span>
          <h1>{analytics ? 'Аналитика' : 'Обзор центра'}</h1>
          <p>
            {analytics ? 'Показатели на основе записей центра' : 'Всё важное для продуктивного дня'}
          </p>
        </div>
        <select
          aria-label="Период аналитики"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={30}>Последние 30 дней</option>
          <option value={7}>Последние 7 дней</option>
          <option value={90}>Последние 90 дней</option>
          <option value={365}>Последний год</option>
        </select>
      </div>
      {analytics && (
        <div className="toolbar panel">
          <label>
            С даты
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            По дату
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            Группа
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Все группы</option>
              {refs.data?.groups.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {text(g, 'name')}
                </option>
              ))}
            </select>
          </label>
          {user.role !== 'TEACHER' && (
            <label>
              Направление
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">Все направления</option>
                {refs.data?.courses.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {text(c, 'name')}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="stats-grid">
        {cards.map((c) => (
          <article className="stat-card" key={c.label}>
            <div>
              <span>{c.label}</span>
              <div className={'stat-icon ' + c.color}>
                <c.icon size={20} />
              </div>
            </div>
            <strong>{c.value}</strong>
            <small>{c.note}</small>
          </article>
        ))}
      </div>
      <div className="toolbar panel" style={{ marginBottom: 22 }}>
        <span>
          Сегодня занятий: <b>{d.todayLessons}</b>
        </span>
        <span>
          Групп: <b>{d.groupCount}</b>
        </span>
        {user.role !== 'TEACHER' && (
          <>
            <span>
              Активных абонементов: <b>{d.activeSubscriptions}</b>
            </span>
            <span>
              Истекает за 7 дней: <b>{d.expiringSubscriptions}</b>
            </span>
            <span>
              Истекло: <b>{d.expiredSubscriptions}</b>
            </span>
          </>
        )}
      </div>
      <div className="dashboard-grid">
        {analytics && (
          <>
            <section className="panel">
              <div className="panel-heading">
                <h2>Ученики по направлениям</h2>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={d.courseDistribution}
                      nameKey="name"
                      dataKey="count"
                      fill="#a68adf"
                      innerRadius={55}
                      outerRadius={90}
                      label
                    />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Новые ученики по дням</h2>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.studentTrend}>
                    <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Новые ученики" fill="#8b68d3" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="panel wide padded">
              <h2>Заполненность групп</h2>
              {d.groups.map((g) => (
                <div key={g.name} className="list-row">
                  <b>{g.name}</b>
                  <span>
                    {g.students} / {g.capacity} · {Math.round((g.students / g.capacity) * 100)}%
                  </span>
                </div>
              ))}
            </section>
          </>
        )}
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>{user.role === 'TEACHER' ? 'Динамика посещений' : 'Поступления платежей'}</h2>
              <p>
                {user.role === 'TEACHER'
                  ? 'Отметки ваших занятий'
                  : 'Фактически зарегистрированные средства · KZT'}
              </p>
            </div>
            <span className="badge purple">{days} дней</span>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={
                  user.role === 'TEACHER'
                    ? d.attendanceChart.map((p) => ({ ...p, amount: 0 }))
                    : d.paymentChart?.map((p) => ({
                        ...p,
                        amount: Number(p.amount),
                        present: 0,
                        total: 0,
                      }))
                }
              >
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8056e8" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#8056e8" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#edf0f4" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => String(v).slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey={user.role === 'TEACHER' ? 'present' : 'amount'}
                  name={user.role === 'TEACHER' ? 'Присутствовали' : 'Поступления'}
                  stroke="#8056e8"
                  strokeWidth={3}
                  fill="url(#area)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Ближайшие занятия</h2>
              <p>Расписание центра</p>
            </div>
            <Link to="/schedule" aria-label="Открыть расписание">
              <ArrowUpRight size={20} />
            </Link>
          </div>
          {d.upcoming.length ? (
            d.upcoming.map((l) => (
              <div className="lesson-preview" key={l.id}>
                <div className="lesson-time">
                  {new Intl.DateTimeFormat('ru', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Almaty',
                  }).format(new Date(String(l.startsAt)))}
                  <small>{date(l.startsAt)}</small>
                </div>
                <div>
                  <b>{text(l, 'group.name')}</b>
                  <small>
                    {text(l, 'teacher.name')} · {text(l, 'room.name')}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <Empty />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Посещаемость</h2>
              <p>Количество присутствующих по дням</p>
            </div>
            <Activity size={19} />
          </div>
          <div className="chart small">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.attendanceChart}>
                <CartesianGrid strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => String(v).slice(5)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="present" name="Присутствовали" fill="#a98bf0" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{user.role === 'TEACHER' ? 'Заполненность групп' : 'Требуют внимания'}</h2>
              <p>
                {user.role === 'TEACHER'
                  ? 'Ученики и свободные места'
                  : 'Абонементы и задолженности'}
              </p>
            </div>
            <Clock3 size={19} />
          </div>
          {user.role !== 'TEACHER' && (
            <div className="debt-callout">
              <span>Общая задолженность</span>
              <strong>{money(d.debt)}</strong>
              <small>Начислено за период: {money(d.charges)}</small>
            </div>
          )}
          {user.role === 'TEACHER'
            ? d.groups.map((g) => (
                <div className="list-row" key={g.name}>
                  <span>{g.name}</span>
                  <b>
                    {g.students} / {g.capacity}
                  </b>
                </div>
              ))
            : d.attention?.slice(0, 4).map((s) => (
                <div className="list-row" key={s.id}>
                  <div>
                    <b>{text(s, 'student.name')}</b>
                    <small>{text(s, 'tariff.name')}</small>
                  </div>
                  <span className="badge orange">до {date(s.endsAt)}</span>
                </div>
              ))}
        </section>
        {user.role !== 'TEACHER' && (
          <section className="panel wide">
            <div className="panel-heading">
              <div>
                <h2>Последние платежи</h2>
                <p>Ручная регистрация сотрудником</p>
              </div>
              <Link to="/payments">Все платежи →</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ученик</th>
                    <th>Дата</th>
                    <th>Способ оплаты</th>
                    <th>Сумма</th>
                    <th>Источник</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentPayments?.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{text(p, 'student.name')}</b>
                      </td>
                      <td>{date(p.createdAt)}</td>
                      <td>
                        {
                          { CASH: 'Наличные', CARD: 'Карта', TRANSFER: 'Перевод', OTHER: 'Другое' }[
                            String(p.method)
                          ]
                        }
                      </td>
                      <td>
                        <b>{money(p.amount)}</b>
                      </td>
                      <td>
                        <span className="badge green">Сотрудник центра</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
