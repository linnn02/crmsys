import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, send } from '../api/client';
import { Loading, ErrorState } from '../components/States';
import { Button } from '../components/ui/button';
type Slot = { id:string; activityId:string; activityName:string; venueId:string; venueName:string; instructorId:string|null; startsAt:string; endsAt:string; price:string; capacity:number; booked:number; free:number };
export function PublicBooking() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [age, setAge] = useState('');
  const [selected, setSelected] = useState<Slot | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const slots = useQuery({ queryKey: ['public-slots', date, age], queryFn: () => api<{ items: Slot[] }>(`/public/activity-slots?date=${date}${age ? `&age=${age}` : ''}`) });
  const activities = useMemo(() => [...new Map((slots.data?.items ?? []).map((s) => [s.activityId, s])).values()], [slots.data]);
  if (slots.isPending) return <Loading />;
  if (slots.error) return <ErrorState error={slots.error as Error} retry={() => void slots.refetch()} />;
  if (done) return <div className="state"><b>Заявка принята</b><p>Бронь сохранена в локальной CRM. Менеджер подтвердит запись.</p><Button onClick={() => setDone(false)}>Создать ещё одну запись</Button></div>;
  return <div className="page-stack public-booking"><div className="page-heading"><div><span className="eyebrow">ЛОКАЛЬНАЯ ОНЛАЙН-ЗАПИСЬ</span><h1>Записать ребёнка на активность</h1><p>Тестовая форма Ugusha без внешнего сайта и платёжной интеграции.</p></div></div>
    <form className="panel padded form-grid" onSubmit={async (e) => { e.preventDefault(); setError(''); const form = new FormData(e.currentTarget); if (!selected) return setError('Выберите свободный слот'); try { await send('/public/activity-bookings', { childName: form.get('childName'), birthDate: form.get('birthDate'), heightCm: form.get('heightCm') ? Number(form.get('heightCm')) : null, footSize: form.get('footSize') ? Number(form.get('footSize')) : null, skiLevel: form.get('skiLevel') || null, parentName: form.get('parentName'), parentPhone: form.get('parentPhone'), parentEmail: form.get('parentEmail') || '', consentAccepted: form.get('consentAccepted') === 'on', activityId: selected.activityId, venueId: selected.venueId, instructorId: selected.instructorId, startsAt: selected.startsAt, endsAt: selected.endsAt, price: selected.price, ownEquipment: form.get('ownEquipment') === 'on', skisRequired: form.get('skisRequired') === 'on', bootsRequired: form.get('bootsRequired') === 'on', helmetRequired: form.get('helmetRequired') === 'on', polesRequired: form.get('polesRequired') === 'on', source: 'ONLINE', status: 'RESERVED', notes: '' }); setDone(true); } catch (e) { setError((e as Error).message); } }}>
      <label>ФИО родителя<input name="parentName" required placeholder="Иванова Анна" /></label><label>Телефон<input name="parentPhone" required placeholder="+77001234567" /></label><label>Email<input name="parentEmail" type="email" placeholder="parent@example.kz" /></label>
      <label>ФИО ребёнка<input name="childName" required placeholder="Иванов Артём" /></label><label>Дата рождения<input name="birthDate" type="date" required /></label><label>Возраст для фильтра слотов<input value={age} onChange={(e) => setAge(e.target.value)} type="number" min="0" max="18" placeholder="8" /></label>
      <label>Рост, см<input name="heightCm" type="number" min="50" max="220" /></label><label>Размер ноги<input name="footSize" type="number" min="15" max="50" step="0.5" /></label><label>Уровень катания<select name="skiLevel" defaultValue=""><option value="">Не указан</option><option value="BEGINNER">Начальный</option><option value="INTERMEDIATE">Продолжающий</option><option value="ADVANCED">Продвинутый</option></select></label>
      <label>Дата активности<input value={date} onChange={(e) => { setDate(e.target.value); setSelected(null); }} type="date" required /></label><label className="span-2">Программа<select value={selected?.activityId ?? ''} onChange={(e) => setSelected(slots.data.items.find((s) => s.activityId === e.target.value && s.free > 0) ?? null)} required><option value="">Выберите программу</option>{activities.map((s) => <option key={s.activityId} value={s.activityId}>{s.activityName}</option>)}</select></label>
      <div className="span-3"><b>Свободные слоты</b><div className="slot-list">{slots.data.items.filter((s) => !selected || s.activityId === selected.activityId).map((s) => <button type="button" className={selected?.id === s.id ? 'slot selected' : 'slot'} disabled={s.free === 0} onClick={() => setSelected(s)} key={s.id}>{new Intl.DateTimeFormat('ru-KZ',{timeStyle:'short',timeZone:'Asia/Almaty'}).format(new Date(s.startsAt))} · {s.venueName} · {s.free > 0 ? `свободно ${s.free}` : 'мест нет'} · {s.price} KZT</button>)}</div></div>
      <div className="span-3 equipment-checks"><b>Экипировка</b><label><input type="checkbox" name="ownEquipment" /> Своё снаряжение</label><label><input type="checkbox" name="skisRequired" /> Лыжи</label><label><input type="checkbox" name="bootsRequired" /> Ботинки</label><label><input type="checkbox" name="helmetRequired" /> Шлем</label><label><input type="checkbox" name="polesRequired" /> Палки</label></div>
      <label className="span-3 consent"><input type="checkbox" name="consentAccepted" required /> Я подтверждаю согласие родителя/законного представителя на участие ребёнка</label>
      {error && <p className="field-error span-3">{error}</p>}<div className="span-3"><Button type="submit">Отправить заявку</Button></div>
    </form>
  </div>;
}
