import { describe, it, expect } from 'vitest';
import { parseOfx } from '@main/import/ofx';

const HEADER = 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n';

const BANK = `${HEADER}<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS><DTSERVER>20250131<LANGUAGE>ENG</SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS><CURDEF>USD
<BANKACCTFROM><BANKID>123<ACCTID>000012345678<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20250101<DTEND>20250131
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250114120000[-5:EST]<TRNAMT>-45.67<FITID>A1<CHECKNUM>1001<NAME>TRADER JOES<MEMO>Groceries</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250115<TRNAMT>1234.56<FITID>A2<NAME>PAYROLL</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const CARD = `${HEADER}<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><CCSTMTRS><CURDEF>USD
<CCACCTFROM><ACCTID>4111111111119876</CCACCTFROM>
<BANKTRANLIST><DTSTART>20250101<DTEND>20250131
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250120<TRNAMT>-9.99<FITID>C1<MEMO>STREAMING</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

describe('parseOfx', () => {
  it('reads a bank statement with several transactions', async () => {
    const r = await parseOfx(BANK);
    expect(r.format).toBe('ofx');
    expect(r.transactions).toEqual([
      {
        accountLabel: 'CHECKING ••5678',
        date: '2025-01-14',
        amountMinor: -4567,
        payee: 'TRADER JOES',
        memo: 'Groceries',
        category: null,
        checkNumber: '1001',
        fitId: 'A1',
      },
      expect.objectContaining({ date: '2025-01-15', amountMinor: 123456, payee: 'PAYROLL', memo: null, fitId: 'A2' }),
    ]);
  });

  it('reads a credit card statement with one transaction', async () => {
    const r = await parseOfx(CARD);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]).toMatchObject({
      accountLabel: 'Credit card ••9876',
      amountMinor: -999,
      payee: 'STREAMING',
      fitId: 'C1',
    });
  });
});
