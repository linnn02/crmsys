export type Locale = 'ru' | 'kk';
export const messages = {
  ru: {
    appName: 'Орбита',
    description: 'CRM детского центра',
    save: 'Сохранить',
    cancel: 'Отмена',
  },
};
export const locale: Locale = 'ru';
export const t = (key: keyof typeof messages.ru) => messages.ru[key];
