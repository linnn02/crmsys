import { test, expect } from '@playwright/test';
test('Вход, dashboard, поиск, календарь и мобильное меню', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Войти в систему' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор центра' })).toBeVisible();
  await expect(page.getByText('Активные ученики', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
  await page.getByRole('link', { name: 'Ученики', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск' }).fill('Ученик Демо 01');
  await expect(page.getByRole('link', { name: 'Ученик Демо 01', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ученик Демо 01', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Представители', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Расписание', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Неделя', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/schedule.png', fullPage: true });
  await page.getByRole('button', { name: 'Создать занятие' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Меню', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Платежи', exact: true })).toBeVisible();
});
test('Форма создаёт представителя через API', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Войти в систему' }).click();
  await page.getByRole('link', { name: 'Родители', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const tag = Date.now().toString();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('ФИО').fill('E2E представитель ' + tag);
  await dialog.getByRole('textbox', { name: 'Телефон *', exact: true }).fill('+7' + tag.slice(-10));
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Поиск' }).fill(tag);
  await expect(page.getByText('E2E представитель ' + tag, { exact: true })).toBeVisible();
});
test('Все основные разделы открываются, мобильная главная без переполнения', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Войти в систему' }).click();
  await expect(page.getByRole('heading', {name:'Обзор центра'})).toBeVisible();
  for (const [path, title] of [
    ['/teachers', 'Преподаватели'],
    ['/groups', 'Группы'],
    ['/attendance', 'Посещаемость'],
    ['/subscriptions', 'Абонементы'],
    ['/payments', 'Платежи и счета'],
    ['/analytics', 'Аналитика'],
    ['/notifications', 'Уведомления'],
    ['/settings', 'Настройки'],
  ]) {
    await page.goto(path!);
    await expect(page.getByRole('heading', { name: title!, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Обзор центра' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test('Преподавателю недоступны финансы и системные настройки', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('teacher1@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill(process.env.SEED_PASSWORD!);
  await page.getByRole('button', { name: 'Войти в систему' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор центра' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Платежи', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Настройки', exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/payments')).status()).toBe(403);
  await page.goto('/attendance');
  await expect(page.getByRole('heading', { name: 'Посещаемость', exact: true })).toBeVisible();
});
