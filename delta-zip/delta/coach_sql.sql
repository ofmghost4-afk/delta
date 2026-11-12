-- =====================================================================
-- AURA COACH v2 (Modo Dominante) · SQL para rodar UMA VEZ no Supabase (projeto "Central de Chat")
-- Como rodar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Pode rodar de novo sem medo (tudo é "if not exists" / "create or replace").
-- Não altera nenhuma tabela nem função do Aura. Só cria:
--   central.emp_jogadas            (tabela: jogadas que você marcou "Usei")
--   central.coach_pode()           (confere se quem chama está em emp_usuarios)
--   public.coach_registrar_jogada  (grava 1 jogada, só quando você clica)
--   public.coach_ppvs              (lê PPVs da sala em central.emp_ppvs; se a
--                                   tabela ainda não existir, devolve vazio)
--   public.coach_placar            (v2: placar do dia por conta, só somas:
--                                   receita, vendas, PPVs enviados, jogadas)
--   public.coach_historico         (v2: roteiros já usados com o fã, 90 dias)
--   public.coach_conversao_semana  (v2: conversão por roteiro em 7 dias)
--   public.coach_conversa          (v2.3.3: só lê a conversa salva da sala, para a IA)
-- v2 também acrescenta a coluna "modo" em emp_jogadas (normal/dominante).
-- Já rodou a v1? Rode este arquivo inteiro de novo: ele atualiza sem perder nada.
-- v2.0.1: coach_conversao_semana conta cada compra uma vez só (vai para a jogada
--         mais recente antes da compra). Já rodou a v2? Rode de novo, uma vez.
-- Todas as funções public.coach_* são "security definer", com "search_path = ''",
-- conferem central.coach_pode() antes de qualquer coisa e não aceitam anon.
-- =====================================================================

-- 0) CONFERIR ANTES (opcional, só leitura): veja as colunas de emp_usuarios.
--    O Coach procura uma coluna uuid (user_id / usuario_id / auth_id / id)
--    ou uma coluna "email". Se a sua tiver outro nome, ajuste o passo 2.
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'central' and table_name = 'emp_usuarios';

-- 1) Tabela das jogadas
create table if not exists central.emp_jogadas (
  id             bigint generated always as identity primary key,
  sala           text not null,
  fa_id          text not null,
  conta          text,
  fase           text not null,
  jogada         text not null,
  roteiro_id     text,
  variante       smallint,
  preco_sugerido numeric(10,2),
  usuario        uuid default auth.uid(),
  modo           text,
  em             timestamptz not null default now()
);
alter table central.emp_jogadas add column if not exists modo text;
create index if not exists emp_jogadas_fa_em on central.emp_jogadas (fa_id, em desc);
create index if not exists emp_jogadas_sala_em on central.emp_jogadas (sala, em desc);
alter table central.emp_jogadas enable row level security;
revoke all on central.emp_jogadas from public, anon, authenticated;

-- 2) Quem pode usar: só quem está em central.emp_usuarios (mesma regra do Aura)
create or replace function central.coach_pode()
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ok  boolean := false;
  v_col text;
begin
  if auth.uid() is null then return false; end if;
  if to_regclass('central.emp_usuarios') is null then return false; end if;

  select c.column_name into v_col
    from information_schema.columns c
   where c.table_schema = 'central' and c.table_name = 'emp_usuarios'
     and c.data_type = 'uuid'
     and c.column_name in ('user_id', 'usuario_id', 'auth_id', 'auth_uid', 'id')
   order by array_position(array['user_id','usuario_id','auth_id','auth_uid','id']::text[], c.column_name::text)
   limit 1;
  if v_col is not null then
    execute format('select exists (select 1 from central.emp_usuarios where %I = $1)', v_col)
       into v_ok using auth.uid();
    if v_ok then return true; end if;
  end if;

  select c.column_name into v_col
    from information_schema.columns c
   where c.table_schema = 'central' and c.table_name = 'emp_usuarios' and c.column_name = 'email'
   limit 1;
  if v_col is not null then
    execute 'select exists (select 1 from central.emp_usuarios where lower(email) = lower($1))'
       into v_ok using coalesce(auth.jwt() ->> 'email', '');
  end if;
  return coalesce(v_ok, false);
