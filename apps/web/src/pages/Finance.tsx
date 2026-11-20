import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api, send, type List, type Row, text, money, date } from '../api/client';
import { Button } from '../components/ui/button';
import { RecordForm, type Field } from '../components/RecordForm';
import { Loading, ErrorState, Empty } from '../components/States';
export function Finance({ subscriptions = false }: { subscriptions?: boolean }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState('invoices');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('');
  const paymentFilters = new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(method ? { method } : {}),
  }).toString();
  const [key, setKey] = useState(crypto.randomUUID());
  const [refund, setRefund] = useState<Row | null>(null);
  const resource = subscriptions ? 'subscriptions' : tab;
  const q = useQuery({
    queryKey: [resource, page, paymentFilters],
    queryFn: () =>
      api<List>(
        '/' + resource + '?page=' + page + (resource === 'payments' ? '&' + paymentFilters : ''),
      ),
  });
  const refs = useQuery<Record<string, List>>({
    queryKey: ['financeRefs'],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          ['students', 'groups', 'tariffs', 'invoices'].map(async (n) => [
            n,
            await api<List>('/' + n + '?pageSize=100'),
          ]),
        ),
      ),
  });
  const options = (n: string) =>
    refs.data?.[n]?.items.map((r: Row) => ({
      value: r.id,
      label:
        n === 'invoices'
          ? text(r, 'student.name') + ' · ' + money(r.debt) + ' · ' + r.id.slice(0, 6)
          : text(r, 'name'),
    })) ?? [];
  const fields: Field[] = subscriptions
    ? [
        {
          key: 'studentId',
          label: 'Ученик',
          type: 'select',
          required: true,
          options: options('students'),
        },
        {
          key: 'groupId',
          label: 'Группа',
          type: 'select',
          required: true,
          options: options('groups'),
        },
        {
          key: 'tariffId',
          label: 'Тариф',
          type: 'select',
          required: true,
          options: options('tariffs'),
        },
        { key: 'startsAt', label: 'Дата начала', type: 'date', required: true },
      ]
    : [
        {
          key: 'invoiceId',
          label: 'Счёт и остаток задолженности',
          type: 'select',
          required: true,
          options: options('invoices'),
        },
        { key: 'amount', label: 'Сумма, KZT', required: true },
        {
          key: 'method',
          label: 'Способ оплаты',
          type: 'select',
          required: true,
          options: [
            { value: 'CASH', label: 'Наличные' },
            { value: 'CARD', label: 'Карта' },
            { value: 'TRANSFER', label: 'Банковский перевод' },
            { value: 'OTHER', label: 'Другое' },
          ],
        },
      ];
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      subscriptions
        ? send('/subscriptions', { ...data, startsAt: String(data.startsAt) + 'T00:00:00+05:00' })
        : send('/payments', {
            ...data,
            studentId: refs.data?.invoices?.items.find((i: Row) => i.id === data.invoiceId)
              ?.studentId,
            idempotencyKey: key,
          }),
    onSuccess: () => {
      setModal(false);
      void qc.invalidateQueries();
      toast.success(subscriptions ? 'Абонемент и счёт созданы' : 'Оплата зарегистрирована');
    },
  });
  const refunds = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      send('/payments/' + refund!.id + '/refunds', { ...data, idempotencyKey: key }),
    onSuccess: () => {
      setRefund(null);
      void qc.invalidateQueries();
      toast.success('Корректирующая операция сохранена');
    },
  });
  function action(s: Row, a: string) {
    if (
      !confirm(
        a === 'freeze'
          ? 'Заморозить абонемент?'
          : a === 'resume'
            ? 'Возобновить абонемент с продлением на время заморозки?'
            : 'Продлить срок на 7 дней без изменения количества занятий?',
      )
    )
      return;
    void send('/subscriptions/' + s.id + '/' + a, { days: 7 })
      .then(() => {
        void qc.invalidateQueries();
        toast.success('Абонемент обновлён');
      })
      .catch((e) => toast.error((e as Error).message));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ФИНАНСЫ ЦЕНТРА</span>
          <h1>{subscriptions ? 'Абонементы' : 'Платежи и счета'}</h1>
          <p>
            {subscriptions
              ? 'Занятия, сроки действия и история изменений'
              : 'Начисления и поступления учитываются отдельно · KZT'}
          </p>
        </div>
        <div className="actions">
          {!subscriptions && (
            <Button asChild variant="outline">
              <a href={'/api/reports/payments.csv?' + paymentFilters}>
                <Download size={16} />
                CSV
              </a>
            </Button>
          )}
          <Button
            onClick={() => {
              setKey(crypto.randomUUID());
              mutation.reset();
              setModal(true);
            }}
          >
            <Plus size={17} />
            {subscriptions ? 'Выдать абонемент' : 'Зарегистрировать оплату'}
          </Button>
        </div>
      </div>
      <section className="panel">
        {!subscriptions && tab === 'payments' && (
          <div className="toolbar">
            <label>
              С даты
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              По дату
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Способ
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все способы</option>
                <option value="CASH">Наличные</option>
                <option value="CARD">Карта</option>
                <option value="TRANSFER">Перевод</option>
                <option value="OTHER">Другое</option>
              </select>
            </label>
          </div>
        )}
        {!subscriptions && (
          <div className="toolbar">
            <Button
              variant={tab === 'invoices' ? 'default' : 'ghost'}
              onClick={() => {
                setTab('invoices');
                setPage(1);
              }}
            >
              Счета и задолженности
            </Button>
            <Button
              variant={tab === 'payments' ? 'default' : 'ghost'}
              onClick={() => {
                setTab('payments');
                setPage(1);
              }}
            >
              История оплат
            </Button>
          </div>
        )}
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} />
        ) : !q.data.items.length ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ученик</th>
                  <th>{subscriptions ? 'Тариф' : 'Дата'}</th>
                  <th>Сумма</th>
                  <th>
                    {subscriptions
                      ? 'Остаток занятий'
                      : tab === 'invoices'
                        ? 'Задолженность'
                        : 'Способ'}
                  </th>
                  <th>{subscriptions ? 'Действует до' : 'Статус / источник'}</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((r: Row) => (
                  <tr key={r.id}>
                    <td>
                      <b>{text(r, 'student.name')}</b>
                    </td>
                    <td>{subscriptions ? text(r, 'tariff.name') : date(r.createdAt)}</td>
                    <td>{money(subscriptions ? r.price : r.amount)}</td>
                    <td>
                      {subscriptions
                        ? r.remaining === null
                          ? 'Безлимит'
                          : text(r, 'remaining')
                        : tab === 'invoices'
                          ? money(r.debt)
                          : (
                              {
                                CASH: 'Наличные',
                                CARD: 'Карта',
                                TRANSFER: 'Перевод',
                                OTHER: 'Другое',
                              } as Record<string, string>
                            )[text(r, 'method')]}
                    </td>
                    <td>
                      {subscriptions ? (
                        <>
                          <span>{date(r.endsAt)}</span>
                          <small className="muted">
                            {
                              (
                                {
                                  ACTIVE: 'Активен',
                                  EXPIRED: 'Истёк',
                                  EXHAUSTED: 'Исчерпан',
                                  PAUSED: 'Заморожен',
                                } as Record<string, string>
                              )[text(r, 'status')]
                            }
                          </small>
                        </>
                      ) : tab === 'invoices' ? (
                        <span className={'badge ' + (Number(r.debt) > 0 ? 'orange' : 'green')}>
                          {Number(r.debt) > 0 ? 'Ожидает оплаты' : 'Оплачен'}
                        </span>
                      ) : (
                        <span className="badge gray">Внесён сотрудником</span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        {subscriptions ? (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() => action(r, r.status === 'PAUSED' ? 'resume' : 'freeze')}
                            >
                              {r.status === 'PAUSED' ? 'Возобновить' : 'Заморозить'}
                            </Button>
                            <Button variant="ghost" onClick={() => action(r, 'extend')}>
                              +7 дней
                            </Button>
                          </>
                        ) : tab === 'payments' ? (
                          <>
                            <Button asChild variant="ghost">
                              <a href={'/api/payments/' + r.id + '/receipt.pdf'}>PDF</a>
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setKey(crypto.randomUUID());
                                refunds.reset();
                                setRefund(r);
                              }}
                            >
                              Возврат
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            Страница {page} · {q.data?.total ?? 0} записей
          </span>
          <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Назад
          </Button>
          <Button
            variant="outline"
            disabled={page * 20 >= (q.data?.total ?? 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Далее
          </Button>
        </div>
      </section>
      {modal && (
        <RecordForm
          title={subscriptions ? 'Выдать абонемент' : 'Регистрация факта оплаты'}
          fields={fields}
          initial={{ method: 'CASH' }}
          onClose={() => setModal(false)}
          onSave={(d) => mutation.mutate(d)}
          pending={mutation.isPending}
          error={mutation.error}
        />
      )}
      {refund && (
        <RecordForm
          title="Возврат / исправление оплаты"
          fields={[
            { key: 'amount', label: 'Сумма возврата, KZT', required: true },
            { key: 'reason', label: 'Причина', required: true },
          ]}
          onClose={() => setRefund(null)}
          onSave={(d) => refunds.mutate(d)}
          pending={refunds.isPending}
          error={refunds.error}
        />
      )}
    </>
  );
}
