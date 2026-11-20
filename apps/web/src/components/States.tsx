import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
export function Loading() {
  return (
    <div className="state" role="status">
      <LoaderCircle className="animate-spin" /> Загружаем данные…
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <AlertCircle />
      <p>{error.message}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
export function Empty() {
  return (
    <div className="state">
      <Inbox size={32} />
      <b>Пока ничего нет</b>
      <p>Добавьте первую запись или измените условия поиска.</p>
    </div>
  );
}