end $$;
revoke all on function central.coach_pode() from public, anon, authenticated;

-- 3) Gravar uma jogada (o Coach só chama quando você clica "Usei esta jogada")
--    v2: troca a versão de 8 parâmetros pela de 9 (com p_modo), para não ficar ambígua.
drop function if exists public.coach_registrar_jogada(text, text, text, text, text, text, smallint, numeric);
create or replace function public.coach_registrar_jogada(
  p_sala text, p_fa_id text, p_conta text, p_fase text, p_jogada text,
  p_roteiro_id text default null, p_variante smallint default null,
  p_preco numeric default null, p_modo text default null)
returns bigint
language plpgsql volatile security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_conta is not null and p_conta not in ('arrudafree', 'xlunavitaligratis', 'louisefree') then
    raise exception 'conta fora do Coach' using errcode = '22023';
  end if;
  if coalesce(p_sala, '') = '' or coalesce(p_fa_id, '') = '' or coalesce(p_fase, '') = '' or coalesce(p_jogada, '') = '' then
    raise exception 'campos obrigatórios' using errcode = '22023';
  end if;
  if p_modo is not null and p_modo not in ('normal', 'dominante') then
    raise exception 'modo inválido' using errcode = '22023';
  end if;
  insert into central.emp_jogadas (sala, fa_id, conta, fase, jogada, roteiro_id, variante, preco_sugerido, modo)
  values (left(p_sala, 64), left(p_fa_id, 64), p_conta, left(p_fase, 40), left(p_jogada, 300),
          left(p_roteiro_id, 40), p_variante, p_preco, p_modo)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.coach_registrar_jogada(text, text, text, text, text, text, smallint, numeric, text) from public, anon;
grant execute on function public.coach_registrar_jogada(text, text, text, text, text, text, smallint, numeric, text) to authenticated;

-- 3b) Nomes da conta (interna, não é chamada pelo Delta). emp_ppvs guarda a conta
--     como em central.emp_contas.conta (ex.: "Luna"); o Delta e emp_jogadas usam o
--     profile_name (ex.: "xlunavitaligratis"). Devolve todos os nomes possíveis da
--     mesma conta para comparar com "= any(...)". Sem emp_contas, devolve só o nome dado.
create or replace function central.coach_nomes_conta(p_conta text)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
declare v_nomes text[];
begin
  if to_regclass('central.emp_contas') is null then
    return array[p_conta];
  end if;
  select array_agg(distinct x) into v_nomes
    from (select p_conta as x
          union all select e.conta from central.emp_contas e where e.profile_name = p_conta or e.conta = p_conta
          union all select e.profile_name from central.emp_contas e where e.profile_name = p_conta or e.conta = p_conta) z
   where x is not null;
  return coalesce(v_nomes, array[p_conta]);
end $$;
revoke all on function central.coach_nomes_conta(text) from public, anon, authenticated;

