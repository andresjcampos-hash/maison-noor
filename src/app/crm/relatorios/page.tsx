'use client';

import { useEffect, useState } from 'react';

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState('');
  const [modulo, setModulo] = useState('geral');

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            CRM • Relatórios
          </h1>
          <p className="text-sm text-gray-400">
            Visualize dados estratégicos do seu negócio
          </p>
        </div>

        <div className="flex gap-2">
          <button className="btn-primary">Exportar</button>
          <button className="btn-secondary">Atualizar</button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input
          type="month"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="input"
        />

        <select
          value={modulo}
          onChange={(e) => setModulo(e.target.value)}
          className="input"
        >
          <option value="geral">Geral</option>
          <option value="produtos">Produtos</option>
          <option value="pedidos">Pedidos</option>
          <option value="financeiro">Financeiro</option>
          <option value="vendedores">Vendedores</option>
        </select>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-gray-400 text-sm">Faturamento</p>
          <h2 className="text-xl font-bold text-white">R$ 0,00</h2>
        </div>

        <div className="card p-4">
          <p className="text-gray-400 text-sm">Pedidos</p>
          <h2 className="text-xl font-bold text-white">0</h2>
        </div>

        <div className="card p-4">
          <p className="text-gray-400 text-sm">Produtos vendidos</p>
          <h2 className="text-xl font-bold text-white">0</h2>
        </div>

        <div className="card p-4">
          <p className="text-gray-400 text-sm">Ticket médio</p>
          <h2 className="text-xl font-bold text-white">R$ 0,00</h2>
        </div>
      </div>

      {/* TABELA */}
      <div className="card p-4">
        <p className="text-gray-400 text-sm mb-2">Detalhamento</p>

        <table className="w-full text-sm">
          <thead className="text-gray-400">
            <tr>
              <th className="text-left">Nome</th>
              <th className="text-left">Valor</th>
              <th className="text-left">Qtd</th>
              <th className="text-left">Data</th>
            </tr>
          </thead>

          <tbody className="text-white">
            <tr>
              <td colSpan={4} className="text-center py-4 text-gray-500">
                Nenhum dado disponível
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}