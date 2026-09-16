'use client';

import {
  BookOpen,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  FileText,
  LockKeyhole,
  ShoppingBag,
} from 'lucide-react';

import { AdminShell } from '@/components/admin-shell';

const topics = [
  {
    icon: LockKeyhole,
    title: 'Abrir e fechar o Caixa',
    items: [
      'Abra o turno informando o dinheiro disponível para troco.',
      'As vendas de pedidos concluídos entram automaticamente quando há um caixa aberto.',
      'Antes de fechar, conte o dinheiro, confira a diferença e explique qualquer divergência.',
      'Depois da confirmação, o caixa fica encerrado e não aceita novas movimentações.',
    ],
  },
  {
    icon: ShoppingBag,
    title: 'Pedidos e pagamentos',
    items: [
      'Confira o pedido e a forma de pagamento antes de mandar para a cozinha.',
      'Dinheiro, Pix e cartão ficam separados no resumo do Caixa.',
      'Para dinheiro, o checkout calcula o troco e avisa quando o valor recebido é menor que o total.',
      'Não repita a confirmação: cada pedido possui uma única movimentação automática.',
    ],
  },
  {
    icon: CreditCard,
    title: 'Sangria e suprimento',
    items: [
      'Sangria é a retirada de dinheiro durante o turno; informe valor e motivo.',
      'Suprimento é uma entrada de dinheiro, geralmente para reforçar o troco.',
      'O sistema não permite sangria maior que o dinheiro esperado no Caixa.',
    ],
  },
  {
    icon: FileText,
    title: 'Finanças e relatórios',
    items: [
      'Finanças consolida pedidos concluídos, despesas e valores pendentes.',
      'Use o mês e o tipo de lançamento para conferir receitas e despesas.',
      'A distribuição por forma de pagamento ajuda a comparar com o fechamento do Caixa.',
      'Estornos aparecem como movimentação compensatória; o lançamento original não é apagado.',
    ],
  },
];

export default function HelpPage() {
  return (
    <AdminShell>
      <div className="max-w-4xl">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">
          Ajuda rápida
        </p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-[-.04em]">
          <CircleHelp className="size-8 text-[#82204f]" /> Central de Ajuda
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#826a75]">
          Orientações simples para a equipe operar pedidos, pagamentos, Caixa e
          Finanças com segurança.
        </p>
        <section className="mt-7 grid gap-4 sm:grid-cols-2">
          {topics.map(({ icon: Icon, title, items }) => (
            <article
              key={title}
              className="rounded-[26px] bg-white p-5 shadow-sm sm:p-6"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-[#fff0f5] text-[#82204f]">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-4 text-xl font-black">{title}</h2>
              <ul className="mt-4 space-y-3">
                {items.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2 text-sm leading-relaxed text-[#6f5360]"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
        <section className="mt-5 rounded-[26px] bg-[#351924] p-6 text-white">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-1 size-5 shrink-0 text-[#d7f04a]" />
            <div>
              <h2 className="text-xl font-black">Primeiro turno?</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Abra o Caixa antes de concluir o primeiro pedido. No fim do
                turno, compare o valor contado com o dinheiro esperado e
                registre a observação se houver diferença.
              </p>
              <a
                href="/admin/caixa"
                className="mt-5 inline-flex h-10 items-center rounded-full bg-[#d7f04a] px-5 text-sm font-black text-[#351924]"
              >
                Ir para o Caixa
              </a>
            </div>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