-- 4) Ler PPVs da sala (Aura 1.3). Sem a tabela emp_ppvs, devolve vazio e o
--    Coach mostra "estado do PPV indisponível".
create or replace function public.coach_ppvs(p_sala text, p_conta text)
returns table (msg_id text, preco numeric, enviado_em timestamptz, comprado boolean, comprado_em timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if to_regclass('central.emp_ppvs') is null then
    return;
  end if;
  return query execute
    'select p.msg_id::text, p.preco::numeric, p.enviado_em::timestamptz, p.comprado::boolean, p.comprado_em::timestamptz
       from central.emp_ppvs p
      where p.sala = $1 and p.conta = any(central.coach_nomes_conta($2))
      order by p.enviado_em desc
      limit 20'
    using p_sala, p_conta;
end $$;
revoke all on function public.coach_ppvs(text, text) from public, anon;
grant execute on function public.coach_ppvs(text, text) to authenticated;

-- 5) Placar do dia (v2, Modo Dominante). Só números somados por conta, nenhum
--    dado de fã. "Hoje" = dia de Brasília. Receita = PPVs marcados como comprados
--    hoje em emp_ppvs (Aura 1.3). Sem emp_ppvs, devolve zeros + jogadas do dia.
create or replace function public.coach_placar()
returns table (conta text, receita numeric, vendas bigint, ppvs bigint, jogadas bigint)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_contas text[] := array['arrudafree', 'xlunavitaligratis', 'louisefree'];
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if to_regclass('central.emp_ppvs') is null then
    return query
      select c.cta, 0::numeric, 0::bigint, 0::bigint,
             (select count(*) from central.emp_jogadas j where j.conta = any(central.coach_nomes_conta(c.cta)) and j.em >= v_ini)
        from unnest(v_contas) as c(cta);
    return;
  end if;
  return query execute
    'select c.cta,
            coalesce((select sum(p.preco) from central.emp_ppvs p where p.conta = any(central.coach_nomes_conta(c.cta)) and p.comprado and p.comprado_em >= $1), 0)::numeric,
            (select count(*) from central.emp_ppvs p where p.conta = any(central.coach_nomes_conta(c.cta)) and p.comprado and p.comprado_em >= $1)::bigint,
            (select count(*) from central.emp_ppvs p where p.conta = any(central.coach_nomes_conta(c.cta)) and p.enviado_em >= $1)::bigint,
            (select count(*) from central.emp_jogadas j where j.conta = any(central.coach_nomes_conta(c.cta)) and j.em >= $1)::bigint
       from unnest($2::text[]) as c(cta)'
    using v_ini, v_contas;
end $$;
revoke all on function public.coach_placar() from public, anon;
grant execute on function public.coach_placar() to authenticated;

-- 6) Histórico de roteiros com este fã (aviso "já usou X com ele em dd/mm").
--    Só roteiro, variante e data dos últimos 90 dias. Nada de texto.
create or replace function public.coach_historico(p_fa_id text)
returns table (roteiro_id text, variante smallint, em timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
    select j.roteiro_id, j.variante, j.em
      from central.emp_jogadas j
     where j.fa_id = p_fa_id and j.roteiro_id is not null and j.em >= now() - interval '90 days'
     order by j.em desc
     limit 200;
end $$;
revoke all on function public.coach_historico(text) from public, anon;
grant execute on function public.coach_historico(text) to authenticated;

-- 7) Conversão por roteiro na semana: jogada marcada "Usei" x PPV comprado na
--    mesma sala em até 60 min. Serve para manter os que vendem e cortar o resto
--    (o Coach só mostra; nada é apagado sozinho).
--    Cada compra conta UMA vez só: vai para a jogada mais recente antes de
--    comprado_em. Se você marcou 2+ jogadas na mesma sala nos 60 min antes da
--    compra, as mais antigas não levam a venda (o "not exists" abaixo barra
--    qualquer jogada que tenha outra jogada entre ela e a compra). Sem isso a
--    mesma compra somava receita e venda em dois roteiros.
create or replace function public.coach_conversao_semana(p_conta text default null)
returns table (roteiro_id text, modo text, usos bigint, vendas bigint, receita numeric)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if to_regclass('central.emp_ppvs') is null then
    return query
      select j.roteiro_id, j.modo, count(*)::bigint, 0::bigint, 0::numeric
        from central.emp_jogadas j
       where j.em >= now() - interval '7 days' and j.roteiro_id is not null and (p_conta is null or j.conta = p_conta)
       group by j.roteiro_id, j.modo;
    return;
  end if;
  return query execute
    'select j.roteiro_id, j.modo, count(*)::bigint,
            count(v.preco)::bigint,
            coalesce(sum(v.preco), 0)::numeric
       from central.emp_jogadas j
       left join lateral (
         select p.preco from central.emp_ppvs p
          where p.sala = j.sala and p.conta = any(central.coach_nomes_conta(j.conta)) and p.comprado
            and p.comprado_em >= j.em and p.comprado_em <= j.em + interval ''60 minutes''
            and not exists (
              select 1 from central.emp_jogadas j2
               where j2.sala = j.sala and j2.conta = j.conta and j2.roteiro_id is not null
                 and j2.id <> j.id
                 and (j2.em > j.em or (j2.em = j.em and j2.id > j.id))
                 and j2.em <= p.comprado_em)
          order by p.comprado_em limit 1) v on true
      where j.em >= now() - interval ''7 days'' and j.roteiro_id is not null and ($1 is null or j.conta = $1)
      group by j.roteiro_id, j.modo'
    using p_conta;
