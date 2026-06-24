import type { BoardState } from "@/lib/types";

/**
 * Render an 8×8 Russian Checkers board.
 * board[row][col]:  row=0 is the TOP (black side), row=7 is the bottom (white side).
 * Each cell is either null or { type: 'man' | 'king', color: 'white' | 'black' }.
 *
 * Highlights `from` and `to` squares if provided.
 */
export default function CheckersBoard({
  board,
  from,
  to,
  size = 320,
}: {
  board: BoardState | null;
  from?: { row: number; col: number } | null;
  to?: { row: number; col: number } | null;
  size?: number;
}) {
  const cell = size / 8;
  if (!board) {
    return (
      <div
        className="flex items-center justify-center text-ink-500 text-sm"
        style={{ width: size, height: size }}
      >
        нет состояния
      </div>
    );
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden ring-1 ring-white/10 shadow-royal select-none"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block">
        {/* squares */}
        {Array.from({ length: 8 }).map((_, r) =>
          Array.from({ length: 8 }).map((__, c) => {
            const dark = (r + c) % 2 === 1;
            return (
              <rect
                key={`s-${r}-${c}`}
                x={c * cell}
                y={r * cell}
                width={cell}
                height={cell}
                fill={dark ? "#1A1A26" : "#262633"}
              />
            );
          }),
        )}

        {/* file/rank labels (subtle) */}
        {Array.from({ length: 8 }).map((_, i) => (
          <g key={`lbl-${i}`}>
            <text
              x={i * cell + 4}
              y={size - 4}
              fill="#3A3A4A"
              fontSize={Math.max(8, cell * 0.18)}
              fontFamily="JetBrains Mono"
            >
              {String.fromCharCode(97 + i)}
            </text>
            <text
              x={4}
              y={i * cell + cell * 0.3}
              fill="#3A3A4A"
              fontSize={Math.max(8, cell * 0.18)}
              fontFamily="JetBrains Mono"
            >
              {8 - i}
            </text>
          </g>
        ))}

        {/* highlight from */}
        {from && (
          <rect
            x={from.col * cell}
            y={from.row * cell}
            width={cell}
            height={cell}
            fill="rgba(212,162,58,0.18)"
            stroke="#D4A23A"
            strokeWidth={1.2}
          />
        )}
        {to && (
          <rect
            x={to.col * cell}
            y={to.row * cell}
            width={cell}
            height={cell}
            fill="rgba(91,211,169,0.18)"
            stroke="#5BD3A9"
            strokeWidth={1.2}
          />
        )}

        {/* pieces */}
        {board.map((row, r) =>
          row.map((piece, c) => {
            if (!piece) return null;
            const cx = c * cell + cell / 2;
            const cy = r * cell + cell / 2;
            const radius = cell * 0.36;
            const isWhite = piece.color === "white";
            const fill = isWhite ? "url(#gWhite)" : "url(#gBlack)";
            return (
              <g key={`p-${r}-${c}`}>
                <circle
                  cx={cx}
                  cy={cy + 1.5}
                  r={radius}
                  fill="rgba(0,0,0,0.5)"
                  filter="blur(1px)"
                />
                <circle cx={cx} cy={cy} r={radius} fill={fill} />
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius * 0.7}
                  fill="none"
                  stroke={isWhite ? "rgba(11,11,16,0.18)" : "rgba(255,255,255,0.08)"}
                  strokeWidth={1}
                />
                {piece.type === "king" && (
                  <text
                    x={cx}
                    y={cy + cell * 0.07}
                    textAnchor="middle"
                    fontSize={cell * 0.38}
                    fontFamily="Fraunces, serif"
                    fontWeight="700"
                    fill={isWhite ? "#5C400A" : "#F4D17A"}
                  >
                    ♛
                  </text>
                )}
              </g>
            );
          }),
        )}

        <defs>
          <radialGradient id="gWhite" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#FFF6DC" />
            <stop offset="60%" stopColor="#F4D17A" />
            <stop offset="100%" stopColor="#8B6314" />
          </radialGradient>
          <radialGradient id="gBlack" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#3A3A4A" />
            <stop offset="60%" stopColor="#13131C" />
            <stop offset="100%" stopColor="#07070A" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
