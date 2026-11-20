import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Orbit, ArrowRight, ShieldCheck } from 'lucide-react';
import { send } from '../api/client';
import { Button } from '../components/ui/button';
const schema = z.object({
  email: z.email('Введите корректный email'),
  password: z.string().min(1, 'Введите пароль'),
});
export function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });
  return (
    <div className="login">
      <section className="login-story">
        <div className="brand">
          <Orbit /> Oi-Qaragai<span>CRM</span>
        </div>
        <div>
          <span className="eyebrow">БОЛЬШЕ ВРЕМЕНИ ДЛЯ ГЛАВНОГО</span>
          <h1>
            Всё, что нужно
            <br />
            вашему центру.
            <br />
            <em>В одном центре.</em>
          </h1>
          <p>Ученики, занятия, активности и финансы — в понятной системе для команды Oi-Qaragai.</p>
        </div>
        <span className="secure">
          <ShieldCheck size={18} /> Доступ к данным зависит от вашей роли
        </span>
      </section>
      <section className="login-form">
        <form
          onSubmit={handleSubmit(async (data) => {
            try {
              setError('');
              await send('/auth/login', data);
              onLogin();
            } catch (e) {
              setError((e as Error).message);
            }
          })}
        >
          <span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <h2>Рады видеть вас</h2>
          <p>Войдите в аккаунт детского центра</p>
          <label>
            Email
            <input
              {...register('email')}
              autoComplete="username"
              type="email"
              placeholder="name@center.kz"
            />
            {errors.email && <small>{errors.email.message}</small>}
          </label>
          <label>
            Пароль
            <input
              {...register('password')}
              autoComplete="current-password"
              type="password"
              placeholder="Введите пароль"
            />
            {errors.password && <small>{errors.password.message}</small>}
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Входим…' : 'Войти в систему'}
            <ArrowRight size={17} />
          </Button>
          <p className="login-note">Для получения доступа обратитесь к администратору центра.</p>
        </form>
      </section>
    </div>
  );
}