end $$;
revoke all on function public.coach_conversao_semana(text) from public, anon;
grant execute on function public.coach_conversao_semana(text) to authenticated;

-- =====================================================================
-- v2.2 (10/11/2026) · AINDA NÃO RODADO NO BANCO. Rode este arquivo inteiro de
-- novo, uma vez, para ligar: ordem das variantes, radar das 3 contas, placar
-- por chatter, ex-assinantes, relatório de turno e memória do fã.
-- Sem rodar, o Delta continua funcionando: só esconde esses blocos.
-- Nada aqui altera tabela ou função do Aura (painel_*). Só cria
-- central.coach_radar e funções public.coach_* (security definer,
-- search_path = '', central.coach_pode(), sem anon).
-- =====================================================================

-- 9) Conversão por roteiro E variante na semana (mesma regra do passo 7: cada
--    compra conta uma vez, para a jogada mais recente antes dela). O Delta usa
--    para pôr na frente a variante que mais converteu (10+ usos do roteiro).
create or replace function public.coach_conversao_variantes(p_conta text default null)
returns table (roteiro_id text, modo text, variante smallint, usos bigint, vendas bigint, receita numeric)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if to_regclass('central.emp_ppvs') is null then
    return query
      select j.roteiro_id, j.modo, j.variante, count(*)::bigint, 0::bigint, 0::numeric
        from central.emp_jogadas j
       where j.em >= now() - interval '7 days' and j.roteiro_id is not null and j.variante is not null and (p_conta is null or j.conta = p_conta)
       group by j.roteiro_id, j.modo, j.variante;
    return;
  end if;
  return query execute
    'select j.roteiro_id, j.modo, j.variante, count(*)::bigint,
            count(v.preco)::bigint,
            coalesce(sum(v.preco), 0)::numeric
       from central.emp_jogadas j
       left join lateral (
         select p.preco from central.emp_ppvs p
          where p.sala = j.sala and p.conta = any(central.coach_nomes_conta(j.conta)) and p.comprado
            and p.comprado_em >= j.em and p.comprado_em <= j.em + interval ''60 minutes''
            and not exists (
              select 1 from central.emp_jogadas j2
               where j2.sala = j.sala and j2.conta = j.conta and j2.roteiro_id is not null
                 and j2.id <> j.id
                 and (j2.em > j.em or (j2.em = j.em and j2.id > j.id))
                 and j2.em <= p.comprado_em)
          order by p.comprado_em limit 1) v on true
      where j.em >= now() - interval ''7 days'' and j.roteiro_id is not null and j.variante is not null and ($1 is null or j.conta = $1)
      group by j.roteiro_id, j.modo, j.variante'
    using p_conta;
end $$;
revoke all on function public.coach_conversao_variantes(text) from public, anon;
grant execute on function public.coach_conversao_variantes(text) to authenticated;

-- 10) Radar global das 3 contas. Cada perfil do Chrome publica, a cada ~20 s, só
--     NÚMEROS da sua conta (nenhum nome de fã) e lê os das outras. Conta sem
--     atualização há mais de 3 min aparece como offline.
create table if not exists central.coach_radar (
  conta         text primary key check (conta in ('arrudafree', 'xlunavitaligratis', 'louisefree')),
  estado        jsonb not null default '{}'::jsonb,
  usuario       uuid,
  atualizado_em timestamptz not null default now()
);
alter table central.coach_radar enable row level security;
revoke all on central.coach_radar from public, anon, authenticated;

