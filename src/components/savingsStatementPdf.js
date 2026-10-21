import jsPDF from 'jspdf';

// Render data directly: large DOM canvases can be blank or exceed browser limits.
export function createSavingsStatementPdf({ member = {}, header = {}, transactions, totalSavings }) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new Error('No savings transactions to export.');
  }
  const pdf = new jsPDF('p', 'mm', 'a4');
  const margin = 12;
  const bottom = 280;
  const widths = [27, 61, 30, 34, 34];
  const money = value => Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  let y;
  const text = (value, size = 9, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(String(value ?? ''), 186);
    for (const line of lines) {
      if (y + 5 > bottom) newPage();
      pdf.text(line, margin, y);
      y += 5;
    }
  };
  const tableHeader = () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    let x = margin;
    ['Input Date', 'Narration', 'Ref', 'Savings (KES)', 'Running Amt (KES)'].forEach((label, i) => {
      pdf.setFillColor(235, 245, 246);
      pdf.rect(x, y, widths[i], 8, 'FD');
      pdf.text(label, x + 2, y + 5);
      x += widths[i];
    });
    y += 8;
  };
  const newPage = () => {
    pdf.addPage();
    y = 15;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(`Deposits/Savings Statement - ${member.accNo || member.memberNo || 'N/A'}`, margin, y);
    y += 7;
    tableHeader();
  };
  y = 16;
  text(header.organisationName || 'METROPOLITAN HOSPITAL SACCO LTD', 13, true);
  text('Deposits/Savings Statement', 11, true);
  const contact = [header.boxNo, header.postalCode, header.mainTelNo, header.email].filter(Boolean).join(' | ');
  if (contact) text(contact, 8);
  text(`Name: ${member.holdersName || member.name || 'N/A'}`, 9, true);
  text(`Member No: ${member.accNo || member.memberNo || 'N/A'}`);
  text(`Tel: ${member.tel1 || member.phone || 'N/A'} | ID No: ${member.idNo || member.idNumber || 'N/A'}`);
  text(`Email: ${member.emailAdd || member.email || 'N/A'}`);
  text(`Generated: ${new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })}`, 8);
  y += 3;
  tableHeader();
  transactions.forEach(transaction => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const cells = [transaction.inputDate || 'N/A', transaction.narration || 'N/A', transaction.ref || 'N/A', money(transaction.savings), money(transaction.runningAmt)]
      .map((value, i) => pdf.splitTextToSize(String(value), widths[i] - 4));
    const lineCount = Math.max(...cells.map(cell => cell.length));
    let offset = 0;
    // Split exceptionally long narrations across pages without dropping text.
    while (offset < lineCount) {
      if (bottom - y < 8) newPage();
      const count = Math.min(lineCount - offset, Math.floor((bottom - y - 4) / 4));
      const height = count * 4 + 4;
      let x = margin;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      cells.forEach((lines, i) => {
        pdf.rect(x, y, widths[i], height);
        lines.slice(offset, offset + count).forEach((line, index) => {
          pdf.text(line, i >= 3 ? x + widths[i] - 2 : x + 2, y + 5 + index * 4, { align: i >= 3 ? 'right' : 'left' });
        });
        x += widths[i];
      });
      y += height;
      offset += count;
    }
  });
  if (y + 25 > bottom) newPage();
  y += 6;
  text(`TOTAL SAVINGS: KES ${money(totalSavings)}`, 10, true);
  text('This statement shows your savings/deposit transactions.', 8);
  text('For any queries, please contact the Sacco office.', 8);
  const pages = pdf.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(`Page ${page} of ${pages}`, 198, 290, { align: 'right' });
  }
  return pdf;
}
