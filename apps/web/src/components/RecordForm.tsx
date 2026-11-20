import { useEffect, useRef, type ReactNode } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { Button } from './ui/button';
export type Field = {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'email'
    | 'password'
    | 'date'
    | 'datetime-local'
    | 'number'
    | 'select'
    | 'multiselect'
    | 'checkbox';
  required?: boolean;
  options?: { value: string; label: string }[];
  nullable?: boolean;
  min?: number;
};
export function RecordForm({
  title,
  fields,
  initial = {},
  onSave,
  onClose,
  pending = false,
  error,
  children,
}: {
  title: string;
  fields: Field[];
  initial?: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  pending?: boolean;
  error?: Error | null;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const shape: Record<string, z.ZodType> = Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.type === 'checkbox'
        ? z.boolean()
        : f.type === 'multiselect'
          ? z.array(z.string()).min(f.required ? 1 : 0)
          : f.type === 'number'
            ? f.nullable
              ? z.preprocess(
                  (v) => (v === '' ? null : Number(v)),
                  z
                    .number()
                    .min(f.min ?? 0)
                    .nullable(),
                )
              : z.coerce.number().min(f.min ?? 0)
            : f.type === 'email'
              ? z.email()
              : z.string().min(f.required ? 1 : 0, f.label + ' — обязательное поле'),
    ]),
  );
  const defaults = Object.fromEntries(
    fields.map((f) => [
      f.key,
      initial[f.key] ?? (f.type === 'checkbox' ? false : f.type === 'multiselect' ? [] : ''),
    ]),
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    defaultValues: defaults,
    resolver: zodResolver(z.object(shape)) as Resolver<Record<string, unknown>>,
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} onCancel={onClose} className="modal">
      <form onSubmit={handleSubmit(onSave)}>
        <div className="modal-header">
          <h2>{title}</h2>
          <Button type="button" variant="ghost" aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        {children}
        <div className="form-grid">
          {fields.map((f) => (
            <label key={f.key} className={f.type === 'multiselect' ? 'wide' : ''}>
              <span>
                {f.label}
                {f.required ? ' *' : ''}
              </span>
              {f.type === 'select' || f.type === 'multiselect' ? (
                <select {...register(f.key)} multiple={f.type === 'multiselect'}>
                  {f.type === 'select' && <option value="">Выберите…</option>}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...register(f.key)}
                  type={f.type ?? 'text'}
                  step={f.type === 'number' ? '1' : undefined}
                />
              )}{' '}
              {errors[f.key] && (
                <small className="field-error">{String(errors[f.key]?.message)}</small>
              )}
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="field-error">
            {error.message}
          </p>
        )}
        <footer>
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={pending}>{pending ? 'Сохранение…' : 'Сохранить'}</Button>
        </footer>
      </form>
    </dialog>
  );
}