create or replace function public.coach_radar(p_conta text default null, p_estado jsonb default null)
returns table (conta text, estado jsonb, atualizado_em timestamptz, offline boolean)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_conta is not null and p_estado is not null then
    if p_conta not in ('arrudafree', 'xlunavitaligratis', 'louisefree') then
      raise exception 'conta fora do Coach' using errcode = '22023';
    end if;
    if pg_column_size(p_estado) > 2000 then
      raise exception 'estado grande demais' using errcode = '22023';
    end if;
    -- só os campos numéricos conhecidos entram (nada de texto livre)
    insert into central.coach_radar as r (conta, estado, usuario, atualizado_em)
    values (p_conta,
            jsonb_build_object(
              'vips_esperando', coalesce((p_estado ->> 'vips_esperando')::int, 0),
              'maior_espera_s', coalesce((p_estado ->> 'maior_espera_s')::int, 0),
              'baleias_online', coalesce((p_estado ->> 'baleias_online')::int, 0),
              'fu_vencidos',    coalesce((p_estado ->> 'fu_vencidos')::int, 0),
              'nao_lidas',      coalesce((p_estado ->> 'nao_lidas')::int, 0),
              'chats_h',        coalesce((p_estado ->> 'chats_h')::int, 0)),
            auth.uid(), now())
    on conflict on constraint coach_radar_pkey do update set estado = excluded.estado, usuario = excluded.usuario, atualizado_em = excluded.atualizado_em;
  end if;
  return query
    select c.cta, coalesce(r.estado, '{}'::jsonb), r.atualizado_em,
           (r.atualizado_em is null or r.atualizado_em < now() - interval '3 minutes')
      from unnest(array['arrudafree', 'xlunavitaligratis', 'louisefree']) as c(cta)
      left join central.coach_radar r on r.conta = c.cta;
end $$;
revoke all on function public.coach_radar(text, jsonb) from public, anon;
grant execute on function public.coach_radar(text, jsonb) to authenticated;

-- 11) Placar por chatter (hoje, dia de Brasília). Jogadas marcadas "Usei" por
--     cada login x PPVs comprados hoje nas salas que ele atendeu. Cada venda vai
--     para o chatter da jogada mais recente antes da compra. Sem e-mail: devolve
--     "você" para quem chama e "chatter 2, 3…" para os outros.
create or replace function public.coach_placar_chatter()
returns table (eu boolean, chatter text, jogadas bigint, salas bigint, vendas bigint, receita numeric)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if to_regclass('central.emp_ppvs') is null then
    return query
      select (j.usuario = auth.uid()), case when j.usuario = auth.uid() then 'você' else 'chatter ' || (dense_rank() over (order by j.usuario))::text end,
             count(*)::bigint, count(distinct j.sala)::bigint, 0::bigint, 0::numeric
        from central.emp_jogadas j where j.em >= v_ini and j.usuario is not null
       group by j.usuario;
    return;
  end if;
  return query execute
    'with jg as (select j.usuario, count(*) n, count(distinct j.sala) s from central.emp_jogadas j where j.em >= $1 and j.usuario is not null group by j.usuario),
          vd as (select u.usuario, count(*) n, sum(p.preco) v
                   from central.emp_ppvs p
                   join lateral (select j.usuario from central.emp_jogadas j
                                  where j.sala = p.sala and p.conta = any(central.coach_nomes_conta(j.conta)) and j.usuario is not null and j.em >= $1 and j.em <= p.comprado_em
                                  order by j.em desc, j.id desc limit 1) u on true
                  where p.comprado and p.comprado_em >= $1
                  group by u.usuario)
     select (jg.usuario = $2), case when jg.usuario = $2 then ''você'' else ''chatter '' || (dense_rank() over (order by jg.usuario))::text end,
            jg.n::bigint, jg.s::bigint, coalesce(vd.n, 0)::bigint, coalesce(vd.v, 0)::numeric
       from jg left join vd on vd.usuario = jg.usuario
      order by coalesce(vd.v, 0) desc, jg.n desc'
    using v_ini, auth.uid();
