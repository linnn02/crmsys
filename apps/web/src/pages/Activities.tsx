import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Loading, Empty, ErrorState } from '../components/States';

type Activity = { id:string; name:string; description:string; minAge:number; maxAge:number; capacity:number; season:string; status:string; requiresConsent:boolean };
type Booking = { id:string; startsAt:string; endsAt:string; status:string; price:string; student:{name:string}; activity:{name:string}; venue:{name:string} };
export function Activities() {
  const activities = useQuery({ queryKey:['activities'], queryFn:()=>api<{items:Activity[]}>('/activities') });
  const bookings = useQuery({ queryKey:['activity-bookings'], queryFn:()=>api<{items:Booking[]}>('/activity-bookings') });
  const venues = useQuery({ queryKey:['venues'], queryFn:()=>api<{items:{id:string;name:string;zone:string;active:boolean}[]}>('/venues') });
  if (activities.isPending || bookings.isPending || venues.isPending) return <Loading/>;
  if (activities.error || bookings.error || venues.error) return <ErrorState error={(activities.error ?? bookings.error ?? venues.error) as Error} retry={()=>{void activities.refetch();void bookings.refetch();}}/>;
  return <div className="page-stack">
    <div className="page-heading"><div><h1>Активности курорта</h1><p className="muted">Oi-Qaragai · безопасное бронирование программ для детей</p></div></div>
    <div className="stats-grid">
      <div className="stat-card"><b>{activities.data.items.filter(a=>a.status==='ACTIVE').length}</b><span>Активных программ</span></div>
      <div className="stat-card"><b>{venues.data.items.filter(v=>v.active).length}</b><span>Рабочих площадок</span></div>
      <div className="stat-card"><b>{bookings.data.items.filter(b=>b.status!=='CANCELLED').length}</b><span>Ближайших бронирований</span></div>
    </div>
    <div className="content-grid">
      <div className="panel"><h2>Программы</h2><div className="table-wrap"><table><thead><tr><th>Название</th><th>Возраст</th><th>Вместимость</th><th>Согласие</th><th>Статус</th></tr></thead><tbody>{activities.data.items.map(a=><tr key={a.id}><td><b>{a.name}</b><small>{a.description}</small></td><td>{a.minAge}–{a.maxAge} лет</td><td>{a.capacity}</td><td>{a.requiresConsent?'Обязательно':'Не требуется'}</td><td>{a.status==='ACTIVE'?'Доступна':'Пауза'}</td></tr>)}</tbody></table></div>{!activities.data.items.length&&<Empty/>}</div>
      <div className="panel"><h2>Площадки</h2><ul className="simple-list">{venues.data.items.map(v=><li key={v.id}><b>{v.name}</b><span>{v.zone} · {v.active?'Открыта':'Закрыта'}</span></li>)}</ul></div>
    </div>
    <div className="panel"><h2>Ближайшие бронирования</h2><div className="table-wrap"><table><thead><tr><th>Время</th><th>Ребёнок</th><th>Программа</th><th>Площадка</th><th>Статус</th></tr></thead><tbody>{bookings.data.items.slice(0,20).map(b=><tr key={b.id}><td>{new Intl.DateTimeFormat('ru',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Almaty'}).format(new Date(b.startsAt))}</td><td>{b.student.name}</td><td>{b.activity.name}</td><td>{b.venue.name}</td><td>{b.status}</td></tr>)}</tbody></table></div>{!bookings.data.items.length&&<Empty/>}</div>
  </div>;
}
