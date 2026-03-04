import { LOANS } from '../../../shared/constants/loans.js';
import { uid } from '../../../shared/helpers/random.js';

export function handleBank(action, params, g, ctx) {
  switch (action) {
    case 'takeLoan': {
      const { index } = params;
      const loan = LOANS[index];
      if (!loan) return ctx.fail('Invalid loan');
      if ((g.loans || []).length >= 3) return ctx.fail('Max 3 active loans');
      if (loan.rr && g.reputation < loan.rr) return ctx.fail('Not enough reputation');
      const effectiveRate = +(loan.r * (g.loanRateMult || 1)).toFixed(4);
      g.cash += loan.amt;
      g.loans.push({
        id: uid(),
        name: loan.n,
        amt: loan.amt,
        r: effectiveRate,
        remaining: loan.amt * (1 + effectiveRate),
        weeklyPayment: (loan.amt * (1 + effectiveRate)) / (loan.t * 4),
      });
      break;
    }

    case 'repayLoan': {
      const { loanIndex, amount } = params;
      const loan = (g.loans || [])[loanIndex];
      if (!loan) return ctx.fail('Invalid loan');
      const repayAmt = Math.min(Math.floor(Number(amount) || 0), loan.remaining, g.cash);
      if (repayAmt <= 0) return ctx.fail('Invalid amount');
      g.cash -= repayAmt;
      loan.remaining -= repayAmt;
      if (loan.remaining <= 0) {
        g.reputation = Math.min(100, (g.reputation || 0) + 0.5);
        g.log.push(`Loan "${loan.name}" paid off early! +0.5 reputation`);
        g.loans = g.loans.filter((_, i) => i !== loanIndex);
      } else {
        g.log.push(`Paid $${repayAmt.toLocaleString()} extra on "${loan.name}" ($${Math.round(loan.remaining).toLocaleString()} remaining)`);
      }
      break;
    }

    case 'bankDeposit': {
      const depAmt = Math.floor(Number(params.amount));
      if (!depAmt || depAmt <= 0) return ctx.fail('Invalid amount');
      if (g.cash < depAmt) return ctx.fail('Not enough cash');
      g.cash -= depAmt;
      g.bankBalance = (g.bankBalance || 0) + depAmt;
      g.log.push(`Deposited $${depAmt.toLocaleString()} to savings`);
      break;
    }

    case 'bankWithdraw': {
      const wdAmt = Math.floor(Number(params.amount));
      if (!wdAmt || wdAmt <= 0) return ctx.fail('Invalid amount');
      if ((g.bankBalance || 0) < wdAmt) return ctx.fail('Insufficient balance');
      g.bankBalance -= wdAmt;
      g.cash += wdAmt;
      g.log.push(`Withdrew $${wdAmt.toLocaleString()} from savings`);
      break;
    }

    default: return null;
  }
  return g;
}