end $$;
revoke all on function public.coach_placar_chatter() from public, anon;
grant execute on function public.coach_placar_chatter() to authenticated;

-- 12) Ex-assinantes / sumidos para reengajar quando sair conteúdo novo: quem já
--     comprou nesta conta, está há 30+ dias sem comprar, ordenado pelo maior
--     total gasto na empresa (LTV). Só leitura de emp_compras + emp_fas.
create or replace function public.coach_ex_assinantes(p_conta text)
returns table (fa_id bigint, nome text, perfil text, total numeric, na_conta numeric, compras bigint, ultima date, dias integer)
language plpgsql stable security definer
set search_path = ''
as $$
declare v_nomes text[];
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_conta is null or p_conta not in ('arrudafree', 'xlunavitaligratis', 'louisefree') then
    raise exception 'conta fora do Coach' using errcode = '22023';
  end if;
  -- o extrato pode chamar a conta pelo nome de vendedor (ex.: "Luna"): aceita os dois
  select array_agg(distinct x) into v_nomes
    from (select p_conta as x union all select e.conta from central.emp_contas e where e.profile_name = p_conta or e.conta = p_conta
          union all select e.profile_name from central.emp_contas e where e.conta = p_conta) z;
  return query
    select f.id, f.nome, f.codigo_perfil, t.total, t.na_conta, t.n, t.ultima, (current_date - t.ultima)::int
      from (select c.codigo_comprador,
                   sum(c.valor) as total,
                   sum(c.valor) filter (where c.conta = any (v_nomes)) as na_conta,
                   count(*) filter (where c.conta = any (v_nomes)) as n,
                   max(c.data) filter (where c.conta = any (v_nomes)) as ultima
              from central.emp_compras c
             where c.situacao = 'Pagamento confirmado' and c.codigo_comprador is not null
             group by c.codigo_comprador) t
      join central.emp_fas f on f.codigo_comprador = t.codigo_comprador
     where t.na_conta > 0 and t.ultima <= current_date - 30
     order by t.total desc
     limit 60;
end $$;
revoke all on function public.coach_ex_assinantes(text) from public, anon;
grant execute on function public.coach_ex_assinantes(text) to authenticated;

