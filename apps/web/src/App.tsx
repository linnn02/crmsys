import { useState, lazy, Suspense } from 'react';
import { NavLink, Routes, Route, Navigate, useParams, useLocation, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Orbit,
  LayoutDashboard,
  Users,
  ContactRound,
  GraduationCap,
  Layers,
  CalendarDays,
  ClipboardCheck,
  Tickets,
  Wallet,
  ChartNoAxesCombined,
  Bell,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  ChevronRight,
} from 'lucide-react';
import { api, send, ApiRequestError } from './api/client';
import { AuthContext, type User } from './hooks/auth';
import { Loading, ErrorState } from './components/States';
import { Button } from './components/ui/button';
import { Login } from './pages/Login';
import { Activities } from './pages/Activities';
import { PublicBooking } from './pages/PublicBooking';
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
import { Directory, StudentCard } from './pages/Directory';
const Schedule = lazy(() => import('./pages/Schedule').then((m) => ({ default: m.Schedule })));
const Attendance = lazy(() => import('./pages/Schedule').then((m) => ({ default: m.Attendance })));
const Finance = lazy(() => import('./pages/Finance').then((m) => ({ default: m.Finance })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Notifications = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Notifications })),
);
const nav = [
  ['/', 'Главная', LayoutDashboard],
  ['/students', 'Ученики', Users],
  ['/parents', 'Родители', ContactRound],
  ['/teachers', 'Преподаватели', GraduationCap],
  ['/groups', 'Группы', Layers],
  ['/schedule', 'Расписание', CalendarDays],
  ['/activities', 'Активности курорта', Orbit],
  ['/attendance', 'Посещаемость', ClipboardCheck],
  ['/subscriptions', 'Абонементы', Tickets],
  ['/payments', 'Платежи', Wallet],
  ['/analytics', 'Аналитика', ChartNoAxesCombined],
  ['/notifications', 'Уведомления', Bell],
  ['/settings', 'Настройки', SettingsIcon],
] as const;
function StudentRoute() {
  const { id } = useParams();
  return <StudentCard id={id!} />;
}
export function App() {
  const qc = useQueryClient();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/auth/me'),
    retry: (count, error) =>
      !(error instanceof ApiRequestError && error.status === 401) && count < 2,
    staleTime: 60000,
  });
  if (location.pathname === '/online-booking') return <PublicBooking />;
  if (q.isPending) return <Loading />;
  if (q.error && !(q.error instanceof ApiRequestError && q.error.status === 401))
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (q.error || !q.data)
    return <Login onLogin={() => void qc.invalidateQueries({ queryKey: ['me'] })} />;
  const user = q.data;
  const restrictedPaths = user.role === 'INSTRUCTOR'
    ? ['/', '/students', '/schedule', '/activities', '/attendance', '/analytics', '/notifications']
    : user.role === 'CLUB_OPERATOR'
      ? ['/', '/students', '/activities', '/schedule', '/notifications']
      : user.role === 'ACCOUNTANT'
        ? ['/', '/students', '/subscriptions', '/payments', '/analytics', '/notifications']
        : ['/', '/students', '/schedule', '/attendance', '/analytics', '/notifications'];
  const allowed = nav.filter(
    ([path]) =>
      user.role === 'ADMIN' ||
      (user.role === 'MANAGER'
        ? path !== '/settings'
        : restrictedPaths.includes(path)),
  );
  const title = allowed.find(([p]) => p === location.pathname)?.[1] ?? 'Карточка ученика';
  return (
    <AuthContext.Provider value={user}>
      <div className="app-shell">
        <aside className={open ? 'sidebar open' : 'sidebar'}>
          <Link to="/" className="brand">
            <Orbit size={31} />
            Oi-Qaragai<span>CRM</span>
          </Link>
          <div className="workspace">
            <span className="workspace-icon">О</span>
            <div>
              <b>Oi-Qaragai · Угуша</b>
              <small>Рабочее пространство</small>
            </div>
            <ChevronRight size={15} />
          </div>
          <div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
          <nav>
            {allowed.map(([path, label, Icon]) => (
              <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)}>
                <Icon size={19} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span className="avatar purple">{user.name.slice(0, 1)}</span>
            <div>
              <b>{user.name}</b>
              <small>
                {
                  { ADMIN: 'Администратор', MANAGER: 'Менеджер', TEACHER: 'Преподаватель', INSTRUCTOR: 'Инструктор', CLUB_OPERATOR: 'Оператор клуба', ACCOUNTANT: 'Бухгалтер' }[
                    user.role
                  ]
                }
              </small>
            </div>
            <Button
              variant="ghost"
              aria-label="Выйти"
              onClick={() =>
                void send('/auth/logout', {}).then(() => {
                  qc.clear();
                  window.location.assign('/');
                })
              }
            >
              <LogOut size={17} />
            </Button>
          </div>
        </aside>
        {open && (
          <button
            className="sidebar-overlay"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          />
        )}
        <div className="main-shell">
          <header className="topbar">
            <div className="actions">
              <Button
                className="mobile-menu"
                variant="ghost"
                aria-label="Меню"
                onClick={() => setOpen(!open)}
              >
                <Menu />
              </Button>
              <span className="muted">Рабочее пространство</span>
              <ChevronRight size={14} />
              <b>{title}</b>
            </div>
            <div className="actions">
              <span className="today">
                {new Intl.DateTimeFormat('ru', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'Asia/Almaty',
                }).format(new Date())}
              </span>
              <Link to="/notifications" className="bell" aria-label="Уведомления">
                <Bell size={20} />
              </Link>
              <span className="avatar purple">{user.name.slice(0, 1)}</span>
            </div>
          </header>
          <main>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/students" element={<Directory resource="students" />} />
                <Route path="/students/:id" element={<StudentRoute />} />
                {['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user.role) && (
                  <>
                    {['parents', 'teachers', 'groups'].map((r) => (
                      <Route key={r} path={'/' + r} element={<Directory key={r} resource={r} />} />
                    ))}
                    <Route path="/subscriptions" element={<Finance subscriptions />} />
                    <Route path="/payments" element={<Finance />} />
                  </>
                )}
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/activities" element={<Activities />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/analytics" element={<Dashboard analytics />} />
                <Route path="/notifications" element={<Notifications />} />
                {user.role === 'ADMIN' && <Route path="/settings" element={<Settings />} />}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
          <footer className="app-footer">
            Oi-Qaragai · Угуша CRM <span>Часовой пояс: Asia/Almaty · Валюта: KZT</span>
          </footer>
        </div>
      </div>
    </AuthContext.Provider>
  );
}
