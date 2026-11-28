import PDFDocument from 'pdfkit';
import path from 'path';

export async function renderReceiptPdf(rows: string[][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Recibo de pago - ArtoCamello', Author: 'ArtoCamello' } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.roundedRect(48, 42, 180, 72, 8).fill('#101828');
      doc.image(path.join(__dirname, '..', 'assets', 'logoartocamello-white.png'), 60, 47, { fit: [155, 62] });
      doc.moveDown(5).fontSize(20).fillColor('#101828').text('Recibo de pago');
      doc.moveDown(0.6).fontSize(10).fillColor('#596579').text('Confirmación de pago por acceso a un contacto. No es una factura tributaria ni un comprobante electrónico del SRI.');
      doc.moveDown(1.5);
      for (const [label, value] of rows) {
        doc.fontSize(10).fillColor('#596579').text(label, { continued: true });
        doc.fillColor('#101828').text(`: ${value}`, { continued: false });
        doc.moveDown(0.65);
      }
      doc.end();
    } catch (error) { reject(error); }
  });
}