-- 13) Relatório de fim de turno do chatter que chama (últimas p_horas horas):
--     faturamento, conversão, top 3 roteiros e baleias atendidas. "Quem ficou
--     esperando" o Delta acrescenta com o que está na tela (não fica no banco).
create or replace function public.coach_relatorio_turno(p_horas int default 8)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_h   int := least(greatest(coalesce(p_horas, 8), 1), 24);
  v_ini timestamptz;
  v_out jsonb;
  v_ven jsonb := jsonb_build_object('vendas', 0, 'receita', 0, 'ppvs', 0);
  v_top jsonb := '[]'::jsonb;
  v_bal jsonb := '[]'::jsonb;
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  v_ini := now() - make_interval(hours => v_h);
  select jsonb_build_object('horas', v_h, 'inicio', v_ini, 'fim', now(),
           'jogadas', count(*), 'salas', count(distinct j.sala),
           'por_conta', coalesce((select jsonb_object_agg(x.conta, x.n) from (select j2.conta, count(*) n from central.emp_jogadas j2 where j2.usuario = auth.uid() and j2.em >= v_ini and j2.conta is not null group by j2.conta) x), '{}'::jsonb))
    into v_out
    from central.emp_jogadas j where j.usuario = auth.uid() and j.em >= v_ini;
  if to_regclass('central.emp_ppvs') is not null then
    execute
      'select jsonb_build_object(''vendas'', count(*) filter (where p.comprado and p.comprado_em >= $1), ''receita'', coalesce(sum(p.preco) filter (where p.comprado and p.comprado_em >= $1), 0), ''ppvs'', count(*) filter (where p.enviado_em >= $1))
         from central.emp_ppvs p
        where exists (select 1 from central.emp_jogadas j where j.usuario = $2 and j.em >= $1 and j.sala = p.sala and p.conta = any(central.coach_nomes_conta(j.conta)))'
      into v_ven using v_ini, auth.uid();
    execute
      'select coalesce(jsonb_agg(t order by t.receita desc, t.usos desc), ''[]''::jsonb) from (
         select j.roteiro_id, count(*) usos, count(v.preco) vendas, coalesce(sum(v.preco), 0) receita
           from central.emp_jogadas j
           left join lateral (select p.preco from central.emp_ppvs p where p.sala = j.sala and p.conta = any(central.coach_nomes_conta(j.conta)) and p.comprado and p.comprado_em >= j.em and p.comprado_em <= j.em + interval ''60 minutes''
                    and not exists (select 1 from central.emp_jogadas j2 where j2.sala = j.sala and j2.conta = j.conta and j2.roteiro_id is not null and j2.id <> j.id and (j2.em > j.em or (j2.em = j.em and j2.id > j.id)) and j2.em <= p.comprado_em)
                  order by p.comprado_em limit 1) v on true
          where j.usuario = $2 and j.em >= $1 and j.roteiro_id is not null
          group by j.roteiro_id order by coalesce(sum(v.preco), 0) desc, count(*) desc limit 3) t'
      into v_top using v_ini, auth.uid();
  else
    select coalesce(jsonb_agg(t order by t.usos desc), '[]'::jsonb) into v_top from (
      select j.roteiro_id, count(*) usos, 0 vendas, 0 receita from central.emp_jogadas j
       where j.usuario = auth.uid() and j.em >= v_ini and j.roteiro_id is not null group by j.roteiro_id order by count(*) desc limit 3) t;
  end if;
  -- baleias (R$ 2.300+ na empresa) e VIPs (R$ 1.000+) atendidos no turno: só o primeiro nome e o total
  select coalesce(jsonb_agg(b order by b.total desc), '[]'::jsonb) into v_bal from (
    select split_part(coalesce(f.nome, ''), ' ', 1) as nome, t.total, (t.total >= 2300) as baleia
      from (select distinct j.fa_id from central.emp_jogadas j where j.usuario = auth.uid() and j.em >= v_ini and j.fa_id ~ '^[0-9]+$') a
      join central.emp_fas f on f.id = a.fa_id::bigint
      join lateral (select coalesce(sum(c.valor), 0) total from central.emp_compras c where c.codigo_comprador = f.codigo_comprador and c.situacao = 'Pagamento confirmado') t on true
     where t.total >= 1000
     order by t.total desc limit 10) b;
  return v_out || v_ven || jsonb_build_object('top_roteiros', v_top, 'grandes', v_bal);
end $$;
revoke all on function public.coach_relatorio_turno(int) from public, anon;
grant execute on function public.coach_relatorio_turno(int) to authenticated;

-- 14) Memória do fã (botão ⚡ Adaptar): grava em central.emp_notas, a MESMA
--     tabela de notas da ficha do Aura, uma nota "chave: valor" por campo
--     (nome, trabalho, horarios, fetiches, dia_pagamento, recusas). Troca a
--     nota anterior da mesma chave em vez de empilhar. Só o chatter grava (1 clique).
create or replace function public.coach_memoria(p_fa bigint, p_campos jsonb)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_k text; v_v text; v_n integer := 0;
  v_ok text[] := array['nome', 'trabalho', 'profissao', 'horarios', 'fetiches', 'dia_pagamento', 'recusas', 'time', 'hobby', 'detalhe'];
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_fa is null or not exists (select 1 from central.emp_fas f where f.id = p_fa) then
    raise exception 'fã não encontrado' using errcode = '22023';
  end if;
  if p_campos is null or jsonb_typeof(p_campos) <> 'object' then return 0; end if;
  for v_k, v_v in select key, value from jsonb_each_text(p_campos) loop
    v_v := btrim(left(coalesce(v_v, ''), 200));
    if v_k = any (v_ok) and v_v <> '' then
      delete from central.emp_notas n where n.fa_id = p_fa and n.tipo = 'nota' and n.texto like v_k || ': %';
      insert into central.emp_notas (fa_id, tipo, texto) values (p_fa, 'nota', v_k || ': ' || v_v);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.coach_memoria(bigint, jsonb) from public, anon;
