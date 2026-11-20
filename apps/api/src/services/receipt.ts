import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { D } from './finance.js';
import { db } from '../repositories/db.js';
export async function receipt(id: string): Promise<Buffer> {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id },
    include: { student: true, refunds: true },
  });
  const doc = new PDFDocument({ size: 'A4', margin: 55, info: { Title: 'Квитанция об оплате' } });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font(fileURLToPath(new URL('../../assets/NotoSans-Regular.ttf', import.meta.url)));
  doc.fillColor('#7951d6').fontSize(26).text('Орбита CRM');
  doc.moveDown(0.5).fillColor('#293044').fontSize(19).text('Квитанция об оплате');
  doc
    .moveDown()
    .fontSize(10)
    .fillColor('#7b8194')
    .text('Номер операции: ' + payment.id);
  doc.moveDown(2).fillColor('#293044').fontSize(12);
  const rows = [
    ['Ученик', payment.student.name],
    ['Дата регистрации', payment.createdAt.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })],
    ['Сумма', payment.amount.toFixed(2) + ' KZT'],
    [
      'Способ',
      {
        CASH: 'Наличные',
        CARD: 'Банковская карта',
        TRANSFER: 'Банковский перевод',
        OTHER: 'Другое',
      }[payment.method],
    ],
    ['Возвраты', payment.refunds.reduce((s, r) => s.plus(r.amount), D(0)).toFixed(2) + ' KZT'],
  ];
  for (const [label, val] of rows) {
    doc.text(label + ': ' + val);
    doc.moveDown(0.8);
  }
  doc
    .moveDown(2)
    .fontSize(10)
    .fillColor('#7b8194')
    .text(
      'Оплата зарегистрирована сотрудником центра вручную. Эта квитанция не является фискальным чеком или автоматическим подтверждением банка.',
    );
  doc.end();
  return result;
}
