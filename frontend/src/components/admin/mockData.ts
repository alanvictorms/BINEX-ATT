// Dados mockados organizados — substituir por chamadas de API conforme cada módulo for construído

export type Period = 'today' | 'yesterday' | '7d' | '15d' | '30d'

export interface DashboardStats {
  totalDeposits:      number
  totalWithdrawals:   number
  avgTicket:          number
  netFlow:            number
  totalUserBalance:   number
  totalBonus:         number
  balanceAndBonus:    number
  totalUsers:         number
  newUsersToday:      number
  totalWagered:       number
  platformGains:      number  // perdas dos usuários = ganho da plataforma
  platformLosses:     number  // ganhos dos usuários = perda da plataforma
  platformResult:     number  // gains - losses
  totalOperations:    number
  winRate:            number  // % de operações que o usuário perdeu (ganho da plataforma)
}

const BASE: DashboardStats = {
  totalDeposits:    30842,
  totalWithdrawals: 0,
  avgTicket:        132.94,
  netFlow:          30842,
  totalUserBalance: 47964.51,
  totalBonus:       53165.44,
  balanceAndBonus:  101129.95,
  totalUsers:       4471,
  newUsersToday:    614,
  totalWagered:     85644.88,
  platformGains:    57978.28,
  platformLosses:   23798.10,
  platformResult:   34180.18,
  totalOperations:  2847,
  winRate:          67.6,
}

const MULTIPLIERS: Record<Period, number> = {
  today:     0.08,
  yesterday: 0.07,
  '7d':      0.35,
  '15d':     0.65,
  '30d':     1.0,
}

export function getStats(period: Period): DashboardStats {
  const m = MULTIPLIERS[period]
  return {
    totalDeposits:    +(BASE.totalDeposits    * m).toFixed(2),
    totalWithdrawals: +(BASE.totalWithdrawals * m).toFixed(2),
    avgTicket:        +(BASE.avgTicket).toFixed(2),
    netFlow:          +(BASE.netFlow          * m).toFixed(2),
    totalUserBalance: BASE.totalUserBalance,
    totalBonus:       BASE.totalBonus,
    balanceAndBonus:  BASE.balanceAndBonus,
    totalUsers:       BASE.totalUsers,
    newUsersToday:    period === 'today' ? BASE.newUsersToday : Math.floor(BASE.newUsersToday * m),
    totalWagered:     +(BASE.totalWagered     * m).toFixed(2),
    platformGains:    +(BASE.platformGains    * m).toFixed(2),
    platformLosses:   +(BASE.platformLosses   * m).toFixed(2),
    platformResult:   +((BASE.platformGains - BASE.platformLosses) * m).toFixed(2),
    totalOperations:  Math.floor(BASE.totalOperations * m),
    winRate:          BASE.winRate,
  }
}

// Série temporal para gráficos (últimos 7 dias)
export const PERF_SERIES = [
  { day: 'Seg', gains: 6200, losses: 2800, result: 3400, deposits: 4100, withdrawals: 0   },
  { day: 'Ter', gains: 7800, losses: 3100, result: 4700, deposits: 5200, withdrawals: 200 },
  { day: 'Qua', gains: 5400, losses: 3600, result: 1800, deposits: 3800, withdrawals: 0   },
  { day: 'Qui', gains: 8900, losses: 2400, result: 6500, deposits: 6100, withdrawals: 400 },
  { day: 'Sex', gains: 9200, losses: 4100, result: 5100, deposits: 5900, withdrawals: 0   },
  { day: 'Sáb', gains: 6700, losses: 3800, result: 2900, deposits: 3200, withdrawals: 0   },
  { day: 'Dom', gains: 5100, losses: 2900, result: 2200, deposits: 2600, withdrawals: 0   },
]

// Distribuição de resultados (donut)
export const RESULT_DIST = [
  { name: 'Plataforma ganhou', value: 67.6, color: '#22c55e' },
  { name: 'Usuário ganhou',    value: 27.9, color: '#ef4444' },
  { name: 'Empate',            value: 4.5,  color: '#6b7280' },
]

// Volume por ativo
export const VOLUME_BY_ASSET = [
  { asset: 'EUR/USD', volume: 18400 },
  { asset: 'BTC/USD', volume: 14200 },
  { asset: 'GBP/USD', volume: 11800 },
  { asset: 'AUD/USD', volume: 9600  },
  { asset: 'OTC-1',   volume: 7200  },
  { asset: 'ETH/USD', volume: 6100  },
  { asset: 'USD/JPY', volume: 5200  },
  { asset: 'Outros',  volume: 4300  },
]

// Usuários ativos por dia
export const ACTIVE_USERS = [
  { day: 'Seg', users: 312 },
  { day: 'Ter', users: 398 },
  { day: 'Qua', users: 287 },
  { day: 'Qui', users: 445 },
  { day: 'Sex', users: 521 },
  { day: 'Sáb', users: 376 },
  { day: 'Dom', users: 263 },
]
