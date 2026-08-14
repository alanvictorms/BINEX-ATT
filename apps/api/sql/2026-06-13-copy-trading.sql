-- Copy Trading — DDL aplicado em producao (Supabase yilmbwrfaljxgvsygmyz) em 2026-06-13.
-- Aplicado via Supabase MCP (apply_migration). Este arquivo e o REGISTRO do que foi rodado.
--
-- Modulo ISOLADO: tabelas proprias, SEM FK para profiles/accounts. Nunca toca `operations`
-- (rollover/ranking/estatisticas ficam intactos). Toda escrita de saldo passa pelo backend
-- Fastify (CTE atomica). RLS habilitado + grants revogados = cliente nao toca direto.

-- ── app_config (gate global copyTradeEnabled) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_config (key, value) VALUES ('copyTradeEnabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── copy_traders (catalogo, editavel no admin) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_traders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, country_code text NOT NULL DEFAULT 'br', avatar_url text,
  vip boolean NOT NULL DEFAULT false, paid boolean NOT NULL DEFAULT false,
  access_price numeric NOT NULL DEFAULT 0, weekly_gain_pct numeric NOT NULL DEFAULT 0,
  copiers integer NOT NULL DEFAULT 0, copied_trades integer NOT NULL DEFAULT 0,
  commission_pct numeric NOT NULL DEFAULT 0, profit_pct numeric NOT NULL DEFAULT 0,
  loss_pct numeric NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed inicial de ~8 traders.
INSERT INTO public.copy_traders
  (name, country_code, vip, paid, access_price, weekly_gain_pct, copiers, copied_trades, commission_pct, profit_pct, loss_pct, active, display_order)
VALUES
  ('Diego S.','br',true,true,249.00,95,1586,203,5,93,7,true,1),
  ('Mei L.','jp',true,true,147.00,90,2581,543,7,95,5,true,2),
  ('Akira T.','jp',true,true,99.00,82,1204,612,9,85,15,true,3),
  ('Espinatrader','br',true,false,0.00,85,885,5086,10,88,12,true,4),
  ('Hardu','br',true,false,0.00,78,158,385,10,66,34,true,5),
  ('175370154','id',true,false,0.00,68,233,174,8,74,26,true,6),
  ('Carla M.','br',false,false,0.00,72,412,96,6,80,20,true,7),
  ('Lucas P.','br',false,false,0.00,60,540,220,5,70,30,true,8)
ON CONFLICT DO NOTHING;

-- ── user_copy_traders (assinaturas) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_copy_traders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, trader_id uuid NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(), price_paid numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  next_cycle_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_copy_traders_active_uniq
  ON public.user_copy_traders (user_id, trader_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS user_copy_traders_status_next_cycle
  ON public.user_copy_traders (status, next_cycle_at);

-- ── copy_trade_operations (operacoes geradas) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.copy_trade_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, trader_id uuid NOT NULL,
  result text NOT NULL CHECK (result IN ('WIN','LOSS')),
  amount numeric NOT NULL, pnl numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SETTLED','CANCELLED')),
  scheduled_at timestamptz NOT NULL, settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS copy_trade_operations_status_scheduled
  ON public.copy_trade_operations (status, scheduled_at);
CREATE INDEX IF NOT EXISTS copy_trade_operations_user_trader
  ON public.copy_trade_operations (user_id, trader_id);

-- ── RLS + revoke (defesa em profundidade) ───────────────────────────────────────
ALTER TABLE public.app_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_traders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_copy_traders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_trade_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_config, public.copy_traders, public.user_copy_traders,
             public.copy_trade_operations FROM anon, authenticated;

-- ── Tipos de transacao do copy (neste projeto transactions.type e TEXT + CHECK) ──
-- So amplia a lista permitida (nunca restringe) -> seguro para producao.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type = ANY (ARRAY[
    'DEPOSIT','WITHDRAWAL','TRADE_WIN','TRADE_LOSS','TRADE_DRAW',
    'EARLY_CLOSE','DEMO_RESET','BONUS','COPY_PURCHASE','COPY_RESULT'
  ]));

-- ── Saldo nunca negativo (defesa junto aos LEAST/GREATEST do copy) ───────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accounts_balance_non_negative') THEN
    ALTER TABLE public.accounts ADD CONSTRAINT accounts_balance_non_negative CHECK (balance >= 0) NOT VALID;
    ALTER TABLE public.accounts VALIDATE CONSTRAINT accounts_balance_non_negative;
  END IF;
END $$;

-- ── Exclusao de usuario tambem limpa o copy (tabelas isoladas, sem cascade) ───────
-- A funcao admin_soft_delete_user(uuid,text) foi recriada para, alem do soft-delete
-- original, cancelar assinaturas ACTIVE e operacoes PENDING do usuario (senao o worker
-- geraria ciclos eternamente para a conta zumbi). Ver migration soft_delete_user_copy_cleanup.
