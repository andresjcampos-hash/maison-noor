"use client";

import { useState } from "react";

type ResultadoIA = {
  perfil?: {
    familia?: string;
    descricao?: string;
    tags?: string[];
  };
  mensagem?: string;
};

export default function PerfumeIA() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIA | null>(null);

  const [form, setForm] = useState({
    genero: "",
    intensidade: "",
    estilo: "",
    ocasiao: "",
    clima: "",
    preferencia: "",
  });

  async function analisarPerfil() {
    try {
      setLoading(true);

      const response = await fetch("/api/perfume-ia", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      setResultado(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  return (
    <section
      className="
        rounded-3xl
        border
        border-amber-500/20
        bg-gradient-to-br
        from-[#121212]
        to-[#1a1a1a]
        p-6
        md:p-10
        shadow-2xl
        shadow-black/40
      "
    >
      <div className="mb-8">
        <span
          className="
            inline-flex
            items-center
            rounded-full
            border
            border-amber-400/30
            bg-amber-400/10
            px-4
            py-1
            text-xs
            font-semibold
            uppercase
            tracking-[0.3em]
            text-amber-300
          "
        >
          Maison Noor IA
        </span>

        <h2
          className="
            mt-4
            text-3xl
            md:text-5xl
            font-black
            text-white
          "
        >
          Descubra seu perfil olfativo
        </h2>

        <p className="mt-4 max-w-2xl text-zinc-400">
          Nossa IA analisa suas preferências e recomenda fragrâncias
          compatíveis com seu estilo.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <select
          className="rounded-2xl border border-white/10 bg-black/40 p-4 text-white"
          onChange={(e) => updateField("genero", e.target.value)}
        >
          <option value="">Gênero</option>
          <option>Masculino</option>
          <option>Feminino</option>
          <option>Unissex</option>
        </select>

        <select
          className="rounded-2xl border border-white/10 bg-black/40 p-4 text-white"
          onChange={(e) => updateField("intensidade", e.target.value)}
        >
          <option value="">Intensidade</option>
          <option>Leve</option>
          <option>Moderado</option>
          <option>Intenso</option>
        </select>

        <select
          className="rounded-2xl border border-white/10 bg-black/40 p-4 text-white"
          onChange={(e) => updateField("ocasiao", e.target.value)}
        >
          <option value="">Ocasião</option>
          <option>Dia a dia</option>
          <option>Noite</option>
          <option>Encontro</option>
          <option>Evento especial</option>
        </select>

        <select
          className="rounded-2xl border border-white/10 bg-black/40 p-4 text-white"
          onChange={(e) => updateField("clima", e.target.value)}
        >
          <option value="">Clima ideal</option>
          <option>Calor</option>
          <option>Frio</option>
          <option>Qualquer clima</option>
        </select>

        <select
          className="rounded-2xl border border-white/10 bg-black/40 p-4 text-white"
          onChange={(e) => updateField("preferencia", e.target.value)}
        >
          <option value="">Preferência olfativa</option>
          <option>Doce</option>
          <option>Amadeirado</option>
          <option>Fresco</option>
          <option>Especiado</option>
          <option>Oud</option>
        </select>

        <select
          className="rounded-2xl border border-white/10 bg-black/40 p-4 text-white"
          onChange={(e) => updateField("estilo", e.target.value)}
        >
          <option value="">Seu estilo</option>
          <option>Elegante</option>
          <option>Sedutor</option>
          <option>Moderno</option>
          <option>Luxuoso</option>
        </select>
      </div>

      <button
        onClick={analisarPerfil}
        disabled={loading}
        className="
          mt-8
          inline-flex
          items-center
          justify-center
          rounded-2xl
          bg-amber-400
          px-8
          py-4
          text-sm
          font-bold
          uppercase
          tracking-[0.2em]
          text-black
          transition-all
          duration-300
          hover:scale-[1.02]
          hover:bg-amber-300
          disabled:opacity-50
        "
      >
        {loading ? "Analisando perfil..." : "Analisar meu perfil"}
      </button>

      {resultado?.perfil && (
        <div
          className="
            mt-10
            rounded-3xl
            border
            border-amber-500/20
            bg-black/40
            p-6
          "
        >
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300">
            Perfil identificado
          </span>

          <h3 className="mt-3 text-3xl font-black text-white">
            {resultado.perfil.familia}
          </h3>

          <p className="mt-4 text-zinc-300">
            {resultado.perfil.descricao}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {resultado.perfil.tags?.map((tag) => (
              <span
                key={tag}
                className="
                  rounded-full
                  border
                  border-amber-400/20
                  bg-amber-400/10
                  px-4
                  py-2
                  text-sm
                  text-amber-200
                "
              >
                {tag}
              </span>
            ))}
          </div>

          <a
            href="https://wa.me/5512982627108"
            target="_blank"
            className="
              mt-8
              inline-flex
              rounded-2xl
              border
              border-green-500/30
              bg-green-500/10
              px-6
              py-3
              text-sm
              font-semibold
              text-green-300
              transition-all
              hover:bg-green-500/20
            "
          >
            Falar com consultor Maison Noor
          </a>
        </div>
      )}
    </section>
  );
}