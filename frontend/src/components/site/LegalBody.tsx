import type { LegalBlock } from '@/content/legal'

/** Renderiza os blocos de um documento jurídico. Server component puro. */
export function LegalBlocks({ blocks }: { blocks: readonly LegalBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.t) {
          case 'p':
            return (
              <p key={i} className="mt-4 text-[15px] leading-[1.75] text-white/70 first:mt-0">
                {block.text}
              </p>
            )

          case 'ul':
            return (
              <ul key={i} className="mt-4 space-y-2">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3 text-[15px] leading-[1.7] text-white/70">
                    <span aria-hidden className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-[#00e0a4]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )

          case 'alert':
            return (
              <p
                key={i}
                className="mt-5 rounded-lg border-l-[3px] border-[#ff4d6d] bg-[#ff4d6d]/[0.08] px-4 py-3.5 text-[15px] leading-[1.7] text-[#ffc2cd]"
              >
                {block.text}
              </p>
            )

          case 'table':
            return (
              // Tabela larga não pode empurrar a página — rola dentro do próprio container.
              <div key={i} className="mt-5 -mx-1 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
                  <thead>
                    <tr className="border-b border-white/15">
                      {block.head.map((h, j) => (
                        <th key={j} className="px-3 py-2.5 font-semibold text-white/85">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j} className="border-b border-white/[0.07]">
                        {row.map((cell, k) => (
                          <td key={k} className="px-3 py-2.5 align-top leading-[1.6] text-white/65">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </>
  )
}