grant execute on function public.coach_memoria(bigint, jsonb) to authenticated;

-- 15) Conversa salva da sala (v2.3.3, ⚡ da IA). Só LEITURA das mensagens que o
--     Delta (ou o Aura) gravou em central.emp_mensagens pela função painel_msgs do
--     Aura (que não muda). Devolve as últimas p_limite (1 a 200) da sala, da mais
--     antiga para a mais nova. emp_mensagens guarda a conta como em
--     central.emp_contas.conta (ex.: "Luna"); o Delta conhece o profile_name
--     (ex.: "xlunavitaligratis"), então traduz aqui. Busca pelo fã (usa o índice
--     emp_mensagens_fa_idx que já existe; nenhuma tabela do Aura é alterada).
create or replace function public.coach_conversa(p_fa bigint, p_sala text, p_conta text, p_limite integer default 80)
returns table (msg_id text, de_fa boolean, em timestamptz, tipo text, texto text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_conta text;
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_fa is null or p_sala is null or p_sala !~ '^[0-9a-f]{24}$' or to_regclass('central.emp_mensagens') is null then
    return;
  end if;
  select e.conta into v_conta from central.emp_contas e where e.profile_name = lower(btrim(coalesce(p_conta, '')));
  return query
    select x.msg_id, x.de_fa, x.em, x.tipo, x.texto
      from (select m.msg_id, m.de_fa, m.em, m.tipo, m.texto
              from central.emp_mensagens m
             where m.fa_id = p_fa and m.sala = p_sala and m.conta = coalesce(v_conta, p_conta)
             order by m.em desc nulls last
             limit least(greatest(coalesce(p_limite, 80), 1), 200)) x
     order by x.em asc nulls first;
end $$;
revoke all on function public.coach_conversa(bigint, text, text, integer) from public, anon;
grant execute on function public.coach_conversa(bigint, text, text, integer) to authenticated;

-- 8) Conferir depois (só leitura):
-- select proname, prosecdef, proconfig from pg_proc where proname like 'coach_%';
-- select * from central.emp_jogadas order by em desc limit 20;

-- 16) Recall de fatos antigos do fã (v2.3.10; sem acento e com erro de digitação na v2.3.11). Só
--     LEITURA de central.emp_mensagens: devolve até p_limite (1 a 10) mensagens DO FÃ, das mais
--     novas para as mais antigas, que contenham a palavra de p_busca (busca de texto em português,
--     ignorando acentos) OU algo muito parecido com ela ("trabaio" acha "trabalho"; pg_trgm,
--     limite 0.6). Usa as extensões unaccent e pg_trgm (schema extensions). Nenhuma tabela é alterada.
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create or replace function public.coach_recall_fatos(p_fa bigint, p_busca text, p_limite int default 5)
returns table (msg_id text, em timestamptz, texto text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_q text;
begin
  if not central.coach_pode() then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_fa is null or btrim(coalesce(p_busca, '')) = '' or to_regclass('central.emp_mensagens') is null then
    return;
  end if;
  v_q := extensions.unaccent('extensions.unaccent'::regdictionary, lower(left(btrim(p_busca), 200)));
  return query
    select m.msg_id, m.em, m.texto
      from central.emp_mensagens m
     where m.fa_id = p_fa and m.de_fa = true and m.texto is not null
       and (to_tsvector('portuguese', extensions.unaccent('extensions.unaccent'::regdictionary, m.texto)) @@ plainto_tsquery('portuguese', v_q)
            or extensions.word_similarity(v_q, extensions.unaccent('extensions.unaccent'::regdictionary, lower(m.texto))) >= 0.6)
     order by m.em desc
     limit least(greatest(coalesce(p_limite, 5), 1), 10);
end $$;
revoke all on function public.coach_recall_fatos(bigint, text, int) from public, anon;
grant execute on function public.coach_recall_fatos(bigint, text, int) to authenticated;
